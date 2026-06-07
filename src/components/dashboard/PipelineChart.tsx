import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { getPipelineStats } from "@/lib/api/tauri-dashboard";
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  formatDashboardPercent,
} from "./dashboard-format";
import {
  ChartEmpty,
  ChartLoading,
  ChartTooltipBox,
  DashboardPanel,
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
    <DashboardPanel title="Pipeline commercial" className="h-full">
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
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={40}>
                  {data.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    className="fill-foreground/80 text-xs font-medium"
                    formatter={(value) => {
                      const n = typeof value === "number" ? value : Number(value);
                      if (!Number.isFinite(n)) return "";
                      return `${n} contact${n > 1 ? "s" : ""}`;
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
    </DashboardPanel>
  );
}
