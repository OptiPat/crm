import { parseEuroInput } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import type { ScpiAnnexeSouscription } from "@/lib/souscription-cif/scpi-annexe-souscriptions";

/** Coefficients EMT (lignes 07110 + 07130 + 07140) — taux × montant souscrit. */
export type ScpiEmtCostCoefficients = {
  line07110: number;
  line07130: number;
  line07140: number;
};

/**
 * Taux EMT par SCPI (07110 + 07130 + 07140 si présente).
 * NCAP Régions : coefficients EMT document DIC.
 */
export const SCPI_EMT_PRODUCT_COST_COEFFICIENTS: Readonly<
  Record<string, ScpiEmtCostCoefficients>
> = {
  alta_convictions: { line07110: 0.0011, line07130: 0.0049, line07140: 0 },
  comete: { line07110: 0.0066, line07130: 0.0267, line07140: 0 },
  corum_origin: { line07110: 0.0089, line07130: 0.0073, line07140: 0 },
  epargne_pierre_europe: { line07110: 0, line07130: 0.0145, line07140: 0 },
  epargne_pierre: { line07110: 0.0052, line07130: 0.0165, line07140: 0 },
  ncap_regions: { line07110: 0.005901398, line07130: 0.0145, line07140: 0 },
  osmo_energie: { line07110: 0.0059, line07130: 0.0273, line07140: 0 },
  transitions_europe: { line07110: 0, line07130: 0.0147, line07140: 0 },
};

export function getScpiEmtProductCostRate(productKey: string): number | null {
  const coeffs = SCPI_EMT_PRODUCT_COST_COEFFICIENTS[productKey];
  if (!coeffs) return null;
  return coeffs.line07110 + coeffs.line07130 + coeffs.line07140;
}

/** Somme des coûts produits EMT (€) pour les souscriptions avec montant et taux connus. */
export function sumProductCostsFromSouscriptions(
  souscriptions: readonly ScpiAnnexeSouscription[]
): number | null {
  let total = 0;
  let hasAny = false;
  for (const row of souscriptions) {
    const montant = parseEuroInput(row.montantSouscritEur);
    if (montant == null) continue;
    const rate = getScpiEmtProductCostRate(row.productKey);
    if (rate == null) continue;
    total += montant * rate;
    hasAny = true;
  }
  return hasAny ? total : null;
}

/** Montant souscrit cumulé — SCPI avec coefficients EMT uniquement. */
export function sumMontantSouscritWithEmtFromSouscriptions(
  souscriptions: readonly ScpiAnnexeSouscription[]
): number | null {
  let total = 0;
  let hasAny = false;
  for (const row of souscriptions) {
    const montant = parseEuroInput(row.montantSouscritEur);
    if (montant == null) continue;
    if (getScpiEmtProductCostRate(row.productKey) == null) continue;
    total += montant;
    hasAny = true;
  }
  return hasAny ? total : null;
}

/**
 * % produits = somme pondérée des taux EMT (07110 + 07130 + 07140).
 * Ex. Comète seule : 0,0066 + 0,0267 = 3,33 %.
 */
export function computeProductCostsPercentRatio(
  souscriptions: readonly ScpiAnnexeSouscription[]
): number | null {
  const costs = sumProductCostsFromSouscriptions(souscriptions);
  const montantEmt = sumMontantSouscritWithEmtFromSouscriptions(souscriptions);
  if (costs == null || montantEmt == null || montantEmt <= 0) return null;
  return costs / montantEmt;
}
