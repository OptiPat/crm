import type { StelliumImportPreviewLine } from "@/lib/investissements/stellium-contrats-import";

const MOIS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

/** Libellé période à partir de la date de valorisation Stellium (ex. « Juin 2026 »). */
export function stelliumPerfPeriodeLabelFromIso(iso?: string): string {
  if (!iso?.trim()) return "Relevé Stellium";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Relevé Stellium";
  return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function collectStelliumCampaignInvestissementIds(
  lines: StelliumImportPreviewLine[]
): number[] {
  const ids = new Set<number>();
  for (const line of lines) {
    if (line.investissementId != null) {
      ids.add(line.investissementId);
    }
  }
  return [...ids];
}

export function inferStelliumReleveDateUnix(
  lines: StelliumImportPreviewLine[],
  investissementIds?: number[]
): number | null {
  const filter = investissementIds?.length ? new Set(investissementIds) : null;
  const dates = new Set<number>();
  for (const line of lines) {
    if (filter != null) {
      if (line.investissementId == null || !filter.has(line.investissementId)) continue;
    }
    if (!line.dateValorisationIso) continue;
    const ms = new Date(line.dateValorisationIso).getTime();
    if (Number.isFinite(ms)) dates.add(Math.floor(ms / 1000));
  }
  if (dates.size === 0) return null;
  if (dates.size > 1) return null;
  return [...dates][0]!;
}
