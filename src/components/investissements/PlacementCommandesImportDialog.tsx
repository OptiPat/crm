import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { Input } from "@/components/ui/input";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import { getAllContacts } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import { isoToDateInput } from "@/lib/contacts/parse-import-date";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  applyPlacementCommandesImport,
  buildPlacementCommandesImportPreview,
  buildPlacementPreviewSeenInFileFromLines,
  formatPlacementEuroField,
  isPlacementPreviewViVpEditable,
  isPlacementPreviewScpiReinvestEditable,
  parsePlacementCommandeRows,
  parsePlacementEuroFieldCentimes,
  patchPlacementPreviewLines,
  pickPlacementCommandesSheetName,
  PLACEMENT_COMMANDES_SHEET_NAME,
  PLACEMENT_VP_FREQUENCE_OPTIONS,
  reassessPlacementPreviewLine,
  summarizePlacementImportPreview,
  type PlacementImportPreviewLine,
} from "@/lib/investissements/placement-commandes-import";
import {
  IMPORT_DIALOG_BODY_CLASS,
  IMPORT_DIALOG_CONTENT_CLASS,
  IMPORT_DIALOG_FOOTER_CLASS,
  IMPORT_DIALOG_HEADER_CLASS,
  flushImportDialogPendingEdits,
  commitImportDateFieldChange,
} from "@/components/investissements/import-dialog-fullscreen";

type Step = "pick" | "preview";

const STATUS_LABEL: Record<PlacementImportPreviewLine["status"], string> = {
  ready: "À importer",
  review: "À vérifier",
  invalid: "Invalide",
  contact_not_found: "Investisseur introuvable",
  co_contact_not_found: "Co-investisseur introuvable",
  duplicate_crm: "Déjà en base",
  duplicate_csv: "Doublon fichier",
  imported: "Importé",
};

const STATUS_VARIANT: Record<
  PlacementImportPreviewLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  review: "outline",
  invalid: "destructive",
  contact_not_found: "destructive",
  co_contact_not_found: "destructive",
  duplicate_crm: "secondary",
  duplicate_csv: "destructive",
  imported: "secondary",
};

const SELECTABLE_STATUSES = new Set<PlacementImportPreviewLine["status"]>([
  "ready",
  "review",
]);

function readPlacementWorkbookRows(
  file: File
): Promise<{ rows: Record<string, unknown>[]; missingSheet: boolean }> {
  return file.arrayBuffer().then((data) => {
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const sheetName = pickPlacementCommandesSheetName(workbook.SheetNames);
    if (!sheetName) return { rows: [] as Record<string, unknown>[], missingSheet: true };
    const normalized = workbook.SheetNames.map((n) => n.trim().toLowerCase());
    const expected = PLACEMENT_COMMANDES_SHEET_NAME.trim().toLowerCase();
    const missingSheet = !normalized.some((n) => n === expected);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName]!,
      { defval: "" }
    );
    return { rows, missingSheet };
  });
}

function formatProduitLabel(line: PlacementImportPreviewLine): string {
  if (line.typeProduit === "ASSURANCE_VIE") {
    return `${line.nomProduit} (AV)`;
  }
  if (line.typeProduit === "PER") {
    return `${line.nomProduit} (PER)`;
  }
  if (line.typeProduit === "CONTRAT_CAPITALISATION") {
    return `${line.nomProduit} (Cap.)`;
  }
  if (line.typeProduit === "SCPI") {
    return `${line.nomProduit} (SCPI)`;
  }
  if (line.typeProduit === "FIP_FCPI") {
    return `${line.nomProduit} (FIP)`;
  }
  if (line.typeProduit === "G3F") {
    return `${line.nomProduit} (G3F)`;
  }
  return line.nomProduit;
}

