import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  calendarMonthsFromInscriptionToEvent,
  formatFilleulVaaDurationMonths,
} from "@/lib/statistiques/filleul-vaa-duration-stats";
import {
  isAffiliationInExercice,
  isContactEligibleForFilleulParraineurStats,
} from "@/lib/statistiques/contact-filleul-organisation-stats";
import {
  resolveFilleulInscriptionTimestamp,
  resolveFilleulPassageManagerTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";

export type FilleulManagerDurationListKind = "withDuration" | "missingManager";

export type FilleulManagerDurationStatsOptions = {
  dossiersByContactId?: Map<number, FilleulDossier>;
  organisationSelfContactId?: number | null;
};

export type FilleulManagerDurationStatResult = {
  averageMonths: number | null;
  countedCount: number;
  totalEligible: number;
  missingManagerCount: number;
  contactIdsWithDuration: number[];
  contactIdsMissingManager: number[];
};

export function resolveFilleulInscriptionToManagerDurationMonths(
  contact: Pick<Contact, "id" | "date_inscription_filleul">,
  dossiersByContactId?: Map<number, FilleulDossier>
): number | null {
  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  const passageManager = resolveFilleulPassageManagerTimestamp(dossier);
  return calendarMonthsFromInscriptionToEvent(inscription, passageManager);
}

function computeManagerDurationStatsFromEligible(
  eligible: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>
): FilleulManagerDurationStatResult {
  const contactIdsWithDuration: number[] = [];
  const contactIdsMissingManager: number[] = [];
  let monthsSum = 0;

  for (const contact of eligible) {
    if (contact.id == null) continue;
    const months = resolveFilleulInscriptionToManagerDurationMonths(contact, dossiersByContactId);
    if (months == null) {
      contactIdsMissingManager.push(contact.id);
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
    missingManagerCount: contactIdsMissingManager.length,
    contactIdsWithDuration,
    contactIdsMissingManager,
  };
}

/** Durée moyenne historique : consultants réseau avec date qualification Manager renseignée. */
export function computeFilleulManagerDurationStats(
  contacts: Contact[],
  options?: FilleulManagerDurationStatsOptions
): FilleulManagerDurationStatResult {
  const eligible = contacts.filter(
    (contact) => contact.id != null && isContactEligibleForFilleulParraineurStats(contact)
  ) as Contact[];
  return computeManagerDurationStatsFromEligible(eligible, options?.dossiersByContactId);
}

/** Qualification Manager datée dans l'exercice (inscription peut être antérieure). */
export function isFilleulManagerQualificationDuringExercice(
  contact: Contact,
  exerciceLabel: string,
  options?: FilleulManagerDurationStatsOptions
): boolean {
  if (!isContactEligibleForFilleulParraineurStats(contact)) return false;
  const dossier =
    contact.id != null ? options?.dossiersByContactId?.get(contact.id) : undefined;
  const passageManager = resolveFilleulPassageManagerTimestamp(dossier);
  return isAffiliationInExercice(passageManager, exerciceLabel);
}

/**
 * Durée moyenne sur l'exercice : qualifications Manager durant l'exercice (désinscrits inclus),
 * délai inscription → qualification Manager.
 */
export function computeFilleulManagerDurationExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulManagerDurationStatsOptions
): FilleulManagerDurationStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const eligible = contacts.filter(
    (contact) =>
      contact.id != null &&
      isFilleulManagerQualificationDuringExercice(contact, exerciceLabel, options)
  ) as Contact[];
  return computeManagerDurationStatsFromEligible(eligible, dossiersByContactId);
}

export function filterContactsForFilleulManagerDurationList(
  contacts: Contact[],
  kind: FilleulManagerDurationListKind,
  options?: FilleulManagerDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulParraineurStats(contact) || contact.id == null) return false;
    const hasDuration =
      resolveFilleulInscriptionToManagerDurationMonths(contact, dossiersByContactId) != null;
    return kind === "withDuration" ? hasDuration : !hasDuration;
  });
}

export function filterContactsForFilleulManagerDurationExerciceList(
  contacts: Contact[],
  kind: FilleulManagerDurationListKind,
  exerciceLabel: string,
  options?: FilleulManagerDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (
      !isFilleulManagerQualificationDuringExercice(contact, exerciceLabel, options) ||
      contact.id == null
    ) {
      return false;
    }
    const hasDuration =
      resolveFilleulInscriptionToManagerDurationMonths(contact, dossiersByContactId) != null;
    return kind === "withDuration" ? hasDuration : !hasDuration;
  });
}

export function formatFilleulManagerDurationSubtitle(
  stats: FilleulManagerDurationStatResult
): string {
  if (stats.totalEligible === 0) return "Aucun consultant éligible";
  if (stats.countedCount === 0) {
    return `Aucune qualification Manager sur ${stats.totalEligible} consultant${stats.totalEligible > 1 ? "s" : ""}`;
  }
  const missing =
    stats.missingManagerCount > 0
      ? ` · ${stats.missingManagerCount} sans date qualification Manager`
      : "";
  return `${stats.countedCount} consultant${stats.countedCount > 1 ? "s" : ""} sur ${stats.totalEligible}${missing}`;
}

export function formatFilleulManagerDurationExerciceSubtitle(
  stats: FilleulManagerDurationStatResult,
  exerciceLabel: string
): string {
  if (stats.totalEligible === 0) {
    return `Aucune qualification Manager sur l'exercice ${exerciceLabel}`;
  }
  return `${formatFilleulManagerDurationSubtitle(stats)} · qualifications Manager ${exerciceLabel}`;
}

export function formatFilleulManagerDurationCumulativeIndex(
  stats: FilleulManagerDurationStatResult
): string {
  if (stats.averageMonths == null) {
    return "— — consultants réseau (toutes périodes)";
  }
  return `${formatFilleulVaaDurationMonths(stats.averageMonths)} — ${formatFilleulManagerDurationSubtitle(stats)} (toutes périodes)`;
}

export { formatFilleulVaaDurationMonths as formatFilleulManagerDurationMonths };
