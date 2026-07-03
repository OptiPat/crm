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
import { parseImportDate } from "@/lib/contacts/parse-import-date";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  applyImmoCommandesImport,
  buildImmoCommandesImportPreview,
  buildImmoPreviewSeenInFileFromLines,
  formatImmoEuroField,
  IMMO_COMMANDES_SHEET_NAME,
  IMMO_IMPORT_TYPE_PRODUIT_OPTIONS,
  parseImmoCommandeRows,
  parseImmoEuroFieldCentimes,
  patchImmoPreviewLines,
  pickImmoCommandesSheetName,
  reassessImmoPreviewLine,
  summarizeImmoImportPreview,
  type ImmoImportPreviewLine,
} from "@/lib/investissements/immo-commandes-import";
import {
  IMPORT_DIALOG_BODY_CLASS,
  IMPORT_DIALOG_CONTENT_CLASS,
  IMPORT_DIALOG_FOOTER_CLASS,
  IMPORT_DIALOG_HEADER_CLASS,
  flushImportDialogPendingEdits,
} from "@/components/investissements/import-dialog-fullscreen";

type Step = "pick" | "preview";

const STATUS_LABEL: Record<ImmoImportPreviewLine["status"], string> = {
  ready: "À importer",
  invalid: "Invalide",
  contact_not_found: "Investisseur introuvable",
  co_contact_not_found: "Co-investisseur introuvable",
  duplicate_crm: "Déjà en base",
  duplicate_csv: "Doublon fichier",
  imported: "Importé",
};

const STATUS_VARIANT: Record<
  ImmoImportPreviewLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  invalid: "destructive",
  contact_not_found: "destructive",
  co_contact_not_found: "destructive",
  duplicate_crm: "secondary",
  duplicate_csv: "destructive",
  imported: "secondary",
};

const SELECTABLE_STATUSES = new Set<ImmoImportPreviewLine["status"]>(["ready"]);

function readImmoWorkbookRows(
  file: File
): Promise<{ rows: Record<string, unknown>[]; missingSheet: boolean }> {
  return file.arrayBuffer().then((data) => {
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const sheetName = pickImmoCommandesSheetName(workbook.SheetNames);
    if (!sheetName) return { rows: [] as Record<string, unknown>[], missingSheet: true };
    const normalized = workbook.SheetNames.map((n) => n.trim().toLowerCase());
    const expected = IMMO_COMMANDES_SHEET_NAME.trim().toLowerCase();
    const missingSheet = !normalized.some((n) => n === expected);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName]!,
      { defval: "" }
    );
    return { rows, missingSheet };
  });
}

