import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { isDeFactoManagerFilleul } from "@/lib/contacts/contact-filleul-rank-match";
import { isFilleulStatut, isPrescripteurCategorie } from "@/lib/contacts/contact-form-utils";
import { contactOwnVolume } from "@/lib/organisation/organisation-branch-volumes";
import {
  wasConsultantInNetworkDuringExercice,
  wasInscribedConsultantDuringExercice,
} from "@/lib/organisation/organisation-exercice-membership";
import {
  resolveFilleulInscriptionTimestamp,
  resolveFilleulDesinscriptionTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";
import { fiscalYearEndUnix, fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";

export type FilleulOrganisationListKind = "manager" | "other";
export type FilleulVolumeListKind = "withVolume" | "missingVolume";
export type FilleulParraineurListKind = "parraineur" | "other";
export type FilleulBridgeListKind = "bridge" | "other";

export type FilleulOrganisationStatsOptions = {
  /** Contact « Moi » — filtre les filleuls hors réseau direct. */
  selfContactId?: number | null;
};

export type FilleulManagerStatResult = {
  totalCount: number;
  managerCount: number;
  managerPercent: number;
  managerContactIds: number[];
  otherContactIds: number[];
};

export type FilleulAverageVolumeStatResult = {
  averageVolume: number | null;
  /** Part des consultants présents avec volume propre ≥ 1 € (%). */
  activePercent: number;
  countedCount: number;
  totalEligible: number;
  missingVolumeCount: number;
  contactIds: number[];
};

export type FilleulParraineurStatResult = {
  totalCount: number;
  parraineurCount: number;
  parraineurPercent: number;
  parraineurContactIds: number[];
  otherContactIds: number[];
};

export type FilleulParraineurStatsOptions = {
  /** Dossiers filleul pour dates d'inscription / invitation (downlines). */
  dossiersByContactId?: Map<number, FilleulDossier>;
  /** Filleuls sans parrain_id rattachés à ce contact dans les stats parrainage. */
  organisationSelfContactId?: number | null;
};

export type FilleulExerciceStatsOptions = FilleulParraineurStatsOptions & {
  /** Contact « Moi » (CGP) — toujours compté comme consultant inscrit. */
  organisationSelfContactId?: number | null;
};

export type FilleulBridgeStatResult = {
  totalCount: number;
  bridgeCount: number;
  bridgePercent: number;
  bridgeContactIds: number[];
  otherContactIds: number[];
};

function contactEffectiveFilleulCategorie(
  contact: Pick<Contact, "filleul_categorie" | "categorie">
): string | null | undefined {
  if (contact.filleul_categorie) return contact.filleul_categorie;
  if (isFilleulStatut(contact.categorie)) return contact.categorie;
  return null;
}

/** Filleul inscrit (non désinscrit) — tous parrains, suspects exclus. */
export function isContactEligibleForFilleulOrganisationStats(
  contact: Pick<Contact, "categorie" | "filleul_categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  return contactEffectiveFilleulCategorie(contact) === "FILLEUL";
}

/** Base taux de parraineurs : inscrits + désinscrits (tous parrains, suspects exclus). */
export function isContactEligibleForFilleulParraineurStats(
  contact: Pick<Contact, "categorie" | "filleul_categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  return filleulCat === "FILLEUL" || filleulCat === "FILLEUL_DESINSCRIT";
}

export function isFilleulManagerInOrganisation(
  contact: Pick<Contact, "filleul_titre" | "filleul_qualification">
): boolean {
  return isDeFactoManagerFilleul(contact.filleul_titre, contact.filleul_qualification);
}

export function computeFilleulManagerStats(contacts: Contact[]): FilleulManagerStatResult {
  const managerContactIds: number[] = [];
  const otherContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForFilleulOrganisationStats(contact) || contact.id == null) continue;
    if (isFilleulManagerInOrganisation(contact)) {
      managerContactIds.push(contact.id);
    } else {
      otherContactIds.push(contact.id);
    }
  }

  const totalCount = managerContactIds.length + otherContactIds.length;
  const managerCount = managerContactIds.length;

  return {
    totalCount,
    managerCount,
    managerPercent: totalCount > 0 ? (managerCount / totalCount) * 100 : 0,
    managerContactIds,
    otherContactIds,
  };
}

