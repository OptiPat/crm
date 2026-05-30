import { useEffect, useState, useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from "recharts";
import { getMonthlyStats, MonthlyStats } from "@/lib/api/tauri-dashboard";
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  ChartEmpty,
  ChartLoading,
  ChartTooltipBox,
  DashboardPanel,
  DASHBOARD_PRIMARY,
} from "./dashboard-ui";

export function MonthlyChart() {
  const [data, setData] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);

  const totalYear = useMemo(
    () => data.reduce((s, d) => s + (d.nouveaux ?? 0), 0),
    [data]
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setData(await getMonthlyStats());
      } catch (error) {
        console.error("Erreur statistiques mensuelles:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <DashboardPanel
      title="Nouveaux contacts"
      description={
        !loading && data.length > 0
          ? `12 derniers mois · ${totalYear} au total`
          : "12 derniers mois"
      }
      className="h-full"
    >
        {loading ? (
          <ChartLoading height={300} />
        ) : data.length === 0 ? (
          <ChartEmpty height={300} title="Aucune donnée à afficher" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="monthlyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={DASHBOARD_PRIMARY} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={DASHBOARD_PRIMARY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="month"
                stroke={CHART_AXIS_STROKE}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={CHART_AXIS_STROKE}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={36}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const v = payload[0].value as number;
                  return (
                    <ChartTooltipBox>
                      <p className="font-medium">{payload[0].payload.month}</p>
                      <p className="text-primary font-semibold">
                        {v} nouveau{v > 1 ? "x" : ""} contact{v > 1 ? "s" : ""}
                      </p>
                    </ChartTooltipBox>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="nouveaux"
                fill="url(#monthlyFill)"
                stroke="none"
              />
              <Line
                type="monotone"
                dataKey="nouveaux"
                stroke={DASHBOARD_PRIMARY}
                strokeWidth={2.5}
                dot={{ fill: DASHBOARD_PRIMARY, r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: DASHBOARD_PRIMARY }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
    </DashboardPanel>
  );
}
