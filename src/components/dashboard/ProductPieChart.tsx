import { useEffect, useState, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { getProductStats } from "@/lib/api/tauri-dashboard";
import {
  aggregateProductStatsByFamily,
  type DashboardProductFamilyId,
} from "@/lib/dashboard/dashboard-product-families";
import { formatDashboardCurrency, formatDashboardPercent } from "./dashboard-format";
import {
  ChartEmpty,
  ChartLegendGrid,
  ChartLoading,
  ChartTooltipBox,
  DashboardPanel,
} from "./dashboard-ui";

interface ChartData {
  familyId: DashboardProductFamilyId;
  name: string;
  value: number;
  color: string;
}

function buildChartData(stats: { type_produit: string; montant: number }[]): ChartData[] {
  return aggregateProductStatsByFamily(stats).map((row) => ({
    familyId: row.id,
    name: row.name,
    value: row.montant,
    color: row.color,
  }));
}

export function ProductPieChart({
  dataRefreshSignal = 0,
  onFamilyClick,
}: {
  dataRefreshSignal?: number;
  onFamilyClick?: (familyId: DashboardProductFamilyId) => void;
}) {
  const [rawStats, setRawStats] = useState<{ type_produit: string; montant: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const data = useMemo(() => buildChartData(rawStats), [rawStats]);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const interactive = Boolean(onFamilyClick);

  const handleFamilyClick = useCallback(
    (entry: ChartData) => {
      onFamilyClick?.(entry.familyId);
    },
    [onFamilyClick]
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setRawStats(await getProductStats());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataRefreshSignal]);

  return (
    <DashboardPanel
      title="Par produit"
      description={
        interactive
          ? "Encours par famille de produit — avec moi (instantané). Cliquer pour voir les clients."
          : "Encours par famille de produit — avec moi (instantané)"
      }
      className="h-full"
    >
      {loading ? (
        <ChartLoading height={360} />
      ) : data.length === 0 ? (
        <ChartEmpty
          height={360}
          title="Aucun investissement"
          subtitle="Ajoutez des investissements pour voir ce graphique"
        />
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={92}
                  paddingAngle={1}
                  dataKey="value"
                  className={interactive ? "cursor-pointer outline-none" : undefined}
                  onClick={(_, index) => {
                    const entry = data[index];
                    if (entry) handleFamilyClick(entry);
                  }}
                >
                  {data.map((entry, index) => (
                    <Cell key={index} fill={entry.color} stroke="#fff" strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0].value as number;
                    return (
                      <ChartTooltipBox>
                        <p className="font-medium">{payload[0].name}</p>
                        <p className="text-primary font-semibold">{formatDashboardCurrency(v)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDashboardPercent(v, total)}
                        </p>
                        {interactive ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Cliquer pour voir les clients
                          </p>
                        ) : null}
                      </ChartTooltipBox>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
              aria-hidden
            >
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Encours
              </span>
              <span className="text-sm font-serif font-bold text-primary tabular-nums leading-tight mt-0.5">
                {formatDashboardCurrency(total)}
              </span>
            </div>
          </div>
          <ChartLegendGrid
            items={data}
            total={total}
            columns={2}
            maxHeight="8rem"
            onItemClick={
              interactive
                ? (index) => {
                    const entry = data[index];
                    if (entry) handleFamilyClick(entry);
                  }
                : undefined
            }
          />
        </div>
      )}
    </DashboardPanel>
  );
}
