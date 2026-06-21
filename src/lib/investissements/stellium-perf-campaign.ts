import type {
  DiscoverStelliumPerfCampaignPrepareResponse,
  PrepareStelliumPerfCampaignInput,
  PrepareStelliumPerfCampaignResult,
} from "@/lib/api/tauri-stellium-perf-campaign";
import {
  discoverStelliumPerfCampaignPrepareInput,
  discoverResponseToPrepareInput,
  prepareStelliumPerfCampaign,
} from "@/lib/api/tauri-stellium-perf-campaign";
import type { StelliumImportPreviewLine } from "@/lib/investissements/stellium-contrats-import";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";

/** Aligné sur `STELLIUM_PERF_TEMPLATE_NOM` (Rust). */
export const STELLIUM_PERF_TEMPLATE_NOM = "Performance AV/PER Stellium";
/** Aligné sur `STELLIUM_PERF_TEMPLATE_TU_NOM` (Rust). */
export const STELLIUM_PERF_TEMPLATE_TU_NOM = "Performance AV/PER Stellium (tu)";

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

export function isStelliumPerfEmailTemplate(nom: string | null | undefined): boolean {
  const value = nom?.trim() ?? "";
  return value === STELLIUM_PERF_TEMPLATE_NOM || value === STELLIUM_PERF_TEMPLATE_TU_NOM;
}

/** Libellé période à partir de la date de valorisation Stellium (ex. « Juin 2026 »). */
export function stelliumPerfPeriodeLabelFromIso(iso?: string): string {
  if (!iso?.trim()) return "Relevé Stellium";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Relevé Stellium";
  return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function stelliumPerfPeriodeLabelFromUnix(unix: number): string {
  const d = new Date(unix * 1000);
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

export function buildStelliumImportPrepareInput(
  lines: StelliumImportPreviewLine[],
  investissementIds: number[]
): PrepareStelliumPerfCampaignInput | null {
  if (investissementIds.length === 0) return null;
  const releveDateUnix = inferStelliumReleveDateUnix(lines, investissementIds);
  if (releveDateUnix == null) return null;
  const periodeLine = lines.find(
    (l) =>
      l.investissementId != null &&
      investissementIds.includes(l.investissementId) &&
      l.dateValorisationIso
  );
  return {
    periode: stelliumPerfPeriodeLabelFromIso(periodeLine?.dateValorisationIso),
    releveDateUnix,
    investissementIds,
  };
}

export async function executePrepareStelliumPerfCampaign(
  input: PrepareStelliumPerfCampaignInput
): Promise<PrepareStelliumPerfCampaignResult> {
  const result = await prepareStelliumPerfCampaign(input);
  notifyEtiquettesChanged();
  return result;
}

export async function prepareStelliumPerfCampaignFromLatestReleve(): Promise<PrepareStelliumPerfCampaignResult> {
  const draft: DiscoverStelliumPerfCampaignPrepareResponse | null =
    await discoverStelliumPerfCampaignPrepareInput();
  if (!draft?.investissementIds.length) {
    throw new Error("NO_STELLIUM_RELEVE");
  }
  return executePrepareStelliumPerfCampaign(discoverResponseToPrepareInput(draft));
}
