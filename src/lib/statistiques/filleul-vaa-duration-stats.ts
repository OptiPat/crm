import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  isAffiliationInExercice,
  isContactEligibleForFilleulParraineurStats,
} from "@/lib/statistiques/contact-filleul-organisation-stats";
import {
  resolveFilleulInscriptionTimestamp,
  resolveFilleulPremierVaaOuVaTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";

export type FilleulVaaDurationListKind = "withDuration" | "missingVaa";

export type FilleulVaaDurationStatsOptions = {
  dossiersByContactId?: Map<number, FilleulDossier>;
  organisationSelfContactId?: number | null;
};

export type FilleulVaaDurationStatResult = {
  averageMonths: number | null;
  countedCount: number;
  totalEligible: number;
  missingVaaCount: number;
  contactIdsWithDuration: number[];
  contactIdsMissingVaa: number[];
};

/** Mois calendaires UTC entre deux dates (jour de fin inclus si même mois). */
export function calendarMonthsBetweenUnix(fromUnix: number, toUnix: number): number {
  if (!Number.isFinite(fromUnix) || !Number.isFinite(toUnix) || toUnix < fromUnix) return 0;

  const from = new Date(fromUnix * 1000);
  const to = new Date(toUnix * 1000);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Délai inscription → étape ; null si date manquante ou antérieure à l'inscription. */
export function calendarMonthsFromInscriptionToEvent(
  inscriptionUnix: number | null | undefined,
  eventUnix: number | null | undefined
): number | null {
  if (
    inscriptionUnix == null ||
    eventUnix == null ||
    !Number.isFinite(inscriptionUnix) ||
    !Number.isFinite(eventUnix) ||
    eventUnix < inscriptionUnix
  ) {
    return null;
  }
  return calendarMonthsBetweenUnix(inscriptionUnix, eventUnix);
}

export function resolveFilleulInscriptionToVaaDurationMonths(
  contact: Pick<Contact, "id" | "date_inscription_filleul">,
  dossiersByContactId?: Map<number, FilleulDossier>
): number | null {
  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  const premierVaa = resolveFilleulPremierVaaOuVaTimestamp(dossier);
  return calendarMonthsFromInscriptionToEvent(inscription, premierVaa);
}

export function isFilleulInscribedDuringExercice(
  contact: Contact,
  exerciceLabel: string,
  options?: {
    dossiersByContactId?: Map<number, FilleulDossier>;
    organisationSelfContactId?: number | null;
  } | Map<number, FilleulDossier>
): boolean {
  const normalized =
    options instanceof Map
      ? { dossiersByContactId: options }
      : (options ?? {});
  const { dossiersByContactId, organisationSelfContactId } = normalized;
  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  const inscribedDuringExercice = isAffiliationInExercice(inscription, exerciceLabel);

  if (
    organisationSelfContactId != null &&
    contact.id === organisationSelfContactId
  ) {
    return inscribedDuringExercice;
  }

  if (!isContactEligibleForFilleulParraineurStats(contact)) return false;
  return inscribedDuringExercice;
}

function computeVaaDurationStatsFromEligible(
  eligible: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>
): FilleulVaaDurationStatResult {
  const contactIdsWithDuration: number[] = [];
  const contactIdsMissingVaa: number[] = [];
  let monthsSum = 0;

  for (const contact of eligible) {
    if (contact.id == null) continue;
    const months = resolveFilleulInscriptionToVaaDurationMonths(contact, dossiersByContactId);
    if (months == null) {
      contactIdsMissingVaa.push(contact.id);
      continue;
    }
    contactIdsWithDuration.push(contact.id);
    monthsSum += months;
  }

  const countedCount = contactIdsWithDuration.length;
  const totalEligible = eligible.length;

  return {
    averageMonths: countedCount > 0 ? monthsSum / countedCount : null,
    countedCount,
    totalEligible,
    missingVaaCount: contactIdsMissingVaa.length,
    contactIdsWithDuration,
    contactIdsMissingVaa,
  };
}

/** Durée moyenne historique : consultants réseau (inscrits + désinscrits) avec date 1er VAA/VA renseignée. */
export function computeFilleulVaaDurationStats(
  contacts: Contact[],
  options?: FilleulVaaDurationStatsOptions
): FilleulVaaDurationStatResult {
  const eligible = contacts.filter(
    (contact) => contact.id != null && isContactEligibleForFilleulParraineurStats(contact)
  ) as Contact[];
  return computeVaaDurationStatsFromEligible(eligible, options?.dossiersByContactId);
}

/**
 * Durée moyenne sur l'exercice : consultants inscrits durant l'exercice (désinscrits inclus),
 * hors ceux sans date 1er VAA/VA renseignée dans le dossier.
 */
export function computeFilleulVaaDurationExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulVaaDurationStatsOptions
): FilleulVaaDurationStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const eligible = contacts.filter(
    (contact) =>
      contact.id != null &&
      isFilleulInscribedDuringExercice(contact, exerciceLabel, options)
  ) as Contact[];
  return computeVaaDurationStatsFromEligible(eligible, dossiersByContactId);
}

export function filterContactsForFilleulVaaDurationList(
  contacts: Contact[],
  kind: FilleulVaaDurationListKind,
  options?: FilleulVaaDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulParraineurStats(contact) || contact.id == null) return false;
    const hasDuration =
      resolveFilleulInscriptionToVaaDurationMonths(contact, dossiersByContactId) != null;
    return kind === "withDuration" ? hasDuration : !hasDuration;
  });
}

export function filterContactsForFilleulVaaDurationExerciceList(
  contacts: Contact[],
  kind: FilleulVaaDurationListKind,
  exerciceLabel: string,
  options?: FilleulVaaDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (
      !isFilleulInscribedDuringExercice(contact, exerciceLabel, options) ||
      contact.id == null
    ) {
      return false;
    }
    const hasDuration =
      resolveFilleulInscriptionToVaaDurationMonths(contact, dossiersByContactId) != null;
    return kind === "withDuration" ? hasDuration : !hasDuration;
  });
}

export function formatFilleulVaaDurationMonths(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const label = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return `${label} mois`;
}

export function formatFilleulVaaDurationSubtitle(stats: FilleulVaaDurationStatResult): string {
  if (stats.totalEligible === 0) return "Aucun consultant éligible";
  if (stats.countedCount === 0) {
    return `Aucune date 1er VAA/VA sur ${stats.totalEligible} consultant${stats.totalEligible > 1 ? "s" : ""}`;
  }
  const missing =
    stats.missingVaaCount > 0
      ? ` · ${stats.missingVaaCount} sans date 1er VAA/VA`
      : "";
  return `${stats.countedCount} consultant${stats.countedCount > 1 ? "s" : ""} sur ${stats.totalEligible}${missing}`;
}

export function formatFilleulVaaDurationExerciceSubtitle(
  stats: FilleulVaaDurationStatResult,
  exerciceLabel: string
): string {
  if (stats.totalEligible === 0) return `Aucune inscription sur l'exercice ${exerciceLabel}`;
  const base = formatFilleulVaaDurationSubtitle(stats);
  return `${base} · inscriptions ${exerciceLabel}`;
}

export function formatFilleulVaaDurationCumulativeIndex(stats: FilleulVaaDurationStatResult): string {
  if (stats.averageMonths == null) {
    return "— — consultants réseau (toutes périodes)";
  }
  return `${formatFilleulVaaDurationMonths(stats.averageMonths)} — ${formatFilleulVaaDurationSubtitle(stats)} (toutes périodes)`;
}
