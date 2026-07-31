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

export type FilleulParrainageDurationListKind =
  | "withDuration"
  | "missingParrainage"
  | "incoherentTimeline";

export type FilleulParrainageDurationStatsOptions = {
  dossiersByContactId?: Map<number, FilleulDossier>;
  organisationSelfContactId?: number | null;
};

export type FilleulParrainageDurationStatResult = {
  averageMonths: number | null;
  countedCount: number;
  totalEligible: number;
  missingParrainageCount: number;
  incoherentTimelineCount: number;
  contactIdsWithDuration: number[];
  contactIdsMissingParrainage: number[];
  contactIdsIncoherentTimeline: number[];
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

export type FilleulParrainageDurationContactKind =
  | "withDuration"
  | "missingParrainage"
  | "incoherentTimeline";

export function classifyFilleulParrainageDurationContact(
  contact: Pick<Contact, "id" | "date_inscription_filleul">,
  contacts: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>
): FilleulParrainageDurationContactKind {
  if (contact.id == null) return "missingParrainage";
  const dossier = dossiersByContactId?.get(contact.id);
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  const firstParrainage = resolveFirstParrainageInscriptionUnix(
    contact.id,
    contacts,
    dossiersByContactId
  );
  if (firstParrainage == null || inscription == null) return "missingParrainage";
  if (firstParrainage < inscription) return "incoherentTimeline";
  return "withDuration";
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
  const contactIdsIncoherentTimeline: number[] = [];
  let monthsSum = 0;

  for (const contact of eligible) {
    if (contact.id == null) continue;
    const kind = classifyFilleulParrainageDurationContact(contact, contacts, dossiersByContactId);
    if (kind === "incoherentTimeline") {
      contactIdsIncoherentTimeline.push(contact.id);
      continue;
    }
    if (kind === "missingParrainage") {
      contactIdsMissingParrainage.push(contact.id);
      continue;
    }
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
    incoherentTimelineCount: contactIdsIncoherentTimeline.length,
    contactIdsWithDuration,
    contactIdsMissingParrainage,
    contactIdsIncoherentTimeline,
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

function matchesParrainageDurationListKind(
  kind: FilleulParrainageDurationListKind,
  contactKind: FilleulParrainageDurationContactKind
): boolean {
  return kind === contactKind;
}

export function filterContactsForFilleulParrainageDurationList(
  contacts: Contact[],
  kind: FilleulParrainageDurationListKind,
  options?: FilleulParrainageDurationStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulParraineurStats(contact) || contact.id == null) return false;
    const contactKind = classifyFilleulParrainageDurationContact(
      contact,
      contacts,
      dossiersByContactId
    );
    return matchesParrainageDurationListKind(kind, contactKind);
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
    const contactKind = classifyFilleulParrainageDurationContact(
      contact,
      contacts,
      dossiersByContactId
    );
    return matchesParrainageDurationListKind(kind, contactKind);
  });
}

export function formatFilleulParrainageDurationSubtitle(
  stats: FilleulParrainageDurationStatResult
): string {
  if (stats.totalEligible === 0) return "Aucun consultant éligible";
  if (stats.countedCount === 0) {
    const parts: string[] = [];
    if (stats.incoherentTimelineCount > 0) {
      parts.push(
        `${stats.incoherentTimelineCount} date${stats.incoherentTimelineCount > 1 ? "s" : ""} incohérente${stats.incoherentTimelineCount > 1 ? "s" : ""}`
      );
    }
    if (stats.missingParrainageCount > 0) {
      parts.push(
        `${stats.missingParrainageCount} sans parrainage inscrit`
      );
    }
    if (parts.length === 0) {
      return `Aucun parrainage sur ${stats.totalEligible} consultant${stats.totalEligible > 1 ? "s" : ""}`;
    }
    return `${parts.join(" · ")} sur ${stats.totalEligible} consultant${stats.totalEligible > 1 ? "s" : ""}`;
  }
  const extras: string[] = [];
  if (stats.missingParrainageCount > 0) {
    extras.push(`${stats.missingParrainageCount} sans parrainage`);
  }
  if (stats.incoherentTimelineCount > 0) {
    extras.push(`${stats.incoherentTimelineCount} incohérent${stats.incoherentTimelineCount > 1 ? "s" : ""}`);
  }
  const extra = extras.length > 0 ? ` · ${extras.join(" · ")}` : "";
  return `${stats.countedCount} consultant${stats.countedCount > 1 ? "s" : ""} sur ${stats.totalEligible}${extra}`;
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
