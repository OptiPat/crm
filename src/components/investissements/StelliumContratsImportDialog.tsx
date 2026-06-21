import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { getInvestissementsWithDetails } from "@/lib/api/tauri-investissements";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  applyStelliumImportLine,
  buildStelliumContratsImportPreview,
  mapDetailsToStelliumImportRef,
  parseStelliumContratsCsvRows,
  resolveStelliumPerfEuroCentimes,
  summarizeStelliumImportPreview,
  type StelliumContratCsvRow,
  type StelliumImportPreviewLine,
} from "@/lib/investissements/stellium-contrats-import";
import { formatStelliumPerfPctLabel } from "@/lib/investissements/stellium-perf-display";
import { prepareStelliumPerfCampaign } from "@/lib/api/tauri-stellium-perf-campaign";
import {
  inferStelliumReleveDateUnix,
  stelliumPerfPeriodeLabelFromIso,
} from "@/lib/investissements/stellium-perf-campaign";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { Mail } from "lucide-react";

type Step = "pick" | "preview";

const STATUS_LABEL: Record<StelliumImportPreviewLine["status"], string> = {
  ready: "À importer",
  unchanged: "Déjà à jour",
  not_found: "Introuvable",
  duplicate_crm: "Doublon CRM",
  duplicate_csv: "Doublon fichier",
  invalid: "Invalide",
};

const STATUS_VARIANT: Record<
  StelliumImportPreviewLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  unchanged: "secondary",
  not_found: "destructive",
  duplicate_crm: "destructive",
  duplicate_csv: "destructive",
  invalid: "destructive",
};

function readWorkbookRows(file: File): Promise<Record<string, unknown>[]> {
  return file.arrayBuffer().then((data) => {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const workbook = isCsv
      ? XLSX.read(new TextDecoder().decode(data), { type: "string", raw: true, FS: ";" })
      : XLSX.read(data, { type: "array", raw: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]!, {
      defval: "",
    });
  });
}

