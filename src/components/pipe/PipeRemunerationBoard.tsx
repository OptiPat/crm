import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Euro } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  listPipeRemunerationRows,
  remunerationRowExerciceUnix,
  type PipeRemunerationRow,
} from "@/lib/api/tauri-pipe-remuneration";
import { updatePlacementOperationPvManual } from "@/lib/api/tauri-box-placement";
import { PLACEMENT_OPERATIONS_CHANGED_EVENT } from "@/lib/api/tauri-box-placement";
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";
import { computeRemunerationCentimes } from "@/lib/pipe/remuneration-calc";
import {
  REMUNERATION_ALL_EXERCICES,
  defaultRemunerationExercice,
  groupRemunerationRowsByAffaire,
  remunerationCalcDetail,
  remunerationExerciceOptions,
} from "@/lib/pipe/remuneration-board";
import { remunerationFraisDeduitsPct } from "@/lib/pipe/remuneration-scpi-frais";
import {
  currentFiscalYearLabel,
  fiscalYearLabelForUnix,
} from "@/lib/pipe/remuneration-fiscal-year";
import {
  defaultPvForTypeProduit,
  remunerationPvKindForTypeProduit,
} from "@/lib/pipe/remuneration-pv";
import {
  REMUNERATION_SETTINGS_CHANGED_EVENT,
  getRemunerationCifEnabled,
  getTpcForFiscalYear,
} from "@/lib/pipe/remuneration-settings";
import { inferTypeProduitFromStelliumProductLabel } from "@/lib/pipe/remuneration-type-produit";
import { formatPipeContactLabel } from "@/lib/pipe/pipe-types";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/api/invoke-error";

function resolveTypeProduit(row: PipeRemunerationRow): string {
  const stored = row.type_produit?.trim();
  if (stored) return stored;
  return inferTypeProduitFromStelliumProductLabel(row.product_label?.trim() ?? "");
}

interface ComputedRemunerationRow {
  pipeId: number;
  row: PipeRemunerationRow;
  typeProduit: string;
  fiscalYear: string;
  tpc: number | null;
  remuneration: number | null;
  fraisDeduitsPct: number | null;
  calcDetail: string | null;
}

