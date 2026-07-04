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
} from "recharts";
import { getCategoryStats } from "@/lib/api/tauri-dashboard";
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  formatDashboardPercent,
} from "./dashboard-format";
import {
  ChartEmpty,
  ChartLegendGrid,
  ChartLoading,
  ChartTooltipBox,
  DashboardPanel,
} from "./dashboard-ui";
import {
  navigateToContactsCategory,
  type ContactsCategoryFilter,
} from "@/lib/navigation/contacts-navigation";

const COLORS = {
  clients: "#10B981",
  prospect_client: "#3B82F6",
  prospect_filleul: "#06B6D4",
  suspect_client: "#F59E0B",
  suspect_filleul: "#F97316",
} as const;

type CategoryKey = keyof typeof COLORS;

const LABELS: Record<CategoryKey, string> = {
  clients: "Clients",
  prospect_client: "Prospects clients",
  prospect_filleul: "Prospects filleuls",
  suspect_client: "Suspects clients",
  suspect_filleul: "Suspects filleuls",
};

const CATEGORY_NAV: Record<CategoryKey, ContactsCategoryFilter> = {
  clients: { mainTab: "clients", clientSubTab: "CLIENT" },
  prospect_client: { mainTab: "clients", clientSubTab: "PROSPECT_CLIENT" },
  prospect_filleul: { mainTab: "filleuls", filleulSubTab: "PROSPECT_FILLEUL" },
  suspect_client: { mainTab: "clients", clientSubTab: "SUSPECT_CLIENT" },
  suspect_filleul: { mainTab: "filleuls", filleulSubTab: "SUSPECT_FILLEUL" },
};

type ChartDatum = {
  key: CategoryKey;
  name: string;
  count: number;
  color: string;
};

export function CategoryPieChart({
  onNavigate,
  currentPage,
  dataRefreshSignal = 0,
}: {
  onNavigate?: (page: string) => void;
  currentPage?: string;
  dataRefreshSignal?: number;
}) {
  const [data, setData] = useState<ChartDatum[]>([]);
  const [loading, setLoading] = useState(true);

  const total = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);
  const interactive = Boolean(onNavigate);

  const yAxisWidth = useMemo(() => {
    if (data.length === 0) return 88;
    const longest = data.reduce((best, row) => {
      const label = `${row.name} (${row.count})`;
      return label.length > best.length ? label : best;
    }, "");
    return Math.min(160, Math.max(92, longest.length * 6));
  }, [data]);

  const yAxisTick = useCallback(
    (name: string) => {
      const row = data.find((d) => d.name === name);
      if (!row) return name;
      return `${name} (${row.count})`;
    },
    [data]
  );

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const stats = await getCategoryStats();
        const chartData = (
          [
            { key: "clients" as const, value: stats.clients },
            { key: "prospect_client" as const, value: stats.prospect_client },
            { key: "prospect_filleul" as const, value: stats.prospect_filleul },
            { key: "suspect_client" as const, value: stats.suspect_client },
            { key: "suspect_filleul" as const, value: stats.suspect_filleul },
          ] as const
        )
          .filter((item) => item.value > 0)
          .map((item) => ({
            key: item.key,
            name: LABELS[item.key],
            count: item.value,
            color: COLORS[item.key],
          }))
          .sort((a, b) => b.count - a.count);

        setData(chartData);
      } catch (error) {
        console.error("Erreur catégories:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataRefreshSignal]);

  const handleCategoryClick = useCallback(
    (entry: ChartDatum) => {
      if (!onNavigate) return;
      navigateToContactsCategory(onNavigate, CATEGORY_NAV[entry.key], currentPage);
    },
    [onNavigate, currentPage]
  );

  return (
    <DashboardPanel
      title="Par catégorie"
      description={
        interactive
          ? "Pipeline actuel — cliquer pour voir la liste correspondante"
          : "Pipeline actuel (clients, prospects, suspects)"
      }
      className="h-full"
    >
      {loading ? (
        <ChartLoading height={300} />
      ) : total === 0 ? (
        <ChartEmpty height={300} title="Aucune donnée à afficher" />
      ) : (
        <div className="space-y-4">
          <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
              barCategoryGap="20%"
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
                dataKey="name"
                stroke={CHART_AXIS_STROKE}
                tick={{ fontSize: 11, fontWeight: 500 }}
                tickFormatter={yAxisTick}
                tickLine={false}
                axisLine={false}
                width={yAxisWidth}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const v = payload[0].value as number;
                  return (
                    <ChartTooltipBox>
                      <p className="font-medium">{payload[0].payload.name}</p>
                      <p className="text-primary font-semibold">
                        {v} contact{v > 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDashboardPercent(v, total)}
                      </p>
                      {interactive ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Cliquer pour voir la liste
                        </p>
                      ) : null}
                    </ChartTooltipBox>
                  );
                }}
              />
              <Bar
                dataKey="count"
                radius={[0, 6, 6, 0]}
                maxBarSize={32}
                className={interactive ? "cursor-pointer" : undefined}
                onClick={(_, index) => {
                  const entry = data[index];
                  if (entry) handleCategoryClick(entry);
                }}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ChartLegendGrid
            items={data.map((d) => ({ name: d.name, value: d.count, color: d.color }))}
            total={total}
            columns={data.length > 4 ? 2 : 1}
            maxHeight="8rem"
            onItemClick={
              interactive
                ? (index) => {
                    const entry = data[index];
                    if (entry) handleCategoryClick(entry);
                  }
                : undefined
            }
          />
          <p className="text-xs text-center text-muted-foreground tabular-nums">
            Total : {total} contact{total > 1 ? "s" : ""}
          </p>
        </div>
      )}
    </DashboardPanel>
  );
}
