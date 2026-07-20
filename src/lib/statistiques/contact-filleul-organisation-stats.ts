import type { Contact } from "@/lib/api/tauri-contacts";
import { isDeFactoManagerFilleul } from "@/lib/contacts/contact-filleul-rank-match";
import { isFilleulStatut, isPrescripteurCategorie } from "@/lib/contacts/contact-form-utils";
import { contactOwnVolume } from "@/lib/organisation/organisation-branch-volumes";

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

function hasFilleulVolumeRecorded(
  contact: Pick<Contact, "filleul_volume">
): contact is Pick<Contact, "filleul_volume"> & { filleul_volume: number } {
  const volume = contact.filleul_volume;
  return volume != null && Number.isFinite(volume);
}

/** Volume propre moyen de l'exercice en cours — filleuls inscrits, tous parrains. Absence = 0 €. */
export function computeFilleulAverageVolumeStats(contacts: Contact[]): FilleulAverageVolumeStatResult {
  const eligible = contacts.filter(
    (contact) => contact.id != null && isContactEligibleForFilleulOrganisationStats(contact)
  ) as Contact[];
  const totalEligible = eligible.length;

  if (totalEligible === 0) {
    return {
      averageVolume: null,
      countedCount: 0,
      totalEligible: 0,
      missingVolumeCount: 0,
      contactIds: [],
    };
  }

  let volumeSum = 0;
  let missingVolumeCount = 0;
  const contactIds: number[] = [];

  for (const contact of eligible) {
    if (!hasFilleulVolumeRecorded(contact)) missingVolumeCount += 1;
    volumeSum += contactOwnVolume(contact);
    contactIds.push(contact.id!);
  }

  return {
    averageVolume: volumeSum / totalEligible,
    countedCount: totalEligible,
    totalEligible,
    missingVolumeCount,
    contactIds,
  };
}

export function filterContactsForFilleulVolumeList(
  contacts: Contact[],
  kind: FilleulVolumeListKind
): Contact[] {
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulOrganisationStats(contact)) return false;
    const hasVolume = hasFilleulVolumeRecorded(contact);
    return kind === "withVolume" ? hasVolume : !hasVolume;
  });
}

export function formatFilleulAverageVolumeSubtitle(stats: FilleulAverageVolumeStatResult): string {
  if (stats.totalEligible === 0) return "Aucun filleul inscrit";
  const missing =
    stats.missingVolumeCount > 0
      ? ` · ${stats.missingVolumeCount} compté${stats.missingVolumeCount > 1 ? "s" : ""} à 0 €`
      : "";
  return `Calculé sur ${stats.totalEligible} filleul${stats.totalEligible > 1 ? "s" : ""}${missing}`;
}

/** Filleul parrainé compté pour le taux (inscrits, désinscrits, prospects — suspects exclus). */
export function isFilleulParrainableDownline(
  contact: Pick<Contact, "categorie" | "filleul_categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  return (
    filleulCat === "FILLEUL" ||
    filleulCat === "FILLEUL_DESINSCRIT" ||
    filleulCat === "PROSPECT_FILLEUL"
  );
}

function buildParrainIdsWithFilleulDownline(contacts: Contact[]): Set<number> {
  const parrainIds = new Set<number>();
  for (const contact of contacts) {
    if (contact.parrain_id == null || !isFilleulParrainableDownline(contact)) continue;
    parrainIds.add(contact.parrain_id);
  }
  return parrainIds;
}

/** Taux de parraineurs = filleuls inscrits ayant parrainé au moins 1 filleul (désinscrits inclus). */
export function computeFilleulParraineurStats(contacts: Contact[]): FilleulParraineurStatResult {
  const parrainIdsWithDownline = buildParrainIdsWithFilleulDownline(contacts);
  const parraineurContactIds: number[] = [];
  const otherContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForFilleulOrganisationStats(contact) || contact.id == null) continue;
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

export function filterContactsForFilleulParraineurList(
  contacts: Contact[],
  kind: FilleulParraineurListKind
): Contact[] {
  const parrainIdsWithDownline = buildParrainIdsWithFilleulDownline(contacts);
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulOrganisationStats(contact) || contact.id == null) return false;
    const isParraineur = parrainIdsWithDownline.has(contact.id);
    return kind === "parraineur" ? isParraineur : !isParraineur;
  });
}

export function formatFilleulParraineurSubtitle(stats: FilleulParraineurStatResult): string {
  return `${stats.parraineurCount}/${stats.totalCount} filleuls inscrits`;
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