export function PlacementCommandesImportDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState<string | null>(null);
  const [lines, setLines] = useState<PlacementImportPreviewLine[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const summary = useMemo(() => summarizePlacementImportPreview(lines), [lines]);

  const sortedLines = useMemo(
    () =>
      [...lines].sort((a, b) => {
        const aAv = isPlacementPreviewViVpEditable(a.typeProduit) ? 0 : 1;
        const bAv = isPlacementPreviewViVpEditable(b.typeProduit) ? 0 : 1;
        if (aAv !== bAv) return aAv - bAv;
        return a.rowIndex - b.rowIndex;
      }),
    [lines]
  );

  const reset = useCallback(() => {
    setStep("pick");
    setFileName(null);
    setLines([]);
    setContacts([]);
    setInvestissements([]);
    setSelected(new Set());
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const applyPreview = (preview: PlacementImportPreviewLine[]) => {
    setLines(preview);
    setSelected(
      new Set(
        preview.filter((l) => SELECTABLE_STATUSES.has(l.status)).map((l) => l.lineKey)
      )
    );
  };

  const updateLine = useCallback(
    (
      lineKey: string,
      patch: Parameters<typeof patchPlacementPreviewLines>[2]
    ) => {
      setLines((prev) => {
        const next = patchPlacementPreviewLines(prev, lineKey, patch, contacts, investissements);
        linesRef.current = next;
        return next;
      });
    },
    [contacts, investissements]
  );

  const commitLineEdit = useCallback(
    (lineKey: string, patch: Parameters<typeof patchPlacementPreviewLines>[2]) => {
      flushSync(() => {
        updateLine(lineKey, patch);
      });
    },
    [updateLine]
  );

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 10 Mo)");
      return;
    }
    setBusy(true);
    try {
      const { rows: rawRows, missingSheet } = await readPlacementWorkbookRows(file);
      if (missingSheet) {
        toast.error(`Feuille « ${PLACEMENT_COMMANDES_SHEET_NAME} » introuvable dans le classeur`);
        return;
      }
      if (rawRows.length === 0) {
        toast.error("Fichier vide ou feuille illisible");
        return;
      }
      const parsed = parsePlacementCommandeRows(rawRows);
      if (parsed.length === 0) {
        toast.error("Aucune ligne exploitable (investisseur, type, libellé requis)");
        return;
      }
      const [loadedContacts, loadedInvestissements] = await Promise.all([
        getAllContacts(),
        getAllInvestissements(),
      ]);
      const preview = buildPlacementCommandesImportPreview(
        parsed,
        loadedContacts,
        loadedInvestissements
      );
      setFileName(file.name);
      setContacts(loadedContacts);
      setInvestissements(loadedInvestissements);
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

  const handleApply = async () => {
    if (selected.size === 0) {
      toast.error("Sélectionnez au moins une ligne");
      return;
    }
    setBusy(true);
    try {
      await flushImportDialogPendingEdits();
      const { applied, failed, lines: updatedLines } = await applyPlacementCommandesImport(
        linesRef.current,
        selected
      );
      if (applied > 0) {
        const [loadedContacts, loadedInvestissements] = await Promise.all([
          getAllContacts(),
          getAllInvestissements(),
        ]);
        setContacts(loadedContacts);
        setInvestissements(loadedInvestissements);
        const seenInFile = buildPlacementPreviewSeenInFileFromLines(updatedLines);
        const refreshed = updatedLines.map((line) =>
          line.status === "imported"
            ? line
            : reassessPlacementPreviewLine(line, loadedContacts, loadedInvestissements, seenInFile)
        );
        linesRef.current = refreshed;
        setLines(refreshed);
        setSelected(
          new Set(
            refreshed.filter((l) => SELECTABLE_STATUSES.has(l.status)).map((l) => l.lineKey)
          )
        );
        toast.success(
          `${applied} placement(s) importé(s)${failed ? `, ${failed} échec(s)` : ""}`
        );
        onApplied?.();
      } else {
        toast.error("Aucune ligne importée");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={IMPORT_DIALOG_CONTENT_CLASS}>
        <DialogHeader className={IMPORT_DIALOG_HEADER_CLASS}>
          <DialogTitle>Import commandes placement</DialogTitle>
          <DialogDescription>
            Feuille « Investissement Placement ». AV, PER, capitalisation : fusion par n°
            contrat. SCPI : VI/VP via cumul VC ; montants 0–300 € avec centimes (ex. 44,02 €)
            = réinv. dividendes. Fusion par investisseur + nom SCPI.
          </DialogDescription>
        </DialogHeader>

        <div className={IMPORT_DIALOG_BODY_CLASS}>
        {step === "pick" && (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-4 rounded-lg border border-dashed">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Excel (.xlsx) export commandes placements. Préfixe « 10 » retiré du nom investisseur.
              Libellé nettoyé (ALPSI, CIF).
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Choisir un fichier
            </Button>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {fileName} — {summary.ready + summary.review} importable(s) ({summary.review} à
              vérifier), {summary.duplicateCrm} déjà en base, {summary.contactNotFound}{" "}
              investisseur(s) introuvable(s)
            </p>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 w-8" />
                    <th className="p-2 text-left whitespace-nowrap">Ligne</th>
                    <th className="p-2 text-left whitespace-nowrap">Contact</th>
                    <th className="p-2 text-left whitespace-nowrap">Produit</th>
                    <th className="p-2 text-left whitespace-nowrap">Contrat</th>
                    <th className="p-2 text-right whitespace-nowrap">VI</th>
                    <th className="p-2 text-right whitespace-nowrap">VP</th>
                    <th className="p-2 text-left whitespace-nowrap">Réinv. div.</th>
                    <th className="p-2 text-left whitespace-nowrap">Date souscription</th>
                    <th className="p-2 text-left whitespace-nowrap">Clôture</th>
                    <th className="p-2 text-left whitespace-nowrap">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLines.map((line) => {
                    const editableViVp = isPlacementPreviewViVpEditable(line.typeProduit);
                    const editableReinv = isPlacementPreviewScpiReinvestEditable(line.typeProduit);
                    const selectable = SELECTABLE_STATUSES.has(line.status);
                    return (
                      <tr key={line.lineKey} className="border-b last:border-0 align-top">
                        <td className="p-2">
                          {selectable && (
                            <Checkbox
                              checked={selected.has(line.lineKey)}
                              onCheckedChange={(c) => toggleLine(line.lineKey, c === true)}
                            />
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">{line.rowIndex}</td>
                        <td className="p-2 whitespace-nowrap">
                          {line.contactLabel}
                          {line.coContactLabel ? (
                            <span className="text-muted-foreground"> + {line.coContactLabel}</span>
                          ) : null}
                        </td>
                        <td className="p-2 max-w-[200px]">{formatProduitLabel(line)}</td>
                        <td className="p-2 text-muted-foreground font-mono text-xs whitespace-nowrap">
                          {line.numeroContrat ?? "—"}
                        </td>
                        <td className="p-2 text-right">
                          {editableViVp ? (
                            <Input
                              key={`${line.lineKey}-vi-${line.montantCentimes}`}
                              className="h-8 w-24 text-right ml-auto"
                              defaultValue={formatPlacementEuroField(line.montantCentimes)}
                              onBlur={(e) => {
                                const cents = parsePlacementEuroFieldCentimes(e.target.value);
                                if (cents == null) return;
                                commitLineEdit(line.lineKey, { montantCentimes: cents });
                              }}
                            />
                          ) : (
                            formatEuroCentimes(line.montantCentimes)
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {editableViVp ? (
                            <div className="flex flex-col items-end gap-1">
                              <Input
                                key={`${line.lineKey}-vp-${line.montantVpCentimes ?? "x"}`}
                                className="h-8 w-24 text-right"
                                defaultValue={
                                  line.montantVpCentimes != null
                                    ? formatPlacementEuroField(line.montantVpCentimes)
                                    : ""
                                }
                                placeholder="—"
                                onBlur={(e) => {
                                  const cents = parsePlacementEuroFieldCentimes(e.target.value);
                                  commitLineEdit(line.lineKey, {
                                    montantVpCentimes: cents ?? undefined,
                                    frequenceVp: line.frequenceVp,
                                  });
                                }}
                              />
                              <select
                                className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs"
                                value={line.frequenceVp ?? ""}
                                onChange={(e) => {
                                  commitLineEdit(line.lineKey, {
                                    frequenceVp: e.target.value || undefined,
                                    montantVpCentimes: line.montantVpCentimes,
                                  });
                                }}
                              >
                                {PLACEMENT_VP_FREQUENCE_OPTIONS.map((opt) => (
                                  <option key={opt.value || "none"} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : line.versementProgramme && line.montantVpCentimes != null ? (
                            formatEuroCentimes(line.montantVpCentimes)
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2">
                          {editableReinv ? (
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={line.reinvestissementDividendes ?? false}
                                onCheckedChange={(c) => {
                                  updateLine(line.lineKey, {
                                    reinvestissementDividendes: c === true,
                                    pourcentageReinvestissement: line.pourcentageReinvestissement ?? 100,
                                  });
                                }}
                              />
                              <Input
                                key={`${line.lineKey}-reinv-${line.pourcentageReinvestissement ?? "x"}`}
                                className="h-8 w-14 text-right"
                                defaultValue={
                                  line.reinvestissementDividendes
                                    ? String(line.pourcentageReinvestissement ?? 100)
                                    : ""
                                }
                                placeholder="—"
                                disabled={!line.reinvestissementDividendes}
                                onBlur={(e) => {
                                  const raw = e.target.value.trim();
                                  if (!raw) return;
                                  const pct = Number.parseInt(raw, 10);
                                  if (!Number.isFinite(pct)) return;
                                  commitLineEdit(line.lineKey, {
                                    reinvestissementDividendes: true,
                                    pourcentageReinvestissement: pct,
                                  });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          ) : line.reinvestissementDividendes ? (
                            `${line.pourcentageReinvestissement ?? 100} %`
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2">
                          {editableViVp ? (
                            <Input
                              key={`${line.lineKey}-date`}
                              className="h-8 w-36"
                              type="date"
                              value={isoToDateInput(line.dateEffetIso)}
                              onChange={(e) => {
                                const next = commitImportDateFieldChange(
                                  e.target.value,
                                  line.dateEffetIso
                                );
                                if (next === null) return;
                                commitLineEdit(line.lineKey, { dateEffetIso: next });
                              }}
                            />
                          ) : (
                            <span className="text-muted-foreground whitespace-nowrap">
                              {line.dateEffetIso
                                ? isoToDateInput(line.dateEffetIso)
                                : "—"}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {line.etatCommande === "CLOSE" ? (
                            <div className="flex flex-col gap-1">
                              <Badge variant="secondary" className="w-fit">
                                Close
                              </Badge>
                              <Input
                                key={`${line.lineKey}-sortie`}
                                className="h-8 w-36"
                                type="date"
                                value={isoToDateInput(line.dateSortieIso)}
                                onChange={(e) => {
                                  const next = commitImportDateFieldChange(
                                    e.target.value,
                                    line.dateSortieIso
                                  );
                                  if (next === null) return;
                                  commitLineEdit(line.lineKey, { dateSortieIso: next });
                                }}
                              />
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <Badge variant={STATUS_VARIANT[line.status]}>
                            {STATUS_LABEL[line.status]}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-[180px]">
                            {line.statusMessage}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>

        <DialogFooter className={IMPORT_DIALOG_FOOTER_CLASS}>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("pick")} disabled={busy}>
                Autre fichier
              </Button>
              <Button
                onClick={() => void handleApply()}
                disabled={busy || selected.size === 0}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Importer ({selected.size})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
