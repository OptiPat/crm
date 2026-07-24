import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  calendarMonthsFromInscriptionToEvent,
  formatFilleulVaaDurationMonths,
  isFilleulInscribedDuringExercice,
} from "@/lib/statistiques/filleul-vaa-duration-stats";
import { isContactEligibleForFilleulParraineurStats } from "@/lib/statistiques/contact-filleul-organisation-stats";
import {
  resolveFilleulInscriptionTimestamp,
  resolveFilleulPremiereHabilitationTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";

export type FilleulHabilitationDurationListKind = "withDuration" | "missingHabilitation";

export type FilleulHabilitationDurationStatsOptions = {
  dossiersByContactId?: Map<number, FilleulDossier>;
};

export type FilleulHabilitationDurationStatResult = {
  averageMonths: number | null;
  countedCount: number;
  totalEligible: number;
  missingHabilitationCount: number;
  contactIdsWithDuration: number[];
  contactIdsMissingHabilitation: number[];
};

export function resolveFilleulInscriptionToHabilitationDurationMonths(
  contact: Pick<Contact, "id" | "date_inscription_filleul">,
  dossiersByContactId?: Map<number, FilleulDossier>
): number | null {
  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  const premiereHabilitation = resolveFilleulPremiereHabilitationTimestamp(inscription, dossier);
  return calendarMonthsFromInscriptionToEvent(inscription, premiereHabilitation);
}

function computeHabilitationDurationStatsFromEligible(
  eligible: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>
): FilleulHabilitationDurationStatResult {
  const contactIdsWithDuration: number[] = [];
  const contactIdsMissingHabilitation: number[] = [];
  let monthsSum = 0;

  for (const contact of eligible) {
    if (contact.id == null) continue;
    const months = resolveFilleulInscriptionToHabilitationDurationMonths(
      contact,
      dossiersByContactId
    );
    if (months == null) {
      contactIdsMissingHabilitation.push(contact.id);
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
    missingHabilitationCount: contactIdsMissingHabilitation.length,
    contactIdsWithDuration,
    contactIdsMissingHabilitation,
  };
}

/** Durée moyenne historique : consultants réseau avec au moins une habilitation renseignée. */
export function computeFilleulHabilitationDurationStats(
  contacts: Contact[],
  options?: FilleulHabilitationDurationStatsOptions
): FilleulHabilitationDurationStatResult {
  const eligible = contacts.filter(
    (contact) => contact.id != null && isContactEligibleForFilleulParraineurStats(contact)
  ) as Contact[];
  return computeHabilitationDurationStatsFromEligible(eligible, options?.dossiersByContactId);
}

/**
 * Durée moyenne sur l'exercice : inscriptions durant l'exercice (désinscrits inclus),
 * hors consultants sans habilitation MIOBSP / MIA / Agent Lié renseignée.
 */
export function computeFilleulHabilitationDurationExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulHabilitationDurationStatsOptions
): FilleulHabilitationDurationStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const eligible = contacts.filter(
    (contact) =>
      contact.id != null &&
      isFilleulInscribedDuringExercice(contact, exerciceLabel, dossiersByContactId)
  ) as Contact[];
  return computeHabilitationDurationStatsFromEligible(eligible, dossiersByContactId);
}

export function filterContactsForFilleulHabilitationDurationList(
  contacts: Contact[],
  kind: FilleulHabilitationDurationListKind,
  options?: FilleulHabilitationDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulParraineurStats(contact) || contact.id == null) return false;
    const hasDuration =
      resolveFilleulInscriptionToHabilitationDurationMonths(contact, dossiersByContactId) != null;
    return kind === "withDuration" ? hasDuration : !hasDuration;
  });
}

export function filterContactsForFilleulHabilitationDurationExerciceList(
  contacts: Contact[],
  kind: FilleulHabilitationDurationListKind,
  exerciceLabel: string,
  options?: FilleulHabilitationDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (
      !isFilleulInscribedDuringExercice(contact, exerciceLabel, dossiersByContactId) ||
      contact.id == null
    ) {
      return false;
    }
    const hasDuration =
      resolveFilleulInscriptionToHabilitationDurationMonths(contact, dossiersByContactId) != null;
    return kind === "withDuration" ? hasDuration : !hasDuration;
  });
}

export function formatFilleulHabilitationDurationSubtitle(
  stats: FilleulHabilitationDurationStatResult
): string {
  if (stats.totalEligible === 0) return "Aucun consultant éligible";
  if (stats.countedCount === 0) {
    return `Aucune habilitation sur ${stats.totalEligible} consultant${stats.totalEligible > 1 ? "s" : ""}`;
  }
  const missing =
    stats.missingHabilitationCount > 0
      ? ` · ${stats.missingHabilitationCount} sans habilitation`
      : "";
  return `${stats.countedCount} consultant${stats.countedCount > 1 ? "s" : ""} sur ${stats.totalEligible}${missing}`;
}

export function formatFilleulHabilitationDurationExerciceSubtitle(
  stats: FilleulHabilitationDurationStatResult,
  exerciceLabel: string
): string {
  if (stats.totalEligible === 0) return `Aucune inscription sur l'exercice ${exerciceLabel}`;
  return `${formatFilleulHabilitationDurationSubtitle(stats)} · inscriptions ${exerciceLabel}`;
}

export function formatFilleulHabilitationDurationCumulativeIndex(
  stats: FilleulHabilitationDurationStatResult
): string {
  if (stats.averageMonths == null) {
    return "— — consultants réseau (toutes périodes)";
  }
  return `${formatFilleulVaaDurationMonths(stats.averageMonths)} — ${formatFilleulHabilitationDurationSubtitle(stats)} (toutes périodes)`;
}

export { formatFilleulVaaDurationMonths as formatFilleulHabilitationDurationMonths };