export function filterContactsForFilleulOrganisationList(
  contacts: Contact[],
  kind: FilleulOrganisationListKind
): Contact[] {
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulOrganisationStats(contact)) return false;
    const isManager = isFilleulManagerInOrganisation(contact);
    return kind === "manager" ? isManager : !isManager;
  });
}

export function formatFilleulManagerPercent(percent: number): string {
  return `${percent.toFixed(1).replace(".0", "")} %`;
}

export function formatFilleulManagerSubtitle(stats: FilleulManagerStatResult): string {
  return `${stats.managerCount}/${stats.totalCount} filleuls inscrits`;
}

/** Volume propre minimal pour être « consultant actif » sur l'exercice (€). */
export const FILLEUL_ACTIVE_CONSULTANT_MIN_VOLUME_EUROS = 1;

/** Consultant actif = au moins 1 € de volume propre sur l'exercice en cours. */
export function isFilleulActiveConsultantForVolume(
  contact: Pick<Contact, "filleul_volume">
): boolean {
  const volume = contact.filleul_volume;
  if (volume == null || !Number.isFinite(volume) || volume < FILLEUL_ACTIVE_CONSULTANT_MIN_VOLUME_EUROS) {
    return false;
  }
  return true;
}

/** Volume propre moyen par consultant actif — filleuls inscrits, tous parrains. */
function computeAverageVolumeFromEligibleContacts(
  eligible: Contact[]
): FilleulAverageVolumeStatResult {
  const totalEligible = eligible.length;

  if (totalEligible === 0) {
    return {
      averageVolume: null,
      activePercent: 0,
      countedCount: 0,
      totalEligible: 0,
      missingVolumeCount: 0,
      contactIds: [],
    };
  }

  let volumeSum = 0;
  let activeCount = 0;
  let missingVolumeCount = 0;
  const contactIds: number[] = [];

  for (const contact of eligible) {
    const ownVolume = contactOwnVolume(contact);
    if (isFilleulActiveConsultantForVolume(contact)) {
      volumeSum += ownVolume;
      activeCount += 1;
    } else {
      missingVolumeCount += 1;
    }
    contactIds.push(contact.id!);
  }

  return {
    averageVolume: activeCount > 0 ? volumeSum / activeCount : null,
    activePercent: (activeCount / totalEligible) * 100,
    countedCount: activeCount,
    totalEligible,
    missingVolumeCount,
    contactIds,
  };
}

export function computeFilleulAverageVolumeStats(contacts: Contact[]): FilleulAverageVolumeStatResult {
  const eligible = contacts.filter(
    (contact) => contact.id != null && isContactEligibleForFilleulOrganisationStats(contact)
  ) as Contact[];
  return computeAverageVolumeFromEligibleContacts(eligible);
}

/**
 * Volume propre moyen sur l'exercice : uniquement les consultants présents sur la période
 * (inscrits ou désinscrits selon dates dossier), actifs = ≥ 1 € de volume propre.
 */
export function computeFilleulAverageVolumeExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulExerciceStatsOptions
): FilleulAverageVolumeStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const membershipOptions = {
    dossiersByContactId,
    organisationSelfContactId: options?.organisationSelfContactId,
  };
  const eligible = contacts.filter(
    (contact) =>
      contact.id != null &&
      wasInscribedConsultantDuringExercice(contact, exerciceLabel, membershipOptions)
  ) as Contact[];
  return computeAverageVolumeFromEligibleContacts(eligible);
}

export function filterContactsForFilleulVolumeList(
  contacts: Contact[],
  kind: FilleulVolumeListKind
): Contact[] {
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulOrganisationStats(contact)) return false;
    const isActive = isFilleulActiveConsultantForVolume(contact);
    return kind === "withVolume" ? isActive : !isActive;
  });
}