export function PipeRemunerationBoard() {
  const [rows, setRows] = useState<PipeRemunerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cifEnabled, setCifEnabled] = useState(false);
  const [tpcByYear, setTpcByYear] = useState<Record<string, number>>({});
  const [pvDrafts, setPvDrafts] = useState<Record<number, string>>({});
  const [savingPvId, setSavingPvId] = useState<number | null>(null);
  /** `null` = exercice par défaut (en cours, sinon le plus récent). */
  const [exerciceChoice, setExerciceChoice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [data, cif] = await Promise.all([
        listPipeRemunerationRows(),
        getRemunerationCifEnabled(),
      ]);
      setRows(data);
      setCifEnabled(cif);
      const years = [
        ...new Set(
          data.map((r) =>
            fiscalYearLabelForUnix(remunerationRowExerciceUnix(r))
          )
        ),
      ];
      const tpcEntries = await Promise.all(
        years.map(async (year) => {
          const tpc = await getTpcForFiscalYear(year);
          return [year, tpc] as const;
        })
      );
      const nextTpc: Record<string, number> = {};
      for (const [year, tpc] of tpcEntries) {
        if (tpc != null) nextTpc[year] = tpc;
      }
      setTpcByYear(nextTpc);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger la rémunération");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const unsubPipe = subscribePipeChanged(() => void reload());
    const onPlacement = () => void reload();
    const onSettings = () => void reload();
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onPlacement);
    window.addEventListener(REMUNERATION_SETTINGS_CHANGED_EVENT, onSettings);
    return () => {
      unsubPipe();
      window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onPlacement);
      window.removeEventListener(REMUNERATION_SETTINGS_CHANGED_EVENT, onSettings);
    };
  }, [reload]);

  const computedRows = useMemo<ComputedRemunerationRow[]>(
    () =>
      rows.map((row) => {
        const typeProduit = resolveTypeProduit(row);
        const fiscalYear = fiscalYearLabelForUnix(remunerationRowExerciceUnix(row));
        const tpc = tpcByYear[fiscalYear] ?? null;
        const calc = {
          montantCentimes: row.montant_centimes,
          typeProduit,
          cifEnabled,
          pvManual: row.pv_manual,
          productLabel: row.product_label,
        };
        return {
          pipeId: row.pipe_id,
          row,
          typeProduit,
          fiscalYear,
          tpc,
          remuneration:
            tpc != null ? computeRemunerationCentimes({ ...calc, tpcPercent: tpc }) : null,
          fraisDeduitsPct: remunerationFraisDeduitsPct({
            typeProduit,
            productLabel: row.product_label,
          }),
          calcDetail: remunerationCalcDetail({ ...calc, tpcPercent: tpc }),
        };
      }),
    [rows, tpcByYear, cifEnabled]
  );

  const exerciceOptions = useMemo(
    () => remunerationExerciceOptions(computedRows.map((r) => r.fiscalYear)),
    [computedRows]
  );
  const exercice =
    exerciceChoice != null &&
    (exerciceChoice === REMUNERATION_ALL_EXERCICES || exerciceOptions.includes(exerciceChoice))
      ? exerciceChoice
      : defaultRemunerationExercice(exerciceOptions, currentFiscalYearLabel());

  const visibleRows = useMemo(
    () =>
      exercice === REMUNERATION_ALL_EXERCICES
        ? computedRows
        : computedRows.filter((r) => r.fiscalYear === exercice),
    [computedRows, exercice]
  );
  const groups = useMemo(() => groupRemunerationRowsByAffaire(visibleRows), [visibleRows]);
  const totalRemuneration = visibleRows.reduce((sum, r) => sum + (r.remuneration ?? 0), 0);

  const savePvManual = async (row: PipeRemunerationRow, raw: string) => {
    const normalized = raw.trim().replace(",", ".");
    const pv = normalized ? Number(normalized) : null;
    if (pv != null && (!Number.isFinite(pv) || pv <= 0)) {
      toast.error("PV invalide");
      return;
    }
    setSavingPvId(row.placement_operation_id);
    try {
      await updatePlacementOperationPvManual(row.placement_operation_id, pv);
      await reload();
    } catch (err) {
      toast.error(userErrorMessage(err, "Impossible d'enregistrer le montant"));
    } finally {
      setSavingPvId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground px-1">Chargement…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Aucune affaire gagnée avec montant souscrit.
        <br />
        Déclarez une souscription ou un versement complémentaire avec montant, puis passez l&apos;affaire
        en Gagnée.
      </div>
    );
  }

  const renderRow = (computed: ComputedRemunerationRow, affaireCells: ReactNode) => {
    const { row, typeProduit, tpc, remuneration, fraisDeduitsPct, calcDetail } = computed;
    const pvKind = remunerationPvKindForTypeProduit(typeProduit);
    const autoPv = defaultPvForTypeProduit(typeProduit, { cifEnabled });
    const pvDraft =
      pvDrafts[row.placement_operation_id] ??
      (row.pv_manual != null ? String(row.pv_manual).replace(".", ",") : "");
    return (
      <tr key={row.placement_operation_id} className="border-b last:border-0">
        {affaireCells}
        <td className="px-3 py-2">
          {row.product_label?.trim() || <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatEuroCentimes(row.montant_centimes)}
          {fraisDeduitsPct != null ? (
            <span className="block text-xs text-muted-foreground">
              − {String(fraisDeduitsPct).replace(".", ",")} % frais
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2 text-right">
          {pvKind === "immo_manual" ? (
            <div className="flex justify-end">
              <Input
                className="h-8 w-20 text-right tabular-nums"
                inputMode="decimal"
                placeholder="0,3"
                value={pvDraft}
                disabled={savingPvId === row.placement_operation_id}
                onChange={(e) =>
                  setPvDrafts((prev) => ({
                    ...prev,
                    [row.placement_operation_id]: e.target.value,
                  }))
                }
                onBlur={() => void savePvManual(row, pvDraft)}
              />
            </div>
          ) : (
            <span className="tabular-nums">{autoPv?.toString().replace(".", ",") ?? "—"}</span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {tpc != null ? `${tpc} %` : <span className="text-muted-foreground">—</span>}
        </td>
        <td
          className="px-3 py-2 text-right tabular-nums font-medium"
          title={calcDetail ?? undefined}
        >
          {remuneration != null ? (
            <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">
              {formatEuroCentimes(remuneration)}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">
              {tpc == null ? "TPC manquant" : "PV manquant"}
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground px-1">
        <Select value={exercice} onValueChange={setExerciceChoice}>
          <SelectTrigger className="h-8 w-[12rem]" aria-label="Exercice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {exerciceOptions.map((label) => (
              <SelectItem key={label} value={label}>
                Exercice {label}
              </SelectItem>
            ))}
            <SelectItem value={REMUNERATION_ALL_EXERCICES}>Tous les exercices</SelectItem>
          </SelectContent>
        </Select>
        <span className="inline-flex items-center gap-1.5">
          <Euro className="h-4 w-4" />
          Total rémunération :{" "}
          <strong className="text-foreground">{formatEuroCentimes(totalRemuneration)}</strong>
        </span>
        {cifEnabled ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs">CIF actif (PV SCPI 0,5)</span>
        ) : null}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Affaire</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Produit</th>
              <th className="px-3 py-2 font-medium text-right">Montant souscrit</th>
              <th className="px-3 py-2 font-medium text-right">PV</th>
              <th className="px-3 py-2 font-medium text-right">TPC</th>
              <th className="px-3 py-2 font-medium text-right">Rémunération</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const first = group.rows[0].row;
              const multi = group.rows.length > 1;
              // Plusieurs souscriptions : affaire et client fusionnés + ligne de sous-total.
              const span = multi ? group.rows.length + 1 : 1;
              const affaireCells = (
                <>
                  <td className="px-3 py-2 font-medium align-top" rowSpan={span}>
                    {first.pipe_titre}
                  </td>
                  <td className="px-3 py-2 align-top" rowSpan={span}>
                    {formatPipeContactLabel({
                      contact_prenom: first.contact_prenom,
                      contact_nom: first.contact_nom,
                    })}
                  </td>
                </>
              );
              const subtotal = group.rows.reduce((sum, r) => sum + (r.remuneration ?? 0), 0);
              return (
                <Fragment key={group.pipeId}>
                  {group.rows.map((computed, index) =>
                    renderRow(computed, index === 0 ? affaireCells : null)
                  )}
                  {multi ? (
                    <tr className="border-b last:border-0 bg-muted/20">
                      <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                        Sous-total ({group.rows.length} souscriptions)
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                        {formatEuroCentimes(subtotal)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {Object.keys(tpcByYear).length === 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-400 px-1">
          Renseignez votre TPC dans Paramètres → Rémunération.
        </p>
      ) : null}
    </div>
  );
}
