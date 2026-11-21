import { effectivePvForRemuneration } from "@/lib/pipe/remuneration-pv";
import { remunerationFraisDeduitsPct } from "@/lib/pipe/remuneration-scpi-frais";

/** Valeur du filtre « tous les exercices ». */
export const REMUNERATION_ALL_EXERCICES = "ALL";

function formatNumberFr(value: number, maxDecimals = 3): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: maxDecimals })
    .format(value)
    .replace(/ | /g, " ");
}

/**
 * Détail lisible du calcul, ex. « (50 000 € − 10 %) × 0,5 × 7 % » ou « 70 000 € × 0,4 × 7 % ».
 * `null` si le calcul est impossible (PV ou TPC manquant).
 */
export function remunerationCalcDetail(options: {
  montantCentimes: number;
  typeProduit: string;
  productLabel?: string | null;
  cifEnabled: boolean;
  pvManual?: number | null;
  tpcPercent: number | null;
}): string | null {
  const { montantCentimes, typeProduit, productLabel, cifEnabled, pvManual, tpcPercent } = options;
  if (tpcPercent == null || !Number.isFinite(montantCentimes) || montantCentimes <= 0) return null;
  const pv = effectivePvForRemuneration({ typeProduit, cifEnabled, pvManual });
  if (pv == null || pv <= 0) return null;
  const montant = `${formatNumberFr(montantCentimes / 100, 2)} €`;
  const frais = remunerationFraisDeduitsPct({ typeProduit, productLabel });
  const assiette = frais != null ? `(${montant} − ${formatNumberFr(frais)} %)` : montant;
  return `${assiette} × ${formatNumberFr(pv)} × ${formatNumberFr(tpcPercent)} %`;
}

/** Lignes regroupées par affaire, dans l'ordre de première apparition. */
export function groupRemunerationRowsByAffaire<T extends { pipeId: number }>(
  rows: readonly T[]
): Array<{ pipeId: number; rows: T[] }> {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const existing = groups.get(row.pipeId);
    if (existing) existing.push(row);
    else groups.set(row.pipeId, [row]);
  }
  return [...groups.entries()].map(([pipeId, groupRows]) => ({ pipeId, rows: groupRows }));
}

/** Exercices présents, du plus récent au plus ancien (« 2025-2026 » > « 2024-2025 »). */
export function remunerationExerciceOptions(labels: readonly string[]): string[] {
  return [...new Set(labels)].sort((a, b) => b.localeCompare(a));
}

/** Exercice affiché par défaut : l'exercice en cours s'il a des lignes, sinon le plus récent. */
export function defaultRemunerationExercice(options: readonly string[], current: string): string {
  if (options.includes(current)) return current;
  return options[0] ?? REMUNERATION_ALL_EXERCICES;
}