export function filterContactsForFilleulVolumeExerciceList(
  contacts: Contact[],
  kind: FilleulVolumeListKind,
  exerciceLabel: string,
  options?: FilleulExerciceStatsOptions
): Contact[] {
  const membershipOptions = {
    dossiersByContactId: options?.dossiersByContactId,
    organisationSelfContactId: options?.organisationSelfContactId,
  };
  return contacts.filter((contact) => {
    if (
      !wasInscribedConsultantDuringExercice(contact, exerciceLabel, membershipOptions)
    ) {
      return false;
    }
    const isActive = isFilleulActiveConsultantForVolume(contact);
    return kind === "withVolume" ? isActive : !isActive;
  });
}

export function formatFilleulAverageVolumeSubtitle(stats: FilleulAverageVolumeStatResult): string {
  if (stats.totalEligible === 0) return "Aucun consultant éligible";
  if (stats.countedCount === 0) {
    return `Aucun consultant actif sur ${stats.totalEligible} consultant${stats.totalEligible > 1 ? "s" : ""}`;
  }
  const inactive =
    stats.missingVolumeCount > 0
      ? ` · ${stats.missingVolumeCount} inactif${stats.missingVolumeCount > 1 ? "s" : ""}`
      : "";
  return `${stats.countedCount} consultant${stats.countedCount > 1 ? "s" : ""} actif${stats.countedCount > 1 ? "s" : ""} sur ${stats.totalEligible}${inactive}`;
}

export function formatFilleulAverageVolumeExerciceSubtitle(
  stats: FilleulAverageVolumeStatResult,
  exerciceLabel: string
): string {
  if (stats.totalEligible === 0) return `Aucun consultant sur l'exercice ${exerciceLabel}`;
  const base = formatFilleulAverageVolumeSubtitle(stats);
  return `${base} · ${exerciceLabel}`;
}

/** Filleul inscrit ou désinscrit parrainé (prospects et suspects exclus — le parrainage = inscription filleul). */
export function isFilleulParrainableDownline(
  contact: Pick<Contact, "categorie" | "filleul_categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  return filleulCat === "FILLEUL" || filleulCat === "FILLEUL_DESINSCRIT";
}

export const EMPTY_FILLEUL_AVERAGE_VOLUME_STATS: FilleulAverageVolumeStatResult = {
  averageVolume: null,
  activePercent: 0,
  countedCount: 0,
  totalEligible: 0,
  missingVolumeCount: 0,
  contactIds: [],
};

export function resolveEffectiveDownlineParrainId(
  contact: Pick<Contact, "parrain_id">,
  organisationSelfContactId?: number | null
): number | null {
  if (contact.parrain_id != null) return contact.parrain_id;
  if (organisationSelfContactId != null) return organisationSelfContactId;
  return null;
}

function buildParrainIdsWithFilleulDownline(
  contacts: Contact[],
  organisationSelfContactId?: number | null
): Set<number> {
  const parrainIds = new Set<number>();
  for (const contact of contacts) {
    if (!isFilleulParrainableDownline(contact)) continue;
    const parrainId = resolveEffectiveDownlineParrainId(contact, organisationSelfContactId);
    if (parrainId == null) continue;
    parrainIds.add(parrainId);
  }
  return parrainIds;
}

/** Date d'inscription réseau du filleul parrainé (le parrainage = passage filleul inscrit). */
export function resolveDownlineAffiliationUnix(
  contact: Pick<
    Contact,
    "id" | "date_inscription_filleul" | "date_invitation_filleul" | "filleul_categorie" | "categorie"
  >,
  dossiersByContactId?: Map<number, FilleulDossier>
): number | null {
  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  return inscription ?? null;
}

export function isAffiliationInExercice(
  affiliationUnix: number | null | undefined,
  exerciceLabel: string
): boolean {
  if (affiliationUnix == null || !Number.isFinite(affiliationUnix)) return false;
  const start = fiscalYearStartUnix(exerciceLabel);
  const end = fiscalYearEndUnix(exerciceLabel);
  if (start == null || end == null) return false;
  return affiliationUnix >= start && affiliationUnix <= end;
}