export function StelliumContratsImportDialog({
  open,
  onOpenChange,
  onApplied,
  onOpenInvestissement,
  investissementsVersion = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
  /** Ouvre la fiche investissement CRM (ex. depuis la page portefeuille). */
  onOpenInvestissement?: (investissementId: number) => void;
  /** Incrémenté après reload CRM (formulaire, import…) pour rafraîchir l’aperçu. */
  investissementsVersion?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<StelliumContratCsvRow[]>([]);
  const [skippedRowCount, setSkippedRowCount] = useState(0);
  const [lines, setLines] = useState<StelliumImportPreviewLine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [applyingLineKey, setApplyingLineKey] = useState<string | null>(null);
  const [preparingCampaign, setPreparingCampaign] = useState(false);
  const [importedInvestissementIds, setImportedInvestissementIds] = useState<number[]>([]);

  const summary = useMemo(() => summarizeStelliumImportPreview(lines), [lines]);
  const readyLines = useMemo(
    () => lines.filter((line) => line.status === "ready"),
    [lines]
  );

  const campaignEligibleIds = useMemo(() => {
    const ids = new Set<number>();
    for (const line of lines) {
      if (line.investissementId == null || !line.dateValorisationIso) continue;
      if (line.status === "unchanged") ids.add(line.investissementId);
      if (importedInvestissementIds.includes(line.investissementId)) {
        ids.add(line.investissementId);
      }
    }
    return [...ids];
  }, [importedInvestissementIds, lines]);

  const handlePrepareCampaign = async () => {
    if (campaignEligibleIds.length === 0) {
      toast.error("Aucun contrat éligible — importez d'abord les encours Stellium");
      return;
    }
    const releveDateUnix = inferStelliumReleveDateUnix(lines, campaignEligibleIds);
    if (releveDateUnix == null) {
      toast.error("Date de relevé introuvable ou incohérente dans le fichier");
      return;
    }
    const periodeLine = lines.find(
      (l) =>
        l.investissementId != null &&
        campaignEligibleIds.includes(l.investissementId) &&
        l.dateValorisationIso
    );
    const periode = stelliumPerfPeriodeLabelFromIso(periodeLine?.dateValorisationIso);
    setPreparingCampaign(true);
    try {
      const result = await prepareStelliumPerfCampaign({
        periode,
        releveDateUnix,
        investissementIds: campaignEligibleIds,
      });
      notifyEtiquettesChanged();
      toast.success(result.message);
    } catch (error) {
      toast.error("Campagne : " + String(error));
    } finally {
      setPreparingCampaign(false);
    }
  };

  const reset = useCallback(() => {
    setStep("pick");
    setFileName(null);
    setCsvRows([]);
    setLines([]);
    setSkippedRowCount(0);
    setSelected(new Set());
    setBusy(false);
    setRefreshing(false);
    setApplyingLineKey(null);
    setPreparingCampaign(false);
    setImportedInvestissementIds([]);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const applyPreview = useCallback((preview: StelliumImportPreviewLine[]) => {
    setLines(preview);
    setSelected((prev) => {
      const next = new Set<string>();
      for (const line of preview) {
        if (line.status === "ready" && prev.has(line.lineKey)) {
          next.add(line.lineKey);
        }
      }
      if (next.size === 0) {
        for (const line of preview) {
          if (line.status === "ready") next.add(line.lineKey);
        }
      }
      return next;
    });
  }, []);

  const refreshPreview = useCallback(async () => {
    if (csvRows.length === 0) return;
    setRefreshing(true);
    try {
      const details = await getInvestissementsWithDetails();
      const preview = buildStelliumContratsImportPreview(
        csvRows,
        details.map(mapDetailsToStelliumImportRef)
      );
      applyPreview(preview);
    } catch (error) {
      toast.error("Actualisation impossible : " + String(error));
    } finally {
      setRefreshing(false);
    }
  }, [applyPreview, csvRows]);

  useEffect(() => {
    if (!open || step !== "preview" || csvRows.length === 0) return;
    if (investissementsVersion === 0) return;
    void refreshPreview();
    // Rafraîchir uniquement quand le CRM a été rechargé (pas au premier rendu preview).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- investissementsVersion seulement
  }, [investissementsVersion]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 10 Mo)");
      return;
    }
    setBusy(true);
    try {
      const rawRows = await readWorkbookRows(file);
      if (rawRows.length === 0) {
        toast.error("Fichier vide ou illisible");
        return;
      }
      const csvRows = parseStelliumContratsCsvRows(rawRows);
      const skippedRows = rawRows.length - csvRows.length;
      if (csvRows.length === 0) {
        toast.error("Aucune ligne exploitable (n° contrat + valorisation requis)");
        return;
      }
      const details = await getInvestissementsWithDetails();
      const investissements = details.map(mapDetailsToStelliumImportRef);
      const preview = buildStelliumContratsImportPreview(csvRows, investissements);
      setFileName(file.name);
      setCsvRows(csvRows);
      setSkippedRowCount(skippedRows);
      applyPreview(preview);
      setStep("preview");
    } catch (error) {
      toast.error("Lecture impossible : " + String(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleLine = (lineKey: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(lineKey);
      else next.delete(lineKey);
      return next;
    });
  };

  const toggleAllReady = (checked: boolean) => {
    setSelected(checked ? new Set(readyLines.map((l) => l.lineKey)) : new Set());
  };

  const handleApplyOne = async (line: StelliumImportPreviewLine) => {
    if (line.status !== "ready" || applyingLineKey != null || busy) return;
    setApplyingLineKey(line.lineKey);
    try {
      const result = await applyStelliumImportLine(line);
      if (result.ok) {
        setLines((prev) =>
          prev.map((row) => (row.lineKey === line.lineKey ? result.line : row))
        );
        if (line.investissementId != null) {
          setImportedInvestissementIds((prev) =>
            prev.includes(line.investissementId!) ? prev : [...prev, line.investissementId!]
          );
        }
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(line.lineKey);
          return next;
        });
        toast.success(`Encours importé — n° ${line.numeroContrat}`);
        onApplied?.();
      } else if (result.reason === "stale") {
        toast.message("Encours déjà modifié — aperçu actualisé");
        await refreshPreview();
      } else {
        toast.error(`Échec import — n° ${line.numeroContrat}`);
      }
    } finally {
      setApplyingLineKey(null);
    }
  };

  const handleApply = async () => {
    if (selected.size === 0) {
      toast.error("Sélectionnez au moins une ligne à importer");
      return;
    }
    setBusy(true);
    try {
      let applied = 0;
      let failed = 0;
      let stale = 0;
      const updates = new Map<string, StelliumImportPreviewLine>();
      for (const line of lines) {
        if (line.status !== "ready" || !selected.has(line.lineKey)) continue;
        const result = await applyStelliumImportLine(line);
        if (result.ok) {
          applied += 1;
          updates.set(line.lineKey, result.line);
          if (line.investissementId != null) {
            setImportedInvestissementIds((prev) =>
              prev.includes(line.investissementId!) ? prev : [...prev, line.investissementId!]
            );
          }
        } else if (result.reason === "stale") {
          stale += 1;
        } else {
          failed += 1;
        }
      }
      if (stale > 0) {
        await refreshPreview();
      }
      if (applied > 0) {
        const partial =
          failed > 0 || stale > 0
            ? ` (${failed} échec(s)${stale > 0 ? `, ${stale} obsolète(s)` : ""})`
            : "";
        toast.success(`${applied} encours mis à jour${partial}`);
        setLines((prev) => prev.map((row) => updates.get(row.lineKey) ?? row));
        setSelected(new Set());
        onApplied?.();
      } else if (stale > 0) {
        toast.message(`${stale} ligne(s) déjà modifiée(s) — aperçu actualisé`);
      } else {
        toast.error(failed > 0 ? "Échec de l'import" : "Rien à appliquer");
      }
    } catch (error) {
      toast.error("Erreur : " + String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import encours Stellium</DialogTitle>
          <DialogDescription>
            Export mensuel « Contrats » (CSV ou Excel) — matching par n° de contrat, mise à jour
            des valorisations uniquement. Cliquez sur le client ou le contrat CRM pour ouvrir la
            fiche investissement.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="space-y-4 py-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 h-24 border-dashed"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              Choisir Contrats_*.csv ou .xlsx
            </Button>
          </div>
        )}

        {step === "preview" && (
          <>
            <div className="text-sm text-muted-foreground">
              {fileName} — {summary.total} ligne(s) analysées
              {skippedRowCount > 0
                ? ` (${skippedRowCount} ignorée(s) : n° contrat ou valorisation manquant)`
                : ""}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="default">{summary.ready} à importer</Badge>
              <Badge variant="secondary">{summary.unchanged} déjà à jour</Badge>
              {summary.notFound > 0 && (
                <Badge variant="destructive">{summary.notFound} introuvable(s)</Badge>
              )}
              {summary.duplicateCrm > 0 && (
                <Badge variant="destructive">{summary.duplicateCrm} doublon(s) CRM</Badge>
              )}
              {summary.duplicateCsv > 0 && (
                <Badge variant="destructive">{summary.duplicateCsv} doublon(s) fichier</Badge>
              )}
              {summary.invalid > 0 && (
                <Badge variant="destructive">{summary.invalid} invalide(s)</Badge>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto h-7 gap-1.5 text-xs"
                disabled={busy || refreshing}
                onClick={() => void refreshPreview()}
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Actualiser
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
              <Checkbox
                id="select-all-ready"
                checked={readyLines.length > 0 && selected.size === readyLines.length}
                onCheckedChange={(v) => toggleAllReady(v === true)}
              />
              <label htmlFor="select-all-ready" className="cursor-pointer">
                Sélectionner les {readyLines.length} ligne(s) prêtes
              </label>
            </div>
            <div className="flex-1 min-h-0 overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr className="text-left">
                    <th className="p-2 w-8" />
                    <th className="p-2">N°</th>
                    <th className="p-2">Statut</th>
                    <th className="p-2">Valorisation</th>
                    <th className="p-2 hidden lg:table-cell">Versements nets</th>
                    <th className="p-2 hidden lg:table-cell">Perf €</th>
                    <th className="p-2 hidden xl:table-cell">Perf %</th>
                    <th className="p-2">Encours CRM</th>
                    <th className="p-2 hidden sm:table-cell">Client CRM</th>
                    <th className="p-2 hidden md:table-cell">Contrat CRM</th>
                    <th className="p-2 w-24 text-right">Import</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.lineKey} className="border-t border-border/60">
                      <td className="p-2 align-top">
                        {line.status === "ready" && (
                          <Checkbox
                            checked={selected.has(line.lineKey)}
                            onCheckedChange={(v) => toggleLine(line.lineKey, v === true)}
                          />
                        )}
                      </td>
                      <td className="p-2 align-top font-mono">{line.numeroContrat}</td>
                      <td className="p-2 align-top">
                        <Badge variant={STATUS_VARIANT[line.status]} className="whitespace-nowrap">
                          {STATUS_LABEL[line.status]}
                        </Badge>
                        <p className="text-muted-foreground mt-0.5 max-w-[12rem]">
                          {line.statusMessage}
                        </p>
                      </td>
                      <td className="p-2 align-top tabular-nums">
                        {formatEuroCentimes(line.valorisationCentimes)}
                      </td>
                      <td className="p-2 align-top tabular-nums hidden lg:table-cell">
                        {formatEuroCentimes(line.versementsNetsCentimes ?? undefined)}
                      </td>
                      <td className="p-2 align-top tabular-nums hidden lg:table-cell">
                        {formatEuroCentimes(resolveStelliumPerfEuroCentimes(line) ?? undefined)}
                      </td>
                      <td className="p-2 align-top tabular-nums hidden xl:table-cell">
                        {formatStelliumPerfPctLabel(
                          resolveStelliumPerfEuroCentimes(line) ?? undefined,
                          line.versementsNetsCentimes ?? undefined
                        ) ?? "—"}
                      </td>
                      <td className="p-2 align-top tabular-nums">
                        {formatEuroCentimes(line.crmEncoursCentimes)}
                      </td>
                      <td className="p-2 align-top hidden sm:table-cell">
                        {line.investissementId != null && onOpenInvestissement ? (
                          <button
                            type="button"
                            className="text-left text-primary hover:underline font-medium"
                            onClick={() => onOpenInvestissement(line.investissementId!)}
                          >
                            {line.crmContactLabel ?? "—"}
                          </button>
                        ) : (
                          line.crmContactLabel ?? line.titulaire ?? "—"
                        )}
                      </td>
                      <td className="p-2 align-top hidden md:table-cell">
                        {line.investissementId != null && onOpenInvestissement ? (
                          <button
                            type="button"
                            className="text-left text-primary hover:underline"
                            onClick={() => onOpenInvestissement(line.investissementId!)}
                          >
                            {line.crmNomProduit ?? line.contratLibelle ?? "—"}
                          </button>
                        ) : (
                          line.crmNomProduit ?? line.contratLibelle ?? "—"
                        )}
                      </td>
                      <td className="p-2 align-top text-right">
                        {line.status === "ready" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs"
                            disabled={busy || applyingLineKey === line.lineKey}
                            onClick={() => void handleApplyOne(line)}
                          >
                            {applyingLineKey === line.lineKey ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Importer"
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "preview" && (
            <>
              <Button type="button" variant="outline" onClick={reset} disabled={busy}>
                Autre fichier
              </Button>
              <Button type="button" onClick={() => void handleApply()} disabled={busy || selected.size === 0}>
                Importer {selected.size} encours
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="gap-1.5"
                disabled={busy || preparingCampaign || campaignEligibleIds.length === 0}
                onClick={() => void handlePrepareCampaign()}
              >
                {preparingCampaign ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Préparer emails perf
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
