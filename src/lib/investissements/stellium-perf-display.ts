/** Perf % Stellium = perf € / versements nets × 100 (relevé assureur, pas versements bruts CRM). */
export function computeStelliumPerfPctFromStored(
  perfEuroCentimes: number | null | undefined,
  versementsNetsCentimes: number | null | undefined
): number | null {
  if (perfEuroCentimes == null || versementsNetsCentimes == null || versementsNetsCentimes <= 0) {
    return null;
  }
  return (perfEuroCentimes / versementsNetsCentimes) * 100;
}

export function formatStelliumPerfPctLabel(
  perfEuroCentimes: number | null | undefined,
  versementsNetsCentimes: number | null | undefined
): string | null {
  const pct = computeStelliumPerfPctFromStored(perfEuroCentimes, versementsNetsCentimes);
  if (pct == null) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}
