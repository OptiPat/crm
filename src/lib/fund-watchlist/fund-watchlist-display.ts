export function formatFundPerfPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")}\u00a0%`;
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
