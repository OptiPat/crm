import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  isAffiliationInExercice,
  isContactEligibleForFilleulParraineurStats,
  isFilleulParrainableDownline,
} from "@/lib/statistiques/contact-filleul-organisation-stats";
import {
  calendarMonthsFromInscriptionToEvent,
  formatFilleulVaaDurationMonths,
} from "@/lib/statistiques/filleul-vaa-duration-stats";
import { resolveFilleulInscriptionTimestamp } from "@/lib/organisation/organisation-filleul-dossier";

export type FilleulParrainageDurationListKind = "withDuration" | "missingParrainage";

export type FilleulParrainageDurationStatsOptions = {
  dossiersByContactId?: Map<number, FilleulDossier>;
  organisationSelfContactId?: number | null;
};

export type FilleulParrainageDurationStatResult = {
  averageMonths: number | null;
  countedCount: number;
  totalEligible: number;
  missingParrainageCount: number;
  contactIdsWithDuration: number[];
  contactIdsMissingParrainage: number[];
};

/** Date d'inscription du premier filleul parrainé (hors invitation prospect seule). */
export function resolveFirstParrainageInscriptionUnix(
  parrainId: number,
  contacts: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>
): number | null {
  let earliest: number | null = null;

  for (const contact of contacts) {
    if (contact.parrain_id !== parrainId || !isFilleulParrainableDownline(contact)) continue;
    const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
    const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
    if (inscription == null) continue;
    if (earliest == null || inscription < earliest) earliest = inscription;
  }

  return earliest;
}

export function resolveFilleulInscriptionToParrainageDurationMonths(
  contact: Pick<Contact, "id" | "date_inscription_filleul">,
  contacts: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>
): number | null {
  if (contact.id == null) return null;
  const dossier = dossiersByContactId?.get(contact.id);
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  const firstParrainage = resolveFirstParrainageInscriptionUnix(
    contact.id,
    contacts,
    dossiersByContactId
  );
  return calendarMonthsFromInscriptionToEvent(inscription, firstParrainage);
}

/** Consultant dont le 1er parrainage (inscription filleul) est daté dans l'exercice. */
export function isFilleulFirstParrainageDuringExercice(
  contact: Contact,
  exerciceLabel: string,
  contacts: Contact[],
  options?: FilleulParrainageDurationStatsOptions
): boolean {
  if (contact.id == null) return false;
  const { dossiersByContactId, organisationSelfContactId } = options ?? {};
  const firstParrainage = resolveFirstParrainageInscriptionUnix(
    contact.id,
    contacts,
    dossiersByContactId
  );
  const eventDuringExercice = isAffiliationInExercice(firstParrainage, exerciceLabel);

  if (
    organisationSelfContactId != null &&
    contact.id === organisationSelfContactId
  ) {
    return eventDuringExercice;
  }

  if (!isContactEligibleForFilleulParraineurStats(contact)) return false;
  return eventDuringExercice;
}

function computeParrainageDurationStatsFromEligible(
  contacts: Contact[],
  eligible: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>
): FilleulParrainageDurationStatResult {
  const contactIdsWithDuration: number[] = [];
  const contactIdsMissingParrainage: number[] = [];
  let monthsSum = 0;

  for (const contact of eligible) {
    if (contact.id == null) continue;
    const months = resolveFilleulInscriptionToParrainageDurationMonths(
      contact,
      contacts,
      dossiersByContactId
    );
    if (months == null) {
      contactIdsMissingParrainage.push(contact.id);
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
    missingParrainageCount: contactIdsMissingParrainage.length,
    contactIdsWithDuration,
    contactIdsMissingParrainage,
  };
}

/** Durée moyenne historique : consultants réseau ayant parrainé au moins une fois. */
export function computeFilleulParrainageDurationStats(
  contacts: Contact[],
  options?: FilleulParrainageDurationStatsOptions
): FilleulParrainageDurationStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const eligible = contacts.filter(
    (contact) => contact.id != null && isContactEligibleForFilleulParraineurStats(contact)
  ) as Contact[];
  return computeParrainageDurationStatsFromEligible(contacts, eligible, dossiersByContactId);
}

/**
 * Durée moyenne sur l'exercice : 1ers parrainages durant l'exercice (désinscrits inclus),
 * délai inscription → inscription du 1er filleul parrainé.
 */
export function computeFilleulParrainageDurationExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulParrainageDurationStatsOptions
): FilleulParrainageDurationStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const eligible = contacts.filter(
    (contact) =>
      contact.id != null &&
      isFilleulFirstParrainageDuringExercice(contact, exerciceLabel, contacts, options)
  ) as Contact[];
  return computeParrainageDurationStatsFromEligible(contacts, eligible, dossiersByContactId);
}

export function filterContactsForFilleulParrainageDurationList(
  contacts: Contact[],
  kind: FilleulParrainageDurationListKind,
  options?: FilleulParrainageDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulParraineurStats(contact) || contact.id == null) return false;
    const hasDuration =
      resolveFilleulInscriptionToParrainageDurationMonths(
        contact,
        contacts,
        dossiersByContactId
      ) != null;
    return kind === "withDuration" ? hasDuration : !hasDuration;
  });
}

export function filterContactsForFilleulParrainageDurationExerciceList(
  contacts: Contact[],
  kind: FilleulParrainageDurationListKind,
  exerciceLabel: string,
  options?: FilleulParrainageDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (
      !isFilleulFirstParrainageDuringExercice(contact, exerciceLabel, contacts, options) ||
      contact.id == null
    ) {
      return false;
    }
    const hasDuration =
      resolveFilleulInscriptionToParrainageDurationMonths(
        contact,
        contacts,
        dossiersByContactId
      ) != null;
    return kind === "withDuration" ? hasDuration : !hasDuration;
  });
}

export function formatFilleulParrainageDurationSubtitle(
  stats: FilleulParrainageDurationStatResult
): string {
  if (stats.totalEligible === 0) return "Aucun consultant éligible";
  if (stats.countedCount === 0) {
    return `Aucun parrainage sur ${stats.totalEligible} consultant${stats.totalEligible > 1 ? "s" : ""}`;
  }
  const missing =
    stats.missingParrainageCount > 0
      ? ` · ${stats.missingParrainageCount} sans parrainage`
      : "";
  return `${stats.countedCount} consultant${stats.countedCount > 1 ? "s" : ""} sur ${stats.totalEligible}${missing}`;
}

export function formatFilleulParrainageDurationExerciceSubtitle(
  stats: FilleulParrainageDurationStatResult,
  exerciceLabel: string
): string {
  if (stats.totalEligible === 0) {
    return `Aucun 1er parrainage sur l'exercice ${exerciceLabel}`;
  }
  return `${formatFilleulParrainageDurationSubtitle(stats)} · 1ers parrainages ${exerciceLabel}`;
}

export function formatFilleulParrainageDurationCumulativeIndex(
  stats: FilleulParrainageDurationStatResult
): string {
  if (stats.averageMonths == null) {
    return "— — consultants réseau (toutes périodes)";
  }
  return `${formatFilleulVaaDurationMonths(stats.averageMonths)} — ${formatFilleulParrainageDurationSubtitle(stats)} (toutes périodes)`;
}

export { formatFilleulVaaDurationMonths as formatFilleulParrainageDurationMonths };