export { wasConsultantInNetworkDuringExercice };

/**
 * Consultant dans la cohorte au 1er jour de l'exercice : inscrit au plus tard ce jour-là,
 * et pas encore désinscrit avant le début de l'exercice.
 */
export function wasConsultantPresentAtExerciceStart(
  contact: Pick<
    Contact,
    "id" | "categorie" | "filleul_categorie" | "date_inscription_filleul"
  >,
  exerciceLabel: string,
  dossiersByContactId?: Map<number, FilleulDossier>
): boolean {
  if (!isContactEligibleForFilleulParraineurStats(contact)) return false;

  const start = fiscalYearStartUnix(exerciceLabel);
  if (start == null) return true;

  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  if (inscription != null && inscription > start) return false;

  const desinscription = resolveFilleulDesinscriptionTimestamp(dossier);
  if (desinscription != null && desinscription < start) return false;

  return true;
}

function buildParrainIdsWithExerciceDownline(
  contacts: Contact[],
  exerciceLabel: string,
  dossiersByContactId?: Map<number, FilleulDossier>,
  organisationSelfContactId?: number | null
): Set<number> {
  const parrainIds = new Set<number>();
  for (const contact of contacts) {
    if (!isFilleulParrainableDownline(contact)) continue;
    const affiliation = resolveDownlineAffiliationUnix(contact, dossiersByContactId);
    if (!isAffiliationInExercice(affiliation, exerciceLabel)) continue;
    const parrainId = resolveEffectiveDownlineParrainId(contact, organisationSelfContactId);
    if (parrainId == null) continue;
    parrainIds.add(parrainId);
  }
  return parrainIds;
}

function computeParraineurStatsFromParrainIds(
  contacts: Contact[],
  parrainIdsWithDownline: Set<number>,
  isEligible: (contact: Contact) => boolean
): FilleulParraineurStatResult {
  const parraineurContactIds: number[] = [];
  const otherContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isEligible(contact) || contact.id == null) continue;
    if (parrainIdsWithDownline.has(contact.id)) {
      parraineurContactIds.push(contact.id);
    } else {
      otherContactIds.push(contact.id);
    }
  }

  const totalCount = parraineurContactIds.length + otherContactIds.length;
  const parraineurCount = parraineurContactIds.length;

  return {
    totalCount,
    parraineurCount,
    parraineurPercent: totalCount > 0 ? (parraineurCount / totalCount) * 100 : 0,
    parraineurContactIds,
    otherContactIds,
  };
}

/** Taux cumulé (historique) = consultants réseau ayant parrainé au moins 1 filleul (toutes périodes). */
export function computeFilleulParraineurStats(
  contacts: Contact[],
  options?: FilleulParraineurStatsOptions
): FilleulParraineurStatResult {
  return computeParraineurStatsFromParrainIds(
    contacts,
    buildParrainIdsWithFilleulDownline(contacts, options?.organisationSelfContactId),
    isContactEligibleForFilleulParraineurStats
  );
}

/**
 * Taux de parraineurs sur l'exercice : consultants présents sur l'exercice ayant parrainé
 * au moins un filleul inscrit dont la date d'inscription tombe dans l'exercice fiscal
 * (filleuls parrainés désinscrits inclus ; prospects exclus).
 */
export function computeFilleulParraineurExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulParraineurStatsOptions
): FilleulParraineurStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const parrainIds = buildParrainIdsWithExerciceDownline(
    contacts,
    exerciceLabel,
    dossiersByContactId,
    options?.organisationSelfContactId
  );
  const isEligible = (contact: Contact) =>
    wasConsultantInNetworkDuringExercice(contact, exerciceLabel, dossiersByContactId);
  return computeParraineurStatsFromParrainIds(contacts, parrainIds, isEligible);
}

export function filterContactsForFilleulParraineurList(
  contacts: Contact[],
  kind: FilleulParraineurListKind,
  options?: FilleulParraineurStatsOptions
): Contact[] {
  const parrainIdsWithDownline = buildParrainIdsWithFilleulDownline(
    contacts,
    options?.organisationSelfContactId
  );
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulParraineurStats(contact) || contact.id == null) return false;
    const isParraineur = parrainIdsWithDownline.has(contact.id);
    return kind === "parraineur" ? isParraineur : !isParraineur;
  });
}

