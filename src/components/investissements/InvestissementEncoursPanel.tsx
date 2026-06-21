import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInvestissementValorisation,
  deleteInvestissementValorisation,
  getValorisationsByInvestissement,
  type InvestissementValorisation,
} from "@/lib/api/tauri-investissement-valorisations";
import {
  getVersementsByInvestissement,
  type InvestissementVersement,
} from "@/lib/api/tauri-investissement-versements";
import { dateFieldToIso, todayLocal } from "@/lib/contacts/contact-form-utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  formatStelliumPerfPctLabel,
} from "@/lib/investissements/stellium-perf-display";
import {
  buildEncoursChartPoints,
  type EncoursChartPoint,
} from "@/lib/investissements/investissement-encours-chart";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import { getMontantInvestiCentimes } from "@/lib/investissements/investissement-versements";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  formatDashboardCurrency,
} from "@/components/dashboard/dashboard-format";
import { ChartEmpty, ChartLoading, ChartTooltipBox } from "@/components/dashboard/dashboard-ui";
import { ChevronDown, Loader2, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ENCOURS_COLOR = "#C9A227";
const COMPLEMENT_COLOR = "#3B82F6";

function stelliumPerfTone(centimes: number | null | undefined): string {
  if (centimes == null || centimes === 0) return "text-foreground";
  return centimes > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive";
}

function StelliumReleveContent({ releve }: { releve: InvestissementValorisation }) {
  const perfPct = formatStelliumPerfPctLabel(
    releve.stellium_perf_euro_centimes,
    releve.stellium_versements_nets_centimes
  );
  const perfTone = stelliumPerfTone(releve.stellium_perf_euro_centimes);

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-amber-100/80 bg-amber-50/50 px-3 py-2">
        <time className="text-xs font-medium text-muted-foreground tabular-nums pt-0.5">
          {formatCalendarDateFr(releve.date_valorisation)}
        </time>
        <div className="text-right min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Encours
          </p>
          <p className="text-sm font-semibold text-foreground tabular-nums leading-tight">
            {formatEuroCentimes(releve.montant)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Nets versés</p>
          <p className="text-xs font-medium text-foreground tabular-nums leading-snug">
            {formatEuroCentimes(releve.stellium_versements_nets_centimes ?? undefined)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Performance</p>
          <p className={cn("text-xs font-medium tabular-nums leading-snug", perfTone)}>
            {formatEuroCentimes(releve.stellium_perf_euro_centimes ?? undefined)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Perf %</p>
          <p className={cn("text-xs font-medium tabular-nums leading-snug", perfTone)}>
            {perfPct ?? "—"}
          </p>
        </div>
      </div>
    </>
  );
}

function StelliumReleveCard({ releve }: { releve: InvestissementValorisation }) {
  return (
    <li className="overflow-hidden rounded-lg border border-amber-200/60 bg-background/90 shadow-sm">
      <StelliumReleveContent releve={releve} />
    </li>
  );
}

function kindLabel(kind: EncoursChartPoint["kind"]): string {
  if (kind === "souscription") return "Souscription";
  if (kind === "complement") return "Versement complémentaire";
  return "Relevé d'encours";
}

export function InvestissementEncoursPanel({
  investissementId,
  montantInitial,
  dateSouscription,
  encoursActuel,
  encoursDate,
  onUpdated,
}: {
  investissementId: number;
  montantInitial?: number;
  dateSouscription?: number;
  encoursActuel?: number;
  encoursDate?: number;
  onUpdated?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [valorisations, setValorisations] = useState<InvestissementValorisation[]>([]);
  const [versements, setVersements] = useState<InvestissementVersement[]>([]);
  const [montant, setMontant] = useState("");
  const [dateValorisation, setDateValorisation] = useState(todayLocal());

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const [vals, vcs] = await Promise.all([
        getValorisationsByInvestissement(investissementId),
        getVersementsByInvestissement(investissementId),
      ]);
      setValorisations(vals);
      setVersements(vcs);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger l'historique d'encours");
    } finally {
      setLoading(false);
    }
  }, [investissementId]);

  useEffect(() => {
    void loadHistory();
    return subscribeInvestissementsChanged(() => void loadHistory());
  }, [loadHistory]);

  useEffect(() => {
    const effective = getEffectiveEncoursCentimes({
      encours_actuel: encoursActuel,
      montant_initial: montantInitial,
    });
    if (effective > 0) {
      setMontant((effective / 100).toString());
    }
    if (encoursDate) {
      const d = new Date(encoursDate * 1000);
      setDateValorisation(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
      );
    } else {
      setDateValorisation(todayLocal());
    }
  }, [investissementId, encoursActuel, encoursDate, montantInitial]);

  const chartData = useMemo(
    () => buildEncoursChartPoints(montantInitial, dateSouscription, valorisations, versements),
    [montantInitial, dateSouscription, valorisations, versements]
  );

  const montantInvesti = useMemo(() => {
    const complementTotal = versements.reduce((sum, v) => sum + v.montant, 0);
    return getMontantInvestiCentimes({
      montant_initial: montantInitial,
      montant_investi_total: (montantInitial ?? 0) + complementTotal,
    });
  }, [montantInitial, versements]);

  const hasComplements = versements.length > 0;

  const stelliumHistorique = useMemo(
    () =>
      [...valorisations]
        .filter(
          (v) =>
            v.stellium_versements_nets_centimes != null || v.stellium_perf_euro_centimes != null
        )
        .reverse(),
    [valorisations]
  );

  const handleSaveEncours = async () => {
    const parsed = parseFloat(montant.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Saisissez un montant d'encours valide");
      return;
    }
    setSaving(true);
    try {
      await createInvestissementValorisation({
        investissement_id: investissementId,
        montant: Math.round(parsed * 100),
        date_valorisation: dateFieldToIso(dateValorisation),
      });
      toast.success("Encours enregistré");
      await loadHistory();
      onUpdated?.();
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce relevé d'encours ?")) return;
    try {
      await deleteInvestissementValorisation(id);
      toast.success("Relevé supprimé");
      await loadHistory();
      onUpdated?.();
    } catch (error) {
      console.error(error);
      toast.error("Impossible de supprimer");
    }
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-start gap-2">
        <TrendingUp className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">Encours à date</p>
          <p className="text-xs text-muted-foreground">
            Courbe d&apos;encours, relevés de marché et versements complémentaires (barres bleues).
          </p>
        </div>
      </div>

      {loading || saving ? (
        <ChartLoading height={200} />
      ) : chartData.length === 0 ? (
        <ChartEmpty
          height={160}
          title="Aucun historique"
          subtitle="Enregistrez une souscription, un complément ou un relevé d'encours."
        />
      ) : (
        <div className="space-y-1">
          {hasComplements && (
            <div className="flex justify-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-px w-3 rounded-full"
                  style={{ backgroundColor: ENCOURS_COLOR }}
                  aria-hidden
                />
                Encours
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2 w-1 rounded-sm opacity-90"
                  style={{ backgroundColor: COMPLEMENT_COLOR }}
                  aria-hidden
                />
                Complément
              </span>
            </div>
          )}
          <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: CHART_AXIS_STROKE }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_AXIS_STROKE }}
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
                  if (!active || !payload?.[0]) return null;
                  const p = payload[0].payload as EncoursChartPoint;
                  return (
                    <ChartTooltipBox>
                      <p className="font-medium">{p.label}</p>
                      <p>{formatDashboardCurrency(p.encours)}</p>
                      <p className="text-xs text-muted-foreground">{kindLabel(p.kind)}</p>
                      {p.complementBar > 0 && (
                        <p className="text-xs text-blue-600 font-medium">
                          +{formatDashboardCurrency(p.complementBar)}
                        </p>
                      )}
                    </ChartTooltipBox>
                  );
                }}
              />
              {hasComplements && (
                <Bar
                  dataKey="complementBar"
                  name="complementBar"
                  fill={COMPLEMENT_COLOR}
                  fillOpacity={0.75}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={8}
                />
              )}
              <Line
                type={hasComplements ? "stepAfter" : "monotone"}
                dataKey="encours"
                name="encours"
                stroke={ENCOURS_COLOR}
                strokeWidth={1.5}
                dot={(props) => {
                  const { cx, cy, payload } = props as {
                    cx: number;
                    cy: number;
                    payload: EncoursChartPoint;
                  };
                  const fill =
                    payload.kind === "complement"
                      ? COMPLEMENT_COLOR
                      : payload.kind === "souscription"
                        ? "#10B981"
                        : ENCOURS_COLOR;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={payload.kind === "complement" ? 2.5 : 2}
                      fill={fill}
                      stroke="#fff"
                      strokeWidth={1}
                    />
                  );
                }}
                activeDot={{ r: 3.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`encours-montant-${investissementId}`}>Encours (€)</Label>
          <Input
            id={`encours-montant-${investissementId}`}
            type="number"
            step="0.01"
            min="0"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="Ex: 25000"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSaveEncours();
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`encours-date-${investissementId}`}>À date du</Label>
          <Input
            id={`encours-date-${investissementId}`}
            type="date"
            value={dateValorisation}
            onChange={(e) => setDateValorisation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSaveEncours();
              }
            }}
          />
        </div>
        <Button
          type="button"
          disabled={saving}
          className="sm:mb-0"
          onClick={() => void handleSaveEncours()}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer l'encours"}
        </Button>
      </div>

      {stelliumHistorique.length > 0 && (
        <details className="group rounded-lg border border-amber-200/70 bg-amber-50/40 text-sm shadow-sm">
          <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium text-amber-950">
                Historique Stellium
                <span className="font-normal text-muted-foreground ml-1.5">
                  · {stelliumHistorique.length}{" "}
                  {stelliumHistorique.length > 1 ? "relevés" : "relevé"}
                </span>
              </p>
              <div className="group-open:hidden overflow-hidden rounded-lg border border-amber-200/60 bg-background/90 shadow-sm">
                <StelliumReleveContent releve={stelliumHistorique[0]} />
              </div>
              <p className="text-xs text-muted-foreground hidden group-open:block pt-0.5">
                Un relevé par import mensuel — distinct des versements bruts CRM.
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 mt-1" />
          </summary>
          <ul className="space-y-2 max-h-60 overflow-y-auto border-t border-amber-200/50 px-3 py-2.5">
            {stelliumHistorique.map((v) => (
              <StelliumReleveCard key={v.id} releve={v} />
            ))}
          </ul>
        </details>
      )}

      {montantInvesti > 0 && (
        <p className="text-xs text-muted-foreground">
          Montant investi : {formatEuroCentimes(montantInvesti)}
        </p>
      )}

      {valorisations.length > 0 && (
        <ul className="space-y-1.5 max-h-36 overflow-y-auto rounded-md border border-border/60 p-2">
          {[...valorisations].reverse().map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 text-sm py-0.5"
            >
              <span className="tabular-nums">
                {formatEuroCentimes(v.montant)}
                <span className="text-muted-foreground ml-2 text-xs">
                  {formatCalendarDateFr(v.date_valorisation)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => void handleDelete(v.id)}
                aria-label="Supprimer ce relevé"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
