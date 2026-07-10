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
import { ImmoImportPreviewLine as ImmoImportPreviewLineCard } from "@/components/investissements/ImmoImportPreviewLine";
import { IMPORT_PREVIEW_LIST_CLASS, ImportPreviewSection } from "@/components/contacts/import-preview-ui";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import { getAllContacts } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import {
  applyImmoCommandesImport,
  buildImmoCommandesImportPreview,
  buildImmoPreviewSeenInFileFromLines,
  defaultSelectedImmoLineKeys,
  getImmoCrmDiffFieldHighlights,
  groupImmoPreviewLines,
  IMMO_COMMANDES_SHEET_NAME,
  isImmoImportLineSelectable,
  parseImmoCommandeRows,
  patchImmoPreviewLines,
  pickImmoCommandesSheetName,
  reassessImmoPreviewLine,
  resolveImmoPreviewExistingInvestissement,
  summarizeImmoImportPreview,
  type ImmoImportPreviewLine,
  type ImmoPreviewEditablePatch,
} from "@/lib/investissements/immo-commandes-import";
import {
  IMPORT_DIALOG_BODY_CLASS,
  IMPORT_DIALOG_CONTENT_CLASS,
  IMPORT_DIALOG_FOOTER_CLASS,
  IMPORT_DIALOG_HEADER_CLASS,
  flushImportDialogPendingEdits,
  isImmoDateOnlyPreviewPatch,
  useImportDialogPreviewBodyScroll,
} from "@/components/investissements/import-dialog-fullscreen";

type Step = "pick" | "preview";

function syncImmoSelection(prev: Set<string>, lines: ImmoImportPreviewLine[]): Set<string> {
  const next = new Set(prev);
  for (const line of lines) {
    if (!isImmoImportLineSelectable(line)) next.delete(line.lineKey);
  }
  return next;
}

function readImmoWorkbookRows(
  file: File
): Promise<{ rows: Record<string, unknown>[]; missingSheet: boolean }> {
  return file.arrayBuffer().then((data) => {
    const workbook = XLSX.read(data, { type: "array", cellDates: false });
    const sheetName = pickImmoCommandesSheetName(workbook.SheetNames);
    if (!sheetName) return { rows: [] as Record<string, unknown>[], missingSheet: true };
    const normalized = workbook.SheetNames.map((n) => n.trim().toLowerCase());
    const expected = IMMO_COMMANDES_SHEET_NAME.trim().toLowerCase();
    const missingSheet = !normalized.some((n) => n === expected);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName]!,
      { defval: "", raw: false }
    );
    return { rows, missingSheet };
  });
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
  const previewBodyRef = useImportDialogPreviewBodyScroll(
    step,
    step === "preview" ? fileName : null
  );

  const summary = useMemo(() => summarizeImmoImportPreview(lines), [lines]);
  const groupedLines = useMemo(() => groupImmoPreviewLines(lines), [lines]);
  const hasCrmDiffPreview = useMemo(
    () =>
      lines.some((line) =>
        resolveImmoPreviewExistingInvestissement(line, investissements, contacts)
      ),
    [lines, investissements, contacts]
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

  const commitLineEdit = useCallback(
    (lineKey: string, patch: ImmoPreviewEditablePatch) => {
      const reassessAll = !isImmoDateOnlyPreviewPatch(patch);
      flushSync(() => {
        const next = patchImmoPreviewLines(
          linesRef.current,
          lineKey,
          patch,
          contacts,
          investissements,
          { reassessAll }
        );
        linesRef.current = next;
        setLines(next);
        setSelected((selectedPrev) => syncImmoSelection(selectedPrev, next));
      });
    },
    [contacts, investissements]
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
      setLines(preview);
      setSelected(defaultSelectedImmoLineKeys(preview));
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
        setSelected(defaultSelectedImmoLineKeys(refreshed));
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
      <DialogContent
        className={IMPORT_DIALOG_CONTENT_CLASS}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className={IMPORT_DIALOG_HEADER_CLASS}>
          <DialogTitle>Import commandes immobilier</DialogTitle>
          <DialogDescription>
            Après import des contacts Finzzle. Feuille « Investissement Immobilier » :
            rapprochement par nom/prénom, co-investisseur → foyer. Corrigez type (Pinel,
            Malraux…), montant, dates et partenaire avant import.
          </DialogDescription>
        </DialogHeader>

        <div ref={previewBodyRef} className={IMPORT_DIALOG_BODY_CLASS}>
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
                {fileName} — {summary.ready + summary.duplicateCrm} importable(s) (
                {summary.duplicateCrm} déjà en base), {summary.contactNotFound}{" "}
                investisseur(s) introuvable(s), {summary.coContactNotFound} co-investisseur(s)
                manquant(s)
              </p>
              {hasCrmDiffPreview ? (
                <p className="text-xs text-muted-foreground">
                  <span className="inline-block rounded bg-emerald-50 px-1 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:ring-emerald-800">
                    Vert
                  </span>{" "}
                  = absent en CRM ·{" "}
                  <span className="inline-block rounded bg-amber-50 px-1 ring-1 ring-amber-200 dark:bg-amber-950/35 dark:ring-amber-800">
                    Ambre
                  </span>{" "}
                  = valeur différente de l&apos;investissement CRM
                </p>
              ) : null}
              <div className={IMPORT_PREVIEW_LIST_CLASS}>
                {groupedLines.map((section) => (
                  <ImportPreviewSection
                    key={section.status}
                    title={section.label}
                    count={section.lines.length}
                  >
                    {section.lines.map((line) => {
                      const existing = resolveImmoPreviewExistingInvestissement(
                        line,
                        investissements,
                        contacts
                      );
                      return (
                        <ImmoImportPreviewLineCard
                          key={line.lineKey}
                          line={line}
                          contacts={contacts}
                          editable={line.status !== "imported"}
                          selectable={isImmoImportLineSelectable(line)}
                          checked={selected.has(line.lineKey)}
                          onToggle={(c) => toggleLine(line.lineKey, c)}
                          onPatch={(patch) => commitLineEdit(line.lineKey, patch)}
                          crmDiffHighlights={
                            existing
                              ? getImmoCrmDiffFieldHighlights(line, existing)
                              : undefined
                          }
                        />
                      );
                    })}
                  </ImportPreviewSection>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className={IMPORT_DIALOG_FOOTER_CLASS}>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => reset()} disabled={busy}>
                Changer de fichier
              </Button>
              <Button onClick={() => void handleApply()} disabled={busy}>
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
