import { ReactNode } from "react";

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

export function ChartLoading({ height = 360 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-muted-foreground text-sm"
      style={{ height }}
    >
      Chargement…
    </div>
  );
}

export function ChartEmpty({
  height = 360,
  title,
  subtitle,
}: {
  height?: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="flex items-center justify-center text-muted-foreground"
      style={{ height }}
    >
      <div className="text-center px-4">
        <p className="font-medium text-foreground/80">{title}</p>
        {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

export function ChartTooltipBox({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-border text-sm">
      {children}
    </div>
  );
}

export interface LegendItem {
  name: string;
  value: number;
  color: string;
  formatValue?: (v: number) => string;
}

export function ChartLegendGrid({
  items,
  total,
  columns = 2,
  maxHeight = "9rem",
}: {
  items: LegendItem[];
  total: number;
  columns?: 1 | 2 | 3;
  maxHeight?: string;
}) {
  const colClass =
    columns === 3
      ? "sm:grid-cols-3"
      : columns === 1
        ? "grid-cols-1"
        : "sm:grid-cols-2";

  return (
    <div className="border-t pt-3 overflow-y-auto pr-1" style={{ maxHeight }}>
      <div className={`grid grid-cols-1 ${colClass} gap-x-4 gap-y-2 text-xs`}>
        {items.map((item) => {
          const valueLabel = item.formatValue
            ? item.formatValue(item.value)
            : String(item.value);
          const pct = formatDashboardPercent(item.value, total);
          return (
            <div
              key={item.name}
              className="flex items-center gap-2 min-w-0"
              title={`${item.name} — ${valueLabel} (${pct})`}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-black/5"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate flex-1 text-foreground/90">{item.name}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">{pct}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardSectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-sm font-semibold uppercase tracking-wide text-muted-foreground ${className}`}
    >
      {children}
    </h3>
  );
}
