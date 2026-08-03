export function formatFundPerfPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")}\u00a0%`;
}

export function formatFundShortTermScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")}`;
}

export function formatFundSharpe(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2).replace(".", ",");
}

export function formatFundNav(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2).replace(".", ",");
}

export function formatFundVlDate(unixSeconds: number | null | undefined): string {
  if (unixSeconds == null) return "—";
  return new Date(unixSeconds * 1000).toLocaleDateString("fr-FR");
}

export function formatFundFees(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2).replace(".", ",")} %`;
}

/** Couleur texte selon le signe d'une perf ou d'un score (vert / rouge / neutre). */
export function fundPerfSignTextClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "text-muted-foreground";
  if (value > 0) return "text-emerald-700 dark:text-emerald-300 font-medium";
  if (value < 0) return "text-rose-700 dark:text-rose-300 font-medium";
  return "text-muted-foreground";
}
