import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  DASHBOARD_PRIMARY,
} from "@/components/dashboard/dashboard-format";
import { ChartTooltipBox } from "@/components/dashboard/dashboard-ui";
import { nextFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import {
  loadProjectionOverridesByYear,
  saveProjectionYearOverride,
} from "@/lib/statistiques/organisation-growth-projection-preferences";
import {
  projectGrowthObjectiveOverYears,
  resolveYearlyGrowthLevers,
  type YearlyGrowthLevers,
  type YearlyGrowthObjective,
} from "@/lib/statistiques/organisation-growth-projection";
import { cn } from "@/lib/utils";
import { formatCount, formatRatio, formatVolume } from "./objectif-table-shared";

const PROJECTION_YEARS = 5;
const VOLUME_COLOR = "#8B5CF6";

const LEVER_ROWS: {
  key: keyof YearlyGrowthLevers;
  label: string;
  suffix: string;
  format: (v: number) => string;
  step: number;
  isMoney?: boolean;
}[] = [
  {
    key: "targetGrowthPercent",
    label: "Croissance visée",
    suffix: "%",
    format: (v) => `${formatRatio(v)} %`,
    step: 1,
  },
  {
    key: "attritionPercent",
    label: "Attrition visée",
    suffix: "%",
    format: (v) => `${formatRatio(v)} %`,
    step: 1,
  },
  {
    key: "targetTeamActiveRatePercent",
    label: "Taux d'actifs équipe visé",
    suffix: "%",
    format: (v) => `${formatRatio(v)} %`,
    step: 1,
  },
  {
    key: "targetSponsorsRatePercent",
    label: "Taux de parraineurs visé",
    suffix: "%",
    format: (v) => `${formatRatio(v)} %`,
    step: 1,
  },
  {
    key: "targetPersonalVolume",
    label: "Volume perso visé",
    suffix: "€",
    format: formatVolume,
    step: 10_000,
    isMoney: true,
  },
  {
    key: "targetTeamAverageVolume",
    label: "Volume moyen orga/actif visé",
    suffix: "€",
    format: formatVolume,
    step: 10_000,
    isMoney: true,
  },
];

/**
 * Projection sur 5 ans du tableau d'objectifs, pilotable année par année — un vrai plan d'action :
 * l'Année 1 reprend exactement la colonne « Objectif » du tableau ci-dessus (même exercice suivi
 * par le compteur JD manuel), les années 2 à 5 héritent en cascade des hypothèses de l'année
 * précédente sauf surcharge explicite (ex. pousser croissance/attrition une année, puis se
 * concentrer sur le volume moyen l'année suivante sans revenir sur le reste).
 */
export function OrganisationGrowthProjectionPanel({
  exerciceLabel,
  currentConsultantCount,
  baseline,
  jdPresenceToRecruitRatePercent,
  jdConfirmationToPresenceRatePercent,
}: {
  /** Exercice affiché par le tableau ci-dessus (l'Année 1 de la projection porte sur le suivant). */
  exerciceLabel: string;
  currentConsultantCount: number;
  /** Hypothèses de l'Année 1 = celles déjà saisies dans le tableau ci-dessus. */
  baseline: YearlyGrowthLevers;
  jdPresenceToRecruitRatePercent: number;
  jdConfirmationToPresenceRatePercent: number;
}) {
  const [overridesByYear, setOverridesByYear] = useState(() => loadProjectionOverridesByYear());

  const yearlyLevers = useMemo(
    () => resolveYearlyGrowthLevers(PROJECTION_YEARS, overridesByYear, baseline),
    [overridesByYear, baseline]
  );

  const firstProjectedExerciceLabel = nextFiscalYearLabel(exerciceLabel) ?? exerciceLabel;
  const rows = useMemo(
    () =>
      projectGrowthObjectiveOverYears(
        yearlyLevers,
        { jdPresenceToRecruitRatePercent, jdConfirmationToPresenceRatePercent },
        currentConsultantCount,
        firstProjectedExerciceLabel
      ),
    [
      yearlyLevers,
      jdPresenceToRecruitRatePercent,
      jdConfirmationToPresenceRatePercent,
      currentConsultantCount,
      firstProjectedExerciceLabel,
    ]
  );

  function setYearOverride(year: number, key: keyof YearlyGrowthLevers, value: number | undefined) {
    setOverridesByYear((prev) => {
      const nextYearOverride = { ...prev[year] };
      if (value === undefined) {
        delete nextYearOverride[key];
      } else {
        nextYearOverride[key] = value;
      }
      const next = { ...prev };
      if (Object.keys(nextYearOverride).length === 0) {
        delete next[year];
      } else {
        next[year] = nextYearOverride;
      }
      saveProjectionYearOverride(year, nextYearOverride);
      return next;
    });
  }

  function resetYear(year: number) {
    setOverridesByYear((prev) => {
      const next = { ...prev };
      delete next[year];
      saveProjectionYearOverride(year, {});
      return next;
    });
  }

  const chartData = rows.map((row) => ({ ...row, label: `An ${row.year}` }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Année 1 = la colonne « Objectif » ci-dessus. Modifiez une hypothèse sur une année (ex.
        croissance) : elle s'applique à cette année-là et se propage aux suivantes, jusqu'à ce que
        vous en fixiez une autre — de quoi construire un vrai plan d'action, pas juste une répétition.
      </p>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={CHART_AXIS_STROKE}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="headcount"
            stroke={CHART_AXIS_STROKE}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            stroke={VOLUME_COLOR}
            tick={{ fontSize: 11, fill: VOLUME_COLOR }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              new Intl.NumberFormat("fr-FR", {
                notation: "compact",
                compactDisplay: "short",
                maximumFractionDigits: 0,
              }).format(v)
            }
            width={48}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as YearlyGrowthObjective & { label: string };
              return (
                <ChartTooltipBox>
                  <p className="font-medium">
                    {row.label} — {row.exerciceLabel}
                  </p>
                  <p className="text-primary font-semibold">
                    {formatCount(row.targetHeadcount)} consultants
                  </p>
                  <p style={{ color: VOLUME_COLOR }} className="font-semibold">
                    {formatVolume(row.targetOrgVolume)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCount(row.recruitsForTarget)} parrainages bruts nécessaires
                  </p>
                </ChartTooltipBox>
              );
            }}
          />
          <Legend
            verticalAlign="top"
            height={28}
            formatter={(value) => (value === "targetHeadcount" ? "Effectif" : "Volume organisation")}
          />
          <Bar
            yAxisId="headcount"
            dataKey="targetHeadcount"
            name="targetHeadcount"
            fill={DASHBOARD_PRIMARY}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Line
            yAxisId="volume"
            type="monotone"
            dataKey="targetOrgVolume"
            name="targetOrgVolume"
            stroke={VOLUME_COLOR}
            strokeWidth={2.5}
            dot={{ fill: VOLUME_COLOR, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: VOLUME_COLOR }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full min-w-[38rem] text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-muted/40">
              <th className="px-2.5 py-1.5 text-left font-medium text-foreground">Hypothèse</th>
              {rows.map((row) => (
                <th
                  key={row.year}
                  className={cn(
                    "px-2.5 py-1.5 text-right font-medium whitespace-nowrap",
                    row.year === 1 && "bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className={cn(row.year === 1 ? "text-primary" : "text-foreground")}>
                      An {row.year} <span className="font-normal text-muted-foreground">{row.exerciceLabel}</span>
                    </span>
                    {row.year > 1 && overridesByYear[row.year] != null && (
                      <button
                        type="button"
                        onClick={() => resetYear(row.year)}
                        title="Réinitialiser cette année (revenir à l'héritage de l'année précédente)"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="size-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEVER_ROWS.map((leverRow) => (
              <tr key={leverRow.key} className="border-b border-border/30">
                <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">{leverRow.label}</td>
                {yearlyLevers.map((levers, index) => {
                  const year = index + 1;
                  const value = levers[leverRow.key];
                  const isOverridden = overridesByYear[year]?.[leverRow.key] !== undefined;
                  return (
                    <td
                      key={year}
                      className={cn("px-2.5 py-1.5 text-right", year === 1 && "bg-primary/[0.03]")}
                    >
                      {year === 1 ? (
                        <span className="tabular-nums text-muted-foreground">{leverRow.format(value)}</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {leverRow.isMoney ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              value={value.toLocaleString("fr-FR")}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/[^\d-]/g, "");
                                // Champ vidé = pas de surcharge (retour à l'héritage en cascade), pas 0 explicite.
                                setYearOverride(
                                  year,
                                  leverRow.key,
                                  digits === "" || digits === "-" ? undefined : Number(digits)
                                );
                              }}
                              className={cn(
                                "w-24 rounded border px-1 py-0.5 text-right tabular-nums",
                                isOverridden
                                  ? "border-primary/60 bg-primary/5 font-medium text-foreground"
                                  : "border-border/50 text-muted-foreground"
                              )}
                            />
                          ) : (
                            <input
                              type="number"
                              step={leverRow.step}
                              value={value}
                              onChange={(e) =>
                                setYearOverride(
                                  year,
                                  leverRow.key,
                                  e.target.value === "" ? undefined : Number(e.target.value)
                                )
                              }
                              className={cn(
                                "w-16 rounded border px-1 py-0.5 text-right tabular-nums",
                                isOverridden
                                  ? "border-primary/60 bg-primary/5 font-medium text-foreground"
                                  : "border-border/50 text-muted-foreground"
                              )}
                            />
                          )}
                          <span className="text-muted-foreground">{leverRow.suffix}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tbody>
            <tr className="border-b border-border/30 border-t-2 border-t-border bg-primary/5">
              <td className="px-2.5 py-1.5 font-medium text-primary">Effectif</td>
              {rows.map((row) => (
                <td key={row.year} className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-primary">
                  {formatCount(row.targetHeadcount)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-border/30">
              <td className="px-2.5 py-1.5 text-muted-foreground">Parrainages bruts</td>
              {rows.map((row) => (
                <td key={row.year} className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatCount(row.recruitsForTarget)}
                </td>
              ))}
            </tr>
            <tr className="bg-violet-500/5">
              <td className="px-2.5 py-1.5 font-medium" style={{ color: VOLUME_COLOR }}>
                Volume organisation
              </td>
              {rows.map((row) => (
                <td
                  key={row.year}
                  className="px-2.5 py-1.5 text-right tabular-nums font-semibold"
                  style={{ color: VOLUME_COLOR }}
                >
                  {formatVolume(row.targetOrgVolume)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
