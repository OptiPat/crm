import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Legend,
} from "recharts";
import {
  getYearlyActivityStats,
  type YearlyActivityStats,
} from "@/lib/api/tauri-dashboard";
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  DASHBOARD_PRIMARY,
  formatDashboardCurrency,
} from "./dashboard-format";
import {
  ChartEmpty,
  ChartLoading,
  ChartTooltipBox,
  DashboardPanel,
} from "./dashboard-ui";

const PANIER_COLOR = "#8B5CF6";

export function YearlyActivityChart() {
  const [data, setData] = useState<YearlyActivityStats[]>([]);
  const [loading, setLoading] = useState(true);

  const chartData = useMemo(
    () => data.map((d) => ({ ...d, yearLabel: String(d.year) })),
    [data]
  );

  const summary = useMemo(() => {
    const totalClients = data.reduce((s, d) => s + d.clients, 0);
    const latest = data[data.length - 1];
    return { totalClients, latest };
  }, [data]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setData(await getYearlyActivityStats());
      } catch (error) {
        console.error("Erreur statistiques annuelles:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <DashboardPanel
      title="Activité par année"
      description={
        !loading && data.length > 0
          ? `Date de souscription · ${summary.totalClients} client${summary.totalClients > 1 ? "s" : ""} au total${
              summary.latest
                ? ` · ${formatDashboardCurrency(summary.latest.panier_moyen)} panier moyen souscrit en ${summary.latest.year}`
                : ""
            }`
          : "Clients et panier moyen (montant souscrit) par année"
      }
      className="h-full"
    >
      {loading ? (
        <ChartLoading height={300} />
      ) : data.length === 0 ? (
        <ChartEmpty
          height={300}
          title="Aucune souscription enregistrée"
          subtitle="Les graphiques apparaîtront dès qu'un investissement « Mon conseil » aura une date de souscription."
        />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="yearLabel"
              stroke={CHART_AXIS_STROKE}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="clients"
              stroke={CHART_AXIS_STROKE}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={36}
            />
            <YAxis
              yAxisId="panier"
              orientation="right"
              stroke={PANIER_COLOR}
              tick={{ fontSize: 11, fill: PANIER_COLOR }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                new Intl.NumberFormat("fr-FR", {
                  notation: "compact",
                  compactDisplay: "short",
                  maximumFractionDigits: 0,
                }).format(v)
              }
              width={52}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as YearlyActivityStats & { yearLabel: string };
                return (
                  <ChartTooltipBox>
                    <p className="font-medium">{row.year}</p>
                    <p className="text-primary font-semibold">
                      {row.clients} client{row.clients > 1 ? "s" : ""}
                    </p>
                    <p className="text-purple-600 font-semibold">
                      Panier moyen : {formatDashboardCurrency(row.panier_moyen)}
                    </p>
                  </ChartTooltipBox>
                );
              }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              formatter={(value) =>
                value === "clients" ? "Clients" : "Panier moyen"
              }
            />
            <Bar
              yAxisId="clients"
              dataKey="clients"
              name="clients"
              fill={DASHBOARD_PRIMARY}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
            <Line
              yAxisId="panier"
              type="monotone"
              dataKey="panier_moyen"
              name="panier_moyen"
              stroke={PANIER_COLOR}
              strokeWidth={2.5}
              dot={{ fill: PANIER_COLOR, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: PANIER_COLOR }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </DashboardPanel>
  );
}
