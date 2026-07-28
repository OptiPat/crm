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
import type { GrowthObjectiveInput } from "@/lib/statistiques/organisation-growth-objective";
import {
  projectGrowthObjectiveOverYears,
  type YearlyGrowthObjective,
} from "@/lib/statistiques/organisation-growth-projection";
import { formatCount, formatVolume } from "./objectif-table-shared";

const PROJECTION_YEARS = 5;
const VOLUME_COLOR = "#8B5CF6";

/**
 * Projection sur 5 ans du tableau d'objectifs — mêmes hypothèses (croissance, attrition, taux,
 * volumes visés) rejouées chaque année. Illustre la croissance composée : à % de croissance
 * constant, l'effectif ET l'effort de recrutement augmentent chaque année (base plus grande).
 *
 * Année 1 = exactement la colonne « Objectif » du tableau ci-dessus (même base = l'effectif
 * actuel, même résultat), juste rattachée à l'exercice suivant celui affiché — c'est aussi
 * l'exercice suivi par le compteur JD manuel, donc les deux doivent afficher le même chiffre pour
 * le même exercice. Les années 2 à 5 enchaînent ensuite la composition.
 */
export function OrganisationGrowthProjectionPanel({
  exerciceLabel,
  currentConsultantCount,
  input,
}: {
  /** Exercice affiché par le tableau ci-dessus (l'Année 1 de la projection porte sur le suivant). */
  exerciceLabel: string;
  currentConsultantCount: number;
  input: Omit<GrowthObjectiveInput, "currentConsultantCount">;
}) {
  const firstProjectedExerciceLabel = nextFiscalYearLabel(exerciceLabel) ?? exerciceLabel;
  const rows = projectGrowthObjectiveOverYears(
    { ...input, currentConsultantCount },
    PROJECTION_YEARS,
    firstProjectedExerciceLabel
  );

  const chartData = rows.map((row) => ({
    ...row,
    label: `An ${row.year}`,
  }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Année 1 = la colonne « Objectif » ci-dessus (même chiffre, rattaché à l'exercice suivant).
        Mêmes hypothèses reconduites ensuite chaque année (l'effectif visé d'une année devient le
        point de départ de la suivante) — pas une prévision, une projection « si je tiens ce rythme ».
      </p>
      <ResponsiveContainer width="100%" height={220}>
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
        <table className="w-full min-w-[28rem] text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-muted/40">
              <th className="px-2.5 py-1.5 text-left font-medium text-foreground">Exercice</th>
              <th className="px-2.5 py-1.5 text-right font-medium text-foreground whitespace-nowrap">
                Effectif
              </th>
              <th className="px-2.5 py-1.5 text-right font-medium text-foreground whitespace-nowrap">
                Parrainages bruts
              </th>
              <th className="px-2.5 py-1.5 text-right font-medium text-foreground whitespace-nowrap">
                Volume organisation
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year} className="border-b border-border/30 last:border-0 odd:bg-muted/10">
                <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">
                  {row.exerciceLabel}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">
                  {formatCount(row.targetHeadcount)}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatCount(row.recruitsForTarget)}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatVolume(row.targetOrgVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
