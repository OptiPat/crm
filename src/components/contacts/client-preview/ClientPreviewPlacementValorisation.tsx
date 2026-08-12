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
  getEffectiveEncoursCentimes,
  getPlacementValorisationUiMode,
} from "@/lib/investissements/investissement-encours";
import {
  buildPatrimoineEvolution,
  type PatrimoineEvolutionPoint,
} from "@/lib/patrimoine/patrimoine-evolution";
import type {
  ValorisationPoint,
  ValorisationSource,
} from "@/lib/espace-client/espace-valorisations";
import { formatShortEuro } from "./client-preview-format";
import { CP } from "./client-preview-theme";

const LINE_COLOR = "#5B9EA6";
const GRID_COLOR = "rgba(255,255,255,0.06)";
const AXIS_COLOR = "#6b6b6b";

function formatDetailDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ValorisationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PatrimoineEvolutionPoint & { valueEuros: number } }>;
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

/**
 * Le client lisait un montant en tête sans savoir s'il venait de lui ou du
 * cabinet, et ses propres déclarations effaçaient les valorisations du
 * conseiller. Chaque ligne dit désormais qui l'a saisie.
 */
const SOURCE_LABEL: Record<ValorisationSource, string> = {
  cabinet: "Valorisé par votre conseiller",
  client: "Déclaré par vous",
};

export interface ClientPreviewPlacementValorisationProps {
  inv: Investissement;
  history?: ValorisationPoint[];
}

export function ClientPreviewPlacementValorisation({
  inv,
  history,
}: ClientPreviewPlacementValorisationProps) {
  const uiMode = getPlacementValorisationUiMode(inv.type_produit);
  const valueLabel = uiMode === "valorisation" ? "Valorisation" : "Encours";
  const historyLabel =
    uiMode === "valorisation"
      ? "Historique de valorisation"
      : "Historique d'encours";

  const currentCentimes = getEffectiveEncoursCentimes(inv);

  const series = useMemo(
    () =>
      buildPatrimoineEvolution([
        {
          id: inv.id,
          montant_initial: inv.montant_initial,
          date_souscription: inv.date_souscription,
          encours_actuel: inv.encours_actuel,
          encours_date: inv.encours_date,
          valorisations: history,
        },
      ]),
    [inv, history]
  );

  const chartData = useMemo(
    () =>
      series?.map((p) => ({
        ...p,
        valueEuros: Math.round(p.totalCentimes / 100),
      })) ?? [],
    [series]
  );

  const historyRows = useMemo(() => {
    if (history && history.length > 0) {
      return [...history]
        .sort((a, b) => b.dateTs - a.dateTs)
        .map((row) => ({
          key: `val-${row.dateTs}`,
          dateTs: row.dateTs,
          montantCentimes: row.montantCentimes,
          revenuPercuCentimes: row.revenuPercuCentimes,
          source: row.source as ValorisationSource | undefined,
        }));
    }
    if (series && series.length > 0) {
      return [...series]
        .sort((a, b) => b.dateTs - a.dateTs)
        .map((p) => ({
          key: `pt-${p.dateTs}`,
          dateTs: p.dateTs,
          montantCentimes: p.totalCentimes,
          revenuPercuCentimes: undefined as number | null | undefined,
          // Reconstitution à partir du montant initial et de l'encours : le
          // cabinet en est la seule source.
          source: undefined as ValorisationSource | undefined,
        }));
    }
    return [];
  }, [history, series]);

  const hasMultiPointHistory =
    historyRows.length > 1 || chartData.length >= 2;
  const sectionTitle = hasMultiPointHistory ? historyLabel : valueLabel;

  if (currentCentimes <= 0 && historyRows.length === 0) return null;

  return (
    <div className="border-t border-[var(--cp-line-soft)] pt-2">
      <p className={`${CP.meta} mb-3`}>{sectionTitle}</p>

      {currentCentimes > 0 ? (
        <div className="mb-4 flex items-baseline justify-end gap-4">
          <div className="text-right">
            <p className={CP.amount}>{formatShortEuro(currentCentimes)}</p>
            {inv.encours_date ? (
              <p className={`${CP.caption} mt-0.5`}>
                Au {formatDetailDate(inv.encours_date)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {chartData.length >= 2 ? (
        <div className="mb-4 min-w-0 overflow-hidden">
          <div className="h-[140px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={GRID_COLOR}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: AXIS_COLOR }}
                tickLine={false}
                axisLine={{ stroke: GRID_COLOR }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: AXIS_COLOR }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat("fr-FR", {
                    notation: "compact",
                    compactDisplay: "short",
                    maximumFractionDigits: 0,
                  }).format(v)
                }
              />
              <Tooltip
                content={<ValorisationTooltip />}
                cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
              />
              <Line
                type="stepAfter"
                dataKey="valueEuros"
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
      ) : null}

      {historyRows.length > 0 ? (
        <ul className="divide-y divide-[var(--cp-line-soft)]">
          {historyRows.map((row) => (
            <li
              key={row.key}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <div className="min-w-0">
                <span className={CP.caption}>{formatDetailDate(row.dateTs)}</span>
                {row.source ? (
                  <p className={`${CP.caption} mt-0.5 opacity-70`}>
                    {SOURCE_LABEL[row.source]}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <span className={`${CP.body} tabular-nums`}>
                  {formatShortEuro(row.montantCentimes)}
                </span>
                {row.revenuPercuCentimes != null && row.revenuPercuCentimes > 0 ? (
                  <p className={`${CP.caption} mt-0.5`}>
                    Revenu {formatShortEuro(row.revenuPercuCentimes)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
