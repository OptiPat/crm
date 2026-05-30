import { useEffect, useState, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { getCategoryStats } from "@/lib/api/tauri-dashboard";
import {
  ChartEmpty,
  ChartLegendGrid,
  ChartLoading,
  ChartTooltipBox,
  DashboardPanel,
  formatDashboardPercent,
} from "./dashboard-ui";

const COLORS = {
  clients: "#10B981",
  prospect_client: "#3B82F6",
  prospect_filleul: "#06B6D4",
  suspect_client: "#F59E0B",
  suspect_filleul: "#F97316",
};

const LABELS: Record<keyof typeof COLORS, string> = {
  clients: "Clients",
  prospect_client: "Prospects clients",
  prospect_filleul: "Prospects filleuls",
  suspect_client: "Suspects clients",
  suspect_filleul: "Suspects filleuls",
};

export function CategoryPieChart() {
  const [data, setData] = useState<
    { name: string; value: number; color: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
          name: LABELS[item.key],
          value: item.value,
          color: COLORS[item.key],
        }))
        .sort((a, b) => b.value - a.value);

      setData(chartData);
    } catch (error) {
      console.error("Erreur catégories:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardPanel
      title="Par catégorie"
      description="Clients, prospects et suspects"
      className="h-full"
    >
        {loading ? (
          <ChartLoading height={360} />
        ) : data.length === 0 ? (
          <ChartEmpty height={360} title="Aucune donnée à afficher" />
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={88}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0];
                    return (
                      <ChartTooltipBox>
                        <p className="font-medium">{entry.name}</p>
                        <p className="text-primary font-semibold">
                          {entry.value} contact{(entry.value as number) > 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDashboardPercent(entry.value as number, total)}
                        </p>
                      </ChartTooltipBox>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ChartLegendGrid
              items={data}
              total={total}
              maxHeight="8rem"
              columns={data.length > 4 ? 2 : 1}
            />
            <p className="text-xs text-center text-muted-foreground tabular-nums">
              Total : {total} contact{total > 1 ? "s" : ""}
            </p>
          </div>
        )}
    </DashboardPanel>
  );
}