export function filterContactsForFilleulParraineurExerciceList(
  contacts: Contact[],
  kind: FilleulParraineurListKind,
  exerciceLabel: string,
  options?: FilleulParraineurStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  const parrainIdsWithDownline = buildParrainIdsWithExerciceDownline(
    contacts,
    exerciceLabel,
    dossiersByContactId,
    options?.organisationSelfContactId
  );
  return contacts.filter((contact) => {
    if (
      !wasConsultantInNetworkDuringExercice(contact, exerciceLabel, dossiersByContactId) ||
      contact.id == null
    ) {
      return false;
    }
    const isParraineur = parrainIdsWithDownline.has(contact.id);
    return kind === "parraineur" ? isParraineur : !isParraineur;
  });
}

export function formatFilleulParraineurSubtitle(stats: FilleulParraineurStatResult): string {
  return `${stats.parraineurCount}/${stats.totalCount} consultants réseau`;
}

export function formatFilleulParraineurExerciceSubtitle(
  stats: FilleulParraineurStatResult,
  exerciceLabel: string
): string {
  return `${stats.parraineurCount}/${stats.totalCount} consultants sur l'exercice · ${exerciceLabel}`;
}

export function formatFilleulParraineurCumulativeIndex(stats: FilleulParraineurStatResult): string {
  return `${formatFilleulManagerPercent(stats.parraineurPercent)} — ${formatFilleulParraineurSubtitle(stats)} (toutes périodes)`;
}

/** Filleul inscrit ou désinscrit du réseau direct (parrain = CGP). */
export function isContactEligibleForFilleulBridgeBaseStats(
  contact: Pick<Contact, "categorie" | "filleul_categorie" | "parrain_id">,
  selfContactId?: number | null
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  if (filleulCat !== "FILLEUL" && filleulCat !== "FILLEUL_DESINSCRIT") return false;
  if (selfContactId == null) return false;
  return contact.parrain_id === selfContactId;
}

/** Double rôle réseau ↔ patrimoine : filleul + statut client ou prospect client. */
export function isFilleulClientBridgeContact(
  contact: Pick<Contact, "categorie" | "statut_suivi">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  return contact.categorie === "CLIENT" || contact.categorie === "PROSPECT_CLIENT";
}

/** Pont réseau ↔ patrimoine — filleuls directs (inscrits + désinscrits) ayant aussi un rôle client. */
export function computeFilleulClientBridgeStats(
  contacts: Contact[],
  options?: FilleulOrganisationStatsOptions
): FilleulBridgeStatResult {
  const selfContactId = options?.selfContactId;
  const bridgeContactIds: number[] = [];
  const otherContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForFilleulBridgeBaseStats(contact, selfContactId) || contact.id == null) {
      continue;
    }
    if (isFilleulClientBridgeContact(contact)) {
      bridgeContactIds.push(contact.id);
    } else {
      otherContactIds.push(contact.id);
    }
  }

  const totalCount = bridgeContactIds.length + otherContactIds.length;
  const bridgeCount = bridgeContactIds.length;

  return {
    totalCount,
    bridgeCount,
    bridgePercent: totalCount > 0 ? (bridgeCount / totalCount) * 100 : 0,
    bridgeContactIds,
    otherContactIds,
  };
}

export function filterContactsForFilleulBridgeList(
  contacts: Contact[],
  kind: FilleulBridgeListKind,
  options?: FilleulOrganisationStatsOptions
): Contact[] {
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulBridgeBaseStats(contact, options?.selfContactId)) return false;
    const isBridge = isFilleulClientBridgeContact(contact);
    return kind === "bridge" ? isBridge : !isBridge;
  });
}

export function formatFilleulBridgeSubtitle(stats: FilleulBridgeStatResult): string {
  return `${stats.bridgeCount}/${stats.totalCount} filleuls directs`;
}
