export const DASHBOARD_PRIMARY = "#1E3A5F";
export const CHART_GRID_STROKE = "#e5e7eb";
export const CHART_AXIS_STROKE = "#6b7280";

export function formatDashboardCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDashboardPercent(value: number, total: number) {
  if (total <= 0) return "0 %";
  return `${((value / total) * 100).toFixed(1)} %`;
}
