import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  isContactEligibleForFilleulParraineurStats,
  isFilleulParrainableDownline,
  isAffiliationInExercice,
  resolveDownlineAffiliationUnix,
  wasConsultantInNetworkDuringExercice,
  type FilleulParraineurStatsOptions,
} from "@/lib/statistiques/contact-filleul-organisation-stats";

export type FilleulParrainagePerParraineurListKind = "parraines" | "parraineur";

export type FilleulParrainagePerParraineurStatResult = {
  averagePerParraineur: number | null;
  totalParrainages: number;
  parraineurCount: number;
  totalEligible: number;
  parraineurContactIds: number[];
  otherContactIds: number[];
};

function countParrainagesByParrainId(
  contacts: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>,
  exerciceLabel?: string
): { totalParrainages: number; countsByParrainId: Map<number, number> } {
  const countsByParrainId = new Map<number, number>();
  let totalParrainages = 0;

  for (const contact of contacts) {
    if (contact.parrain_id == null || !isFilleulParrainableDownline(contact)) continue;
    if (exerciceLabel != null) {
      const affiliation = resolveDownlineAffiliationUnix(contact, dossiersByContactId);
      if (!isAffiliationInExercice(affiliation, exerciceLabel)) continue;
    }
    totalParrainages += 1;
    const parrainId = contact.parrain_id;
    countsByParrainId.set(parrainId, (countsByParrainId.get(parrainId) ?? 0) + 1);
  }

  return { totalParrainages, countsByParrainId };
}

function computeFromParrainageCounts(
  contacts: Contact[],
  countsByParrainId: Map<number, number>,
  totalParrainages: number,
  isEligible: (contact: Contact) => boolean
): FilleulParrainagePerParraineurStatResult {
  const parraineurContactIds: number[] = [];
  const otherContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isEligible(contact) || contact.id == null) continue;
    const count = countsByParrainId.get(contact.id) ?? 0;
    if (count > 0) {
      parraineurContactIds.push(contact.id);
    } else {
      otherContactIds.push(contact.id);
    }
  }

  const parraineurCount = parraineurContactIds.length;
  const totalEligible = parraineurContactIds.length + otherContactIds.length;

  return {
    averagePerParraineur:
      parraineurCount > 0 ? totalParrainages / parraineurCount : null,
    totalParrainages,
    parraineurCount,
    totalEligible,
    parraineurContactIds,
    otherContactIds,
  };
}

/** Moyenne historique : parrainages / parraineur (consultants ayant parrainé au moins une fois). */
export function computeFilleulParrainagePerParraineurStats(
  contacts: Contact[]
): FilleulParrainagePerParraineurStatResult {
  const { totalParrainages, countsByParrainId } = countParrainagesByParrainId(contacts);
  return computeFromParrainageCounts(
    contacts,
    countsByParrainId,
    totalParrainages,
    (contact) => isContactEligibleForFilleulParraineurStats(contact)
  );
}

/**
 * Moyenne sur l'exercice : parrainages dont l'affiliation tombe dans l'exercice /
 * parraineurs ayant parrainé durant l'exercice (cohorte consultants présents sur la période).
 */
export function computeFilleulParrainagePerParraineurExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulParraineurStatsOptions
): FilleulParrainagePerParraineurStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const { totalParrainages, countsByParrainId } = countParrainagesByParrainId(
    contacts,
    dossiersByContactId,
    exerciceLabel
  );
  return computeFromParrainageCounts(
    contacts,
    countsByParrainId,
    totalParrainages,
    (contact) => wasConsultantInNetworkDuringExercice(contact, exerciceLabel, dossiersByContactId)
  );
}

/** Filleuls parrainés dont l'affiliation tombe dans l'exercice (les parrainages comptés). */
export function filterContactsForFilleulParrainagesExerciceList(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulParraineurStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (contact.parrain_id == null || !isFilleulParrainableDownline(contact)) return false;
    const affiliation = resolveDownlineAffiliationUnix(contact, dossiersByContactId);
    return isAffiliationInExercice(affiliation, exerciceLabel);
  });
}

export function filterContactsForFilleulParrainagePerParraineurExerciceList(
  contacts: Contact[],
  kind: FilleulParrainagePerParraineurListKind,
  exerciceLabel: string,
  options?: FilleulParraineurStatsOptions
): Contact[] {
  if (kind === "parraines") {
    return filterContactsForFilleulParrainagesExerciceList(contacts, exerciceLabel, options);
  }
  const dossiersByContactId = options?.dossiersByContactId;
  const { countsByParrainId } = countParrainagesByParrainId(
    contacts,
    dossiersByContactId,
    exerciceLabel
  );
  return contacts.filter((contact) => {
    if (
      !wasConsultantInNetworkDuringExercice(contact, exerciceLabel, dossiersByContactId) ||
      contact.id == null
    ) {
      return false;
    }
    return (countsByParrainId.get(contact.id) ?? 0) > 0;
  });
}

export function formatFilleulParrainagePerParraineur(value: number): string {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatFilleulParrainagePerParraineurSubtitle(
  stats: FilleulParrainagePerParraineurStatResult
): string {
  if (stats.parraineurCount === 0) {
    return `Aucun parraineur · ${stats.totalParrainages} parrainage${stats.totalParrainages > 1 ? "s" : ""}`;
  }
  return `${stats.totalParrainages} parrainage${stats.totalParrainages > 1 ? "s" : ""} · ${stats.parraineurCount} parraineur${stats.parraineurCount > 1 ? "s" : ""}`;
}

export function formatFilleulParrainagePerParraineurExerciceSubtitle(
  stats: FilleulParrainagePerParraineurStatResult,
  exerciceLabel: string
): string {
  if (stats.totalEligible === 0) return `Aucun consultant sur l'exercice ${exerciceLabel}`;
  return `${formatFilleulParrainagePerParraineurSubtitle(stats)} · ${stats.totalEligible} consultant${stats.totalEligible > 1 ? "s" : ""} sur l'exercice`;
}

export function formatFilleulParrainagePerParraineurCumulativeIndex(
  stats: FilleulParrainagePerParraineurStatResult
): string {
  if (stats.averagePerParraineur == null) {
    return "— — consultants réseau (toutes périodes)";
  }
  return `${formatFilleulParrainagePerParraineur(stats.averagePerParraineur)} — ${formatFilleulParrainagePerParraineurSubtitle(stats)} (toutes périodes)`;
}
