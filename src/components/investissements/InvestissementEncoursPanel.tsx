import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import { dateFieldToIso, todayLocal } from "@/lib/contacts/contact-form-utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  formatDashboardCurrency,
} from "@/components/dashboard/dashboard-format";
import { ChartEmpty, ChartLoading, ChartTooltipBox } from "@/components/dashboard/dashboard-ui";
import { Loader2, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const ENCOURS_COLOR = "#C9A227";

interface ChartPoint {
  key: string;
  label: string;
  montant: number;
  kind: "souscription" | "valorisation";
}

function buildChartPoints(
  montantInitial?: number,
  dateSouscription?: number,
  valorisations: InvestissementValorisation[] = []
): ChartPoint[] {
  const points: ChartPoint[] = [];
  if (montantInitial != null && montantInitial > 0 && dateSouscription) {
    points.push({
      key: `sub-${dateSouscription}`,
      label: formatCalendarDateFr(dateSouscription),
      montant: montantInitial / 100,
      kind: "souscription",
    });
  }
  for (const v of valorisations) {
    points.push({
      key: `val-${v.id}`,
      label: formatCalendarDateFr(v.date_valorisation),
      montant: v.montant / 100,
      kind: "valorisation",
    });
  }
  return points;
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
  const [montant, setMontant] = useState("");
  const [dateValorisation, setDateValorisation] = useState(todayLocal());

  const loadValorisations = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await getValorisationsByInvestissement(investissementId);
      setValorisations(rows);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger l'historique d'encours");
    } finally {
      setLoading(false);
    }
  }, [investissementId]);

  useEffect(() => {
    void loadValorisations();
  }, [loadValorisations]);

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
    () => buildChartPoints(montantInitial, dateSouscription, valorisations),
    [montantInitial, dateSouscription, valorisations]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await loadValorisations();
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
      await loadValorisations();
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
            Met à jour le dashboard et l&apos;encours client — le montant investi reste inchangé.
          </p>
        </div>
      </div>

      {loading ? (
        <ChartLoading height={180} />
      ) : chartData.length === 0 ? (
        <ChartEmpty
          height={160}
          title="Aucun historique"
          subtitle="Enregistrez un premier encours pour voir la courbe d'évolution."
        />
      ) : (
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  const p = payload[0].payload as ChartPoint;
                  return (
                    <ChartTooltipBox>
                      <p className="font-medium">{p.label}</p>
                      <p>{formatDashboardCurrency(p.montant)}</p>
                      {p.kind === "souscription" && (
                        <p className="text-xs text-muted-foreground">Montant souscrit</p>
                      )}
                    </ChartTooltipBox>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="montant"
                stroke={ENCOURS_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: ENCOURS_COLOR }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`encours-date-${investissementId}`}>À date du</Label>
          <Input
            id={`encours-date-${investissementId}`}
            type="date"
            value={dateValorisation}
            onChange={(e) => setDateValorisation(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={saving} className="sm:mb-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </form>

      {montantInitial != null && montantInitial > 0 && (
        <p className="text-xs text-muted-foreground">
          Montant investi (souscription) : {formatEuroCentimes(montantInitial)}
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
