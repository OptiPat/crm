import { useEffect, useState, useMemo, useCallback } from "react";
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
import type { ContactsPipelineStage } from "@/lib/contacts/contacts-pipeline-match";
import { navigateToContactsPipeline } from "@/lib/navigation/contacts-navigation";

const COLORS = {
  suspects: "#F59E0B",
  prospects: "#3B82F6",
  clients: "#10B981",
};

type PipelineStage = ContactsPipelineStage;

interface ChartData {
  stage: string;
  stageKey: PipelineStage;
  count: number;
  color: string;
}

export function PipelineChart({
  onNavigate,
  currentPage,
}: {
  onNavigate?: (page: string) => void;
  currentPage?: string;
}) {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  const total = useMemo(() => data.reduce((s, i) => s + i.count, 0), [data]);
  const interactive = Boolean(onNavigate);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const stats = await getPipelineStats();
        setData([
          {
            stage: "Suspects",
            stageKey: "suspects",
            count: stats.suspects,
            color: COLORS.suspects,
          },
          {
            stage: "Prospects",
            stageKey: "prospects",
            count: stats.prospects,
            color: COLORS.prospects,
          },
          {
            stage: "Clients",
            stageKey: "clients",
            count: stats.clients,
            color: COLORS.clients,
          },
        ]);
      } catch (error) {
        console.error("Erreur pipeline:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleBarClick = useCallback(
    (entry: ChartData) => {
      if (!onNavigate) return;
      navigateToContactsPipeline(onNavigate, entry.stageKey, currentPage);
    },
    [onNavigate, currentPage]
  );

  return (
    <DashboardPanel
      title="Pipeline commercial"
      description={
        interactive
          ? "Clients et filleuls — cliquer pour voir la liste correspondante"
          : undefined
      }
      className="h-full"
    >
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
                        {interactive ? (
                          <p className="text-xs text-muted-foreground mt-1">Cliquer pour voir la liste</p>
                        ) : null}
                      </ChartTooltipBox>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={40}
                  className={interactive ? "cursor-pointer" : undefined}
                  onClick={(_, index) => {
                    const entry = data[index];
                    if (entry) handleBarClick(entry);
                  }}
                >
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
