import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  buildPatrimoineEvolution,
  type PatrimoineEvolutionPoint,
} from "@/lib/patrimoine/patrimoine-evolution";
import type { ValorisationHistoryById } from "@/lib/espace-client/espace-valorisations";
import { formatShortEuro } from "./client-preview-format";
import { CP } from "./client-preview-theme";

const LINE_COLOR = "#5B9EA6";
const GRID_COLOR = "rgba(255,255,255,0.06)";
const AXIS_COLOR = "#6b6b6b";

export type EvolutionHistoryById = ValorisationHistoryById;

function EvolutionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PatrimoineEvolutionPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-2">
      <p className={`${CP.caption} text-[var(--cp-ink-muted)]`}>{point.label}</p>
      <p className={`${CP.amount} mt-0.5`}>{formatShortEuro(point.totalCentimes)}</p>
    </div>
  );
}

export interface ClientPreviewEvolutionProps {
  investissements: Investissement[];
  /** Historiques complets (CRM). Absent sur le portail → dérivation sparse. */
  historiesByInvestissementId?: EvolutionHistoryById;
}

export function ClientPreviewEvolution({
  investissements,
  historiesByInvestissementId,
}: ClientPreviewEvolutionProps) {
  const series = useMemo(
    () =>
      buildPatrimoineEvolution(
        investissements.map((inv) => ({
          id: inv.id,
          montant_initial: inv.montant_initial,
          date_souscription: inv.date_souscription,
          encours_actuel: inv.encours_actuel,
          encours_date: inv.encours_date,
          valorisations: historiesByInvestissementId?.get(inv.id),
        }))
      ),
    [investissements, historiesByInvestissementId]
  );

  if (!series || series.length < 2) return null;

  const chartData = series.map((p) => ({
    ...p,
    totalEuros: Math.round(p.totalCentimes / 100),
  }));

  return (
    <section className={`${CP.sectionGap} ${CP.padX} pb-2`}>
      <h3 className={CP.sectionTitle}>Évolution</h3>
      <p className={`${CP.meta} mt-1`}>
        D&apos;après les dates connues — le dernier point correspond au total
        actuel.
      </p>
      <div className={`${CP.card} mt-4 p-4`}>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: AXIS_COLOR }}
                tickLine={false}
                axisLine={{ stroke: GRID_COLOR }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 11, fill: AXIS_COLOR }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat("fr-FR", {
                    notation: "compact",
                    compactDisplay: "short",
                    maximumFractionDigits: 0,
                  }).format(v)
                }
              />
              <Tooltip
                content={<EvolutionTooltip />}
                cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
              />
              <Line
                type="stepAfter"
                dataKey="totalEuros"
                stroke={LINE_COLOR}
                strokeWidth={1.75}
                dot={{ r: 2.5, fill: LINE_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: LINE_COLOR, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
