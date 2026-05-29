import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getPipelineStats } from "@/lib/api/tauri-dashboard";
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  ChartEmpty,
  ChartLegendGrid,
  ChartLoading,
  ChartTooltipBox,
  formatDashboardPercent,
} from "./dashboard-ui";

const COLORS = {
  suspects: "#F59E0B",
  prospects: "#3B82F6",
  clients: "#10B981",
};

interface ChartData {
  stage: string;
  count: number;
  color: string;
}

export function PipelineChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  const total = useMemo(() => data.reduce((s, i) => s + i.count, 0), [data]);
  const clientShare = useMemo(() => {
    const clients = data.find((d) => d.stage === "Clients");
    return clients && total > 0 ? ((clients.count / total) * 100).toFixed(1) : "0";
  }, [data, total]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const stats = await getPipelineStats();
        setData([
          { stage: "Suspects", count: stats.suspects, color: COLORS.suspects },
          { stage: "Prospects", count: stats.prospects, color: COLORS.prospects },
          { stage: "Clients", count: stats.clients, color: COLORS.clients },
        ]);
      } catch (error) {
        console.error("Erreur pipeline:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card className="shadow-sm border-border/80 h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-xl">Pipeline commercial</CardTitle>
        <CardDescription>
          Funnel suspects → prospects → clients
          {!loading && total > 0 && (
            <span className="tabular-nums"> — {clientShare} % clients</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <ChartLoading height={300} />
        ) : total === 0 ? (
          <ChartEmpty height={300} title="Aucune donnée à afficher" />
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
                barCategoryGap="28%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={CHART_GRID_STROKE}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke={CHART_AXIS_STROKE}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="stage"
                  stroke={CHART_AXIS_STROKE}
                  tick={{ fontSize: 12, fontWeight: 500 }}
                  tickLine={false}
                  axisLine={false}
                  width={88}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0].value as number;
                    return (
                      <ChartTooltipBox>
                        <p className="font-medium">{payload[0].payload.stage}</p>
                        <p className="text-primary font-semibold">
                          {v} contact{v > 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDashboardPercent(v, total)}
                        </p>
                      </ChartTooltipBox>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={36}>
                  {data.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ChartLegendGrid
              items={data.map((d) => ({
                name: d.stage,
                value: d.count,
                color: d.color,
                formatValue: (v) => `${v} contact${v > 1 ? "s" : ""}`,
              }))}
              total={total}
              columns={3}
              maxHeight="none"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
