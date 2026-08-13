/**
 * Courbe d'évolution du patrimoine total (espace client).
 * Pas de perf %, pas d'interpolation mensuelle.
 * Dernier point = total patrimoine (même règle que le hero).
 */

import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";

export interface PatrimoineEvolutionAssetInput {
  id: number;
  montant_initial?: number | null;
  date_souscription?: number | null;
  encours_actuel?: number | null;
  encours_date?: number | null;
  /**
   * Historique optionnel (centimes). S'il est fourni et non vide, il complète
   * la dérivation souscription + dernier encours.
   */
  valorisations?: Array<{ dateTs: number; montantCentimes: number }>;
}

export interface PatrimoineEvolutionPoint {
  dateTs: number;
  label: string;
  totalCentimes: number;
}

const MIN_DISTINCT_DATES = 2;

/** Jour civil local (évite de multiplier les points sur la même journée). */
export function toEvolutionDayTs(unix: number): number {
  const d = new Date(unix * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Libellé avec le jour — évite deux « août 2026 » ambigus. */
export function formatEvolutionLabel(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type AssetPoint = { dateTs: number; montantCentimes: number };

function effectiveAmount(asset: PatrimoineEvolutionAssetInput): number {
  return getEffectiveEncoursCentimes({
    encours_actuel: asset.encours_actuel ?? undefined,
    montant_initial: asset.montant_initial ?? undefined,
  });
}

/**
 * Points datés (hors point « aujourd'hui »).
 * À la souscription : montant_initial si connu, sinon l'effectif
 * (évite un trou jusqu'à la première valorisation).
 */
function buildDatedAssetPoints(asset: PatrimoineEvolutionAssetInput): AssetPoint[] {
  const byDay = new Map<number, number>();

  const push = (unix: number | null | undefined, montant: number | null | undefined) => {
    if (unix == null || montant == null || montant <= 0) return;
    byDay.set(toEvolutionDayTs(unix), montant);
  };

  if (asset.valorisations && asset.valorisations.length > 0) {
    for (const v of asset.valorisations) {
      push(v.dateTs, v.montantCentimes);
    }
  }

  const initial =
    asset.montant_initial != null && asset.montant_initial > 0
      ? asset.montant_initial
      : effectiveAmount(asset);
  push(asset.date_souscription, initial);
  push(asset.encours_date, asset.encours_actuel);

  return [...byDay.entries()]
    .map(([dateTs, montantCentimes]) => ({ dateTs, montantCentimes }))
    .sort((a, b) => a.dateTs - b.dateTs);
}

function valueAt(points: AssetPoint[], dayTs: number): number {
  if (points.length === 0 || dayTs < points[0].dateTs) return 0;
  let last = 0;
  for (const p of points) {
    if (p.dateTs > dayTs) break;
    last = p.montantCentimes;
  }
  return last;
}

/**
 * Construit la série totale. Retourne `null` s'il n'y a pas assez de dates
 * distinctes (pas de courbe trompeuse / vide).
 */
export function buildPatrimoineEvolution(
  assets: PatrimoineEvolutionAssetInput[],
  options?: { asOfUnix?: number }
): PatrimoineEvolutionPoint[] | null {
  const asOfDayTs = toEvolutionDayTs(
    options?.asOfUnix ?? Math.floor(Date.now() / 1000)
  );

  const datedTimelines: AssetPoint[][] = [];
  /** Actifs sans aucune date : ajoutés à chaque point pour coller au total. */
  let undatedTotal = 0;

  for (const asset of assets) {
    const effective = effectiveAmount(asset);
    if (effective <= 0) continue;

    const dated = buildDatedAssetPoints(asset);
    if (dated.length === 0) {
      undatedTotal += effective;
      continue;
    }

    // Point courant = encours effectif (aligné inventaire / hero), mais
    // seulement si le montant a vraiment changé. Sinon chaque ouverture
    // d'écran (ou une sync) inventait un palier « aujourd'hui » identique
    // au dernier relevé, et l'historique gonflait sans information.
    const byDay = new Map(dated.map((p) => [p.dateTs, p.montantCentimes]));
    const lastDated = dated[dated.length - 1];
    if (lastDated.montantCentimes !== effective) {
      byDay.set(asOfDayTs, effective);
    }
    datedTimelines.push(
      [...byDay.entries()]
        .map(([dateTs, montantCentimes]) => ({ dateTs, montantCentimes }))
        .sort((a, b) => a.dateTs - b.dateTs)
    );
  }

  if (datedTimelines.length === 0 && undatedTotal <= 0) return null;

  const dateSet = new Set<number>();
  for (const points of datedTimelines) {
    for (const p of points) dateSet.add(p.dateTs);
  }
  if (undatedTotal > 0) {
    dateSet.add(asOfDayTs);
  }

  const dates = [...dateSet].sort((a, b) => a - b);
  if (dates.length < MIN_DISTINCT_DATES) return null;

  return dates.map((dateTs) => ({
    dateTs,
    label: formatEvolutionLabel(dateTs),
    totalCentimes:
      undatedTotal +
      datedTimelines.reduce((sum, points) => sum + valueAt(points, dateTs), 0),
  }));
}
