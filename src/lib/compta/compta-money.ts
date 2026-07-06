export function formatComptaMoney(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/** Format utilisé dans l'export PDF ComptaZen. */
export function formatComptaMoneyPdf(amount: number): string {
  return `${amount.toFixed(2).replace(".", ",")} €`;
}

export function roundComptaMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function computeDepenseHt(ttc: number, tva: number): number {
  return roundComptaMoney(ttc - tva);
}

export function computeEncaissementTotals(
  exonere: number,
  ht: number,
  tva: number,
  don: number
): { ttc: number; total: number } {
  const ttc = roundComptaMoney(ht + tva);
  const total = roundComptaMoney(exonere + ttc - don);
  return { ttc, total };
}

/** TVA incluse dans un montant TTC (boutons 0 / 5.5 / 10 / 20 %). */
export function computeTvaFromTtc(ttc: number, ratePercent: number): number {
  if (ratePercent <= 0 || ttc <= 0) return 0;
  return roundComptaMoney((ttc * ratePercent) / (100 + ratePercent));
}
