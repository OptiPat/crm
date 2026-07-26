import type { Contact } from "@/lib/api/tauri-contacts";
import { wasConsultantInNetworkDuringExercice } from "@/lib/organisation/organisation-exercice-membership";
import {
  type FilleulAttritionExerciceStatsOptions,
} from "@/lib/statistiques/contact-attrition-stats";
import { previousFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";

export type FilleulNetGrowthListKind = "current" | "previous";

export type FilleulNetGrowthStatResult = {
  currentCount: number;
  previousCount: number;
  previousExerciceLabel: string | null;
  netGrowth: number;
  growthPercent: number | null;
  currentContactIds: number[];
  previousContactIds: number[];
};

/**
 * Croissance nette : variation en % du nombre de consultants présents sur l'exercice
 * (inscrits ou désinscrits selon dates dossier) par rapport à l'exercice précédent.
 */
export function computeFilleulNetGrowthExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulAttritionExerciceStatsOptions
): FilleulNetGrowthStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const previousExerciceLabel = previousFiscalYearLabel(exerciceLabel);

  const currentContactIds: number[] = [];
  const previousContactIds: number[] = [];

  for (const contact of contacts) {
    if (contact.id == null) continue;
    if (wasConsultantInNetworkDuringExercice(contact, exerciceLabel, dossiersByContactId)) {
      currentContactIds.push(contact.id);
    }
    if (
      previousExerciceLabel != null &&
      wasConsultantInNetworkDuringExercice(contact, previousExerciceLabel, dossiersByContactId)
    ) {
      previousContactIds.push(contact.id);
    }
  }

  const currentCount = currentContactIds.length;
  const previousCount = previousContactIds.length;
  const netGrowth = currentCount - previousCount;
  const growthPercent = previousCount > 0 ? (netGrowth / previousCount) * 100 : null;

  return {
    currentCount,
    previousCount,
    previousExerciceLabel,
    netGrowth,
    growthPercent,
    currentContactIds,
    previousContactIds,
  };
}

export function filterContactsForFilleulNetGrowthExerciceList(
  contacts: Contact[],
  kind: FilleulNetGrowthListKind,
  exerciceLabel: string,
  previousExerciceLabel: string | null,
  options?: FilleulAttritionExerciceStatsOptions
): Contact[] {
  const targetLabel = kind === "current" ? exerciceLabel : previousExerciceLabel;
  if (targetLabel == null) return [];
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter(
    (contact) =>
      contact.id != null &&
      wasConsultantInNetworkDuringExercice(contact, targetLabel, dossiersByContactId)
  );
}

export function formatFilleulNetGrowthSigned(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value).toLocaleString("fr-FR");
  return value > 0 ? `+${abs}` : `−${abs}`;
}

export function formatFilleulNetGrowthPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0 %";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

export function formatFilleulNetGrowthExerciceSubtitle(
  stats: FilleulNetGrowthStatResult,
  exerciceLabel: string
): string {
  if (stats.previousExerciceLabel == null) {
    return `${stats.currentCount} consultant${stats.currentCount > 1 ? "s" : ""} · exercice ${exerciceLabel}`;
  }
  return `${stats.previousCount} consultant${stats.previousCount > 1 ? "s" : ""} (${stats.previousExerciceLabel}) → ${stats.currentCount} (${exerciceLabel})`;
}
