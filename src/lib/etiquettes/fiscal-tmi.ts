/** Tranches TMI standard (moteur Rust aligné). */
export const STANDARD_TMI_RATES = [0, 11, 30, 41, 45] as const;

export type StandardTmiRate = (typeof STANDARD_TMI_RATES)[number];

export type IrNetOperator = "gte" | "lte" | "eq";

export const IR_NET_OPERATOR_LABELS: Record<IrNetOperator, string> = {
  gte: "≥ (supérieur ou égal)",
  lte: "≤ (inférieur ou égal)",
  eq: "= (égal)",
};

/** Libellé affiché : « 11 % », « 0 % ». */
export function formatTmiRateLabel(rate: number): string {
  return `${rate} %`;
}

/**
 * Normalise une TMI fiche contact / import vers un taux entier standard (0, 11, 30, 41, 45).
 * Accepte « 11 », « 11% », « 11 % », « TMI 30 ». Retourne null si vide ou non reconnue.
 */
export function normalizeTmiRate(value: unknown): StandardTmiRate | null {
  if (value == null) return null;
  const raw = String(value)
    .replace(/%/g, "")
    .replace(/,/g, ".")
    .replace(/^tmi\s*:?\s*/i, "")
    .trim();
  if (!raw || raw === "-") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) > 0.01) return null;
  return (STANDARD_TMI_RATES as readonly number[]).includes(rounded)
    ? (rounded as StandardTmiRate)
    : null;
}

export interface ConditionTmiConfig {
  tranches: number[];
}

export interface ConditionIrNetConfig {
  operator: IrNetOperator;
  montant: number;
}

export function parseConditionTmiConfig(
  configJson: string | null | undefined
): ConditionTmiConfig | null {
  if (!configJson) return null;
  try {
    const parsed = JSON.parse(configJson) as { tranches?: unknown[] };
    const tranches = (parsed.tranches ?? [])
      .map((t) => normalizeTmiRate(t))
      .filter((t): t is StandardTmiRate => t != null);
    return { tranches: [...new Set(tranches)] };
  } catch {
    return null;
  }
}

export function parseConditionIrNetConfig(
  configJson: string | null | undefined
): ConditionIrNetConfig | null {
  if (!configJson) return null;
  try {
    const parsed = JSON.parse(configJson) as { operator?: string; montant?: unknown };
    const op = parsed.operator;
    const operator: IrNetOperator =
      op === "lte" || op === "eq" || op === "gte" ? op : "gte";
    const montant = Number(parsed.montant);
    if (!Number.isFinite(montant)) return null;
    return { operator, montant };
  } catch {
    return null;
  }
}
