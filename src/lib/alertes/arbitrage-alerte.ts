/** Alerte patrimoine : suivi arbitrage AV/PER « avec moi ». */

export const ALERTE_TYPE_ARBITRAGE_AV_PER = "ARBITRAGE_AV_PER";

export function isAlerteArbitrageAvPer(typeAlerte: string): boolean {
  return typeAlerte === ALERTE_TYPE_ARBITRAGE_AV_PER;
}

export function isArbitrageSuiviEligible(
  typeProduit: string,
  origine: string,
  statut?: string
): boolean {
  return (
    (statut ?? "ACTIF") === "ACTIF" &&
    origine === "MON_CONSEIL" &&
    (typeProduit === "ASSURANCE_VIE" || typeProduit === "PER")
  );
}
