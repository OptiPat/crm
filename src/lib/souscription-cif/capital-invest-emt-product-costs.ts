import {
  computeCapitalInvestMontantSouscrit,
  type CapitalInvestAnnexeSouscription,
} from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";

/** Parse une valeur fichier EMT (coefficient décimal, sans % — ex. 0,005 = 0,5 %). */
export function parseEmtCoefficientInput(value: string): number | null {
  const trimmed = value
    .trim()
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Taux EMT cumulé (07110 + 07130 + 07140) — même convention que `scpi-emt-product-costs.ts`
 * (coefficient × montant souscrit, pas un % à ressaisir).
 */
export function getCapitalInvestEmtProductCostRate(
  row: Pick<
    CapitalInvestAnnexeSouscription,
    "emtLine07110Pct" | "emtLine07130Pct" | "emtLine07140Pct"
  >
): number | null {
  const c07110 = parseEmtCoefficientInput(row.emtLine07110Pct ?? "");
  const c07130 = parseEmtCoefficientInput(row.emtLine07130Pct ?? "");
  const c07140 = parseEmtCoefficientInput(row.emtLine07140Pct ?? "");
  if (c07110 == null && c07130 == null && c07140 == null) return null;
  return (c07110 ?? 0) + (c07130 ?? 0) + (c07140 ?? 0);
}

/** Somme des coûts produits EMT (€) pour les souscriptions avec montant et taux saisis. */
export function sumCapitalInvestProductCostsFromSouscriptions(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): number | null {
  let total = 0;
  let hasAny = false;
  for (const row of souscriptions) {
    const montant = computeCapitalInvestMontantSouscrit(row);
    if (montant == null) continue;
    const rate = getCapitalInvestEmtProductCostRate(row);
    if (rate == null) continue;
    total += montant * rate;
    hasAny = true;
  }
  return hasAny ? total : null;
}

/** Montant souscrit cumulé — lignes avec au moins un taux EMT renseigné. */
export function sumMontantCapitalInvestWithEmtFromSouscriptions(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): number | null {
  let total = 0;
  let hasAny = false;
  for (const row of souscriptions) {
    const montant = computeCapitalInvestMontantSouscrit(row);
    if (montant == null) continue;
    if (getCapitalInvestEmtProductCostRate(row) == null) continue;
    total += montant;
    hasAny = true;
  }
  return hasAny ? total : null;
}

/** % produits = coûts EMT cumulés / montants souscrits concernés. */
export function computeCapitalInvestProductCostsPercentRatio(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): number | null {
  const costs = sumCapitalInvestProductCostsFromSouscriptions(souscriptions);
  const montantEmt = sumMontantCapitalInvestWithEmtFromSouscriptions(souscriptions);
  if (costs == null || montantEmt == null || montantEmt <= 0) return null;
  return costs / montantEmt;
}