function isoToDateInput(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function ImmoCommandesImportDialog({
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
  const [lines, setLines] = useState<ImmoImportPreviewLine[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const summary = useMemo(() => summarizeImmoImportPreview(lines), [lines]);

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

  const applyPreview = (preview: ImmoImportPreviewLine[]) => {
    setLines(preview);
    setSelected(new Set(preview.filter((l) => l.status === "ready").map((l) => l.lineKey)));
  };

  const updateLine = useCallback(
    (
      lineKey: string,
      patch: Parameters<typeof patchImmoPreviewLines>[2]
    ) => {
      setLines((prev) => {
        const next = patchImmoPreviewLines(prev, lineKey, patch, contacts, investissements);
        linesRef.current = next;
        return next;
      });
    },
    [contacts, investissements]
  );

  const commitLineEdit = useCallback(
    (lineKey: string, patch: Parameters<typeof patchImmoPreviewLines>[2]) => {
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
      const { rows: rawRows, missingSheet } = await readImmoWorkbookRows(file);
      if (missingSheet) {
        toast.error(`Feuille « ${IMMO_COMMANDES_SHEET_NAME} » introuvable dans le classeur`);
        return;
      }
      if (rawRows.length === 0) {
        toast.error("Fichier vide ou feuille illisible");
        return;
      }
      const parsed = parseImmoCommandeRows(rawRows);
      if (parsed.length === 0) {
        toast.error(
          "Aucune ligne exploitable (investisseur, dispositif, programme, prix requis)"
        );
        return;
      }
      const [loadedContacts, loadedInvestissements] = await Promise.all([
        getAllContacts(),
        getAllInvestissements(),
      ]);
      const preview = buildImmoCommandesImportPreview(
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
      const { applied, failed, lines: updatedLines } = await applyImmoCommandesImport(
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
        const seenInFile = buildImmoPreviewSeenInFileFromLines(updatedLines);
        const refreshed = updatedLines.map((line) =>
          line.status === "imported"
            ? line
            : reassessImmoPreviewLine(line, loadedContacts, loadedInvestissements, seenInFile)
        );
        linesRef.current = refreshed;
        setLines(refreshed);
        setSelected(
          new Set(refreshed.filter((l) => l.status === "ready").map((l) => l.lineKey))
        );
        toast.success(
          `${applied} investissement(s) importé(s)${failed ? `, ${failed} échec(s)` : ""}`
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
          <DialogTitle>Import commandes immobilier</DialogTitle>
          <DialogDescription>
            Après import des contacts Finzzle. Feuille « Investissement Immobilier » :
            rapprochement par nom/prénom, co-investisseur → foyer. Corrigez type (Pinel,
            Malraux…), montant, dates et partenaire avant import.
          </DialogDescription>
        </DialogHeader>

        <div className={IMPORT_DIALOG_BODY_CLASS}>
          {step === "pick" && (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-4 rounded-lg border border-dashed">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Excel (.xlsx) — Date Acte, Prix TTC, dispositif fiscal, nom programme,
                partenaire/promoteur. Toutes les valeurs sont modifiables en preview.
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
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                Choisir un fichier
              </Button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {fileName} — {summary.ready} à importer, {summary.contactNotFound}{" "}
                investisseur(s) introuvable(s), {summary.coContactNotFound} co-investisseur(s)
                manquant(s), {summary.duplicateCrm} déjà en base
              </p>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 w-8" />
                      <th className="p-2 text-left whitespace-nowrap">Ligne</th>
                      <th className="p-2 text-left whitespace-nowrap">Contact</th>
                      <th className="p-2 text-left whitespace-nowrap">Type</th>
                      <th className="p-2 text-left whitespace-nowrap">Produit</th>
                      <th className="p-2 text-right whitespace-nowrap">Montant</th>
                      <th className="p-2 text-left whitespace-nowrap">Date acte</th>
                      <th className="p-2 text-left whitespace-nowrap">Partenaire</th>
                      <th className="p-2 text-left whitespace-nowrap">Notes</th>
                      <th className="p-2 text-left whitespace-nowrap">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const selectable = SELECTABLE_STATUSES.has(line.status);
                      const editable = line.status !== "imported";
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
                              <span className="text-muted-foreground">
                                {" "}
                                + {line.coContactLabel}
                              </span>
                            ) : null}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <select
                                className="h-8 min-w-[120px] rounded-md border border-input bg-background px-2 text-xs"
                                value={line.typeProduit}
                                onChange={(e) => {
                                  updateLine(line.lineKey, { typeProduit: e.target.value });
                                }}
                              >
                                {!IMMO_IMPORT_TYPE_PRODUIT_OPTIONS.some(
                                  (o) => o.value === line.typeProduit
                                ) && (
                                  <option value={line.typeProduit}>{line.typeProduit}</option>
                                )}
                                {IMMO_IMPORT_TYPE_PRODUIT_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              line.typeProduit
                            )}
                          </td>
                          <td className="p-2 max-w-[200px]">
                            {editable ? (
                              <Input
                                key={`${line.lineKey}-produit-${line.nomProduit}`}
                                className="h-8 min-w-[160px]"
                                defaultValue={line.nomProduit}
                                onBlur={(e) => {
                                  const value = e.target.value.trim();
                                  if (!value || value === line.nomProduit) return;
                                  commitLineEdit(line.lineKey, { nomProduit: value });
                                }}
                              />
                            ) : (
                              line.nomProduit
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {editable ? (
                              <Input
                                key={`${line.lineKey}-montant-${line.montantCentimes}`}
                                className="h-8 w-24 text-right ml-auto"
                                defaultValue={formatImmoEuroField(line.montantCentimes)}
                                onBlur={(e) => {
                                  const cents = parseImmoEuroFieldCentimes(e.target.value);
                                  if (cents == null) return;
                                  commitLineEdit(line.lineKey, { montantCentimes: cents });
                                }}
                              />
                            ) : (
                              formatEuroCentimes(line.montantCentimes)
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                key={`${line.lineKey}-date-${line.dateActeIso ?? "x"}`}
                                className="h-8 w-36"
                                type="date"
                                defaultValue={isoToDateInput(line.dateActeIso)}
                                onBlur={(e) => {
                                  const iso = parseImportDate(e.target.value);
                                  commitLineEdit(line.lineKey, { dateActeIso: iso });
                                }}
                              />
                            ) : (
                              <span className="text-muted-foreground whitespace-nowrap">
                                {line.dateActeIso ? isoToDateInput(line.dateActeIso) : "—"}
                              </span>
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                key={`${line.lineKey}-partenaire-${line.partenaireNom}`}
                                className="h-8 min-w-[140px]"
                                defaultValue={line.partenaireNom}
                                placeholder="Promoteur…"
                                onBlur={(e) => {
                                  const value = e.target.value.trim();
                                  if (value === line.partenaireNom) return;
                                  commitLineEdit(line.lineKey, { partenaireNom: value });
                                }}
                              />
                            ) : (
                              line.partenaireNom || "—"
                            )}
                          </td>
                          <td className="p-2 max-w-[180px]">
                            {editable ? (
                              <Input
                                key={`${line.lineKey}-notes-${line.notes ?? "x"}`}
                                className="h-8 min-w-[140px]"
                                defaultValue={line.notes ?? ""}
                                placeholder="Lot, état…"
                                onBlur={(e) => {
                                  const value = e.target.value.trim();
                                  if (value === (line.notes ?? "")) return;
                                  commitLineEdit(line.lineKey, { notes: value || undefined });
                                }}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">{line.notes ?? "—"}</span>
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
