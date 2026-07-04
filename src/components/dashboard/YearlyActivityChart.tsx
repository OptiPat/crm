import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  Cell,
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
  getActivityBucketContacts,
  getActivityPeriodSummary,
  getYearlyActivityStats,
  type ActivityPeriodSummary,
  type YearlyActivityStats,
} from "@/lib/api/tauri-dashboard";
import {
  activityChartDrillHint,
  activityChartTitle,
  formatActivityBucketLabel,
  type DashboardPeriodGranularity,
} from "@/lib/dashboard/dashboard-period-filter";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
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

interface YearlyActivityChartProps {
  periodStart: number;
  periodEnd: number;
  bucket: DashboardPeriodGranularity;
  dataRefreshSignal?: number;
  activeContactId?: number | null;
  onOpenContact?: DashboardDrillDownOpenContact;
  onOpenContactFromList?: DashboardDrillDownOpenContact;
  stackedContactOpen?: boolean;
  onListClose?: () => void;
}

export function YearlyActivityChart({
  periodStart,
  periodEnd,
  bucket,
  dataRefreshSignal = 0,
  activeContactId,
  onOpenContact,
  onOpenContactFromList,
  stackedContactOpen = false,
  onListClose,
}: YearlyActivityChartProps) {
  const [data, setData] = useState<YearlyActivityStats[]>([]);
  const [summary, setSummary] = useState<ActivityPeriodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<{
    key: string;
    label: string;
  } | null>(null);

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        bucketLabel: formatActivityBucketLabel(d.label, bucket),
      })),
    [data, bucket]
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [rows, periodSummary] = await Promise.all([
          getYearlyActivityStats(periodStart, periodEnd, bucket),
          getActivityPeriodSummary(periodStart, periodEnd),
        ]);
        setData(rows);
        setSummary(periodSummary);
      } catch (error) {
        console.error("Erreur statistiques annuelles:", error);
        setData([]);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [periodStart, periodEnd, bucket, dataRefreshSignal]);

  const openBucket = useCallback(
    (row: YearlyActivityStats & { bucketLabel: string }) => {
      if (!onOpenContact || row.clients <= 0) return;
      setSelectedBucket({ key: row.label, label: row.bucketLabel });
      setSheetOpen(true);
    },
    [onOpenContact]
  );

  const loadBucketContacts = useCallback(async () => {
    if (!selectedBucket) return [];
    return getActivityBucketContacts(
      periodStart,
      periodEnd,
      selectedBucket.key,
      bucket
    );
  }, [selectedBucket, periodStart, periodEnd, bucket]);

  const interactive = Boolean(onOpenContact);

  return (
    <>
      <DashboardPanel
        title={activityChartTitle(bucket)}
        description={
          interactive
            ? `Cliquer sur ${activityChartDrillHint(bucket)} pour voir et ouvrir les contacts`
            : undefined
        }
        className="h-full"
      >
        {loading ? (
          <ChartLoading height={300} />
        ) : data.length === 0 ? (
          <ChartEmpty
            height={300}
            title="Aucune souscription enregistrée"
            subtitle="Les graphiques apparaîtront dès qu'un placement « Mon conseil » aura une souscription ou un versement complémentaire daté."
          />
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="bucketLabel"
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
                  const row = payload[0].payload as YearlyActivityStats & { bucketLabel: string };
                  return (
                    <ChartTooltipBox>
                      <p className="font-medium">{row.bucketLabel}</p>
                      <p className="text-primary font-semibold">
                        {row.clients} client{row.clients > 1 ? "s" : ""}
                      </p>
                      <p className="text-purple-600 font-semibold">
                        Panier moyen : {formatDashboardCurrency(row.panier_moyen)}
                      </p>
                      {interactive && row.clients > 0 ? (
                        <p className="text-xs text-muted-foreground mt-1">Cliquer pour voir la liste</p>
                      ) : null}
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
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.label}
                    className={interactive && entry.clients > 0 ? "cursor-pointer" : undefined}
                    onClick={() => openBucket(entry)}
                  />
                ))}
              </Bar>
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

            {summary && summary.clients > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/60">
                <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Résultat total sur la période
                  </p>
                  <p className="text-2xl font-serif font-bold tabular-nums tracking-tight mt-1 text-primary">
                    {formatDashboardCurrency(summary.total)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Souscriptions initiales + versements complémentaires « avec moi »
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Panier moyen sur la période
                  </p>
                  <p
                    className="text-2xl font-serif font-bold tabular-nums tracking-tight mt-1"
                    style={{ color: PANIER_COLOR }}
                  >
                    {formatDashboardCurrency(summary.panier_moyen)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.clients} client{summary.clients > 1 ? "s" : ""} distinct
                    {summary.clients > 1 ? "s" : ""} sur la période
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DashboardPanel>

      {sheetOpen ? <DashboardDrillDownBackdrop /> : null}

      <DashboardStatContactsSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open && stackedContactOpen) return;
          setSheetOpen(open);
          if (!open) onListClose?.();
        }}
        title={selectedBucket ? `Clients — ${selectedBucket.label}` : "Clients"}
        description="Cliquer un contact pour ouvrir sa fiche"
        loadContacts={loadBucketContacts}
        refreshSignal={dataRefreshSignal}
        activeContactId={activeContactId}
        stackedContactOpen={stackedContactOpen}
        onOpenContact={onOpenContactFromList ?? onOpenContact}
      />
    </>
  );
}
