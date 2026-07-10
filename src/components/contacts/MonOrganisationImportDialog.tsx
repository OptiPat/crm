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
import { MonOrganisationImportPreviewLine } from "@/components/contacts/MonOrganisationImportPreviewLine";
import { IMPORT_PREVIEW_LIST_CLASS, ImportPreviewSection } from "@/components/contacts/import-preview-ui";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import { getAllContacts } from "@/lib/api/tauri-contacts";
import {
  applyMonOrganisationImport,
  buildMonOrganisationImportPreview,
  buildMonOrganisationPreviewSeenInFileFromLines,
  buildMonOrganisationImportNameKeys,
  defaultSelectedMonOrganisationLineKeys,
  getMonOrganisationCrmDiffFieldHighlights,
  groupMonOrganisationPreviewLines,
  isMonOrganisationLineSelectable,
  MON_ORGANISATION_SHEET_NAME,
  parseMonOrganisationRows,
  patchMonOrganisationPreviewLines,
  pickMonOrganisationSheetName,
  reassessMonOrganisationPreviewLine,
  summarizeMonOrganisationImportPreview,
  type MonOrganisationPreviewLine,
} from "@/lib/contacts/mon-organisation-import";
import {
  IMPORT_DIALOG_BODY_CLASS,
  IMPORT_DIALOG_CONTENT_CLASS,
  IMPORT_DIALOG_FOOTER_CLASS,
  IMPORT_DIALOG_HEADER_CLASS,
  flushImportDialogPendingEdits,
} from "@/components/investissements/import-dialog-fullscreen";

type Step = "pick" | "preview";

function syncMonOrganisationSelection(
  prev: Set<string>,
  lines: MonOrganisationPreviewLine[]
): Set<string> {
  const next = new Set(prev);
  for (const line of lines) {
    if (!isMonOrganisationLineSelectable(line)) next.delete(line.lineKey);
  }
  return next;
}

function readMonOrganisationWorkbookRows(
  file: File
): Promise<{ rows: Record<string, unknown>[]; missingSheet: boolean }> {
  return file.arrayBuffer().then((data) => {
    const workbook = XLSX.read(data, { type: "array", cellDates: false });
    const sheetName = pickMonOrganisationSheetName(workbook.SheetNames);
    if (!sheetName) return { rows: [] as Record<string, unknown>[], missingSheet: true };
    const normalized = workbook.SheetNames.map((n) => n.trim().toLowerCase());
    const expected = MON_ORGANISATION_SHEET_NAME.trim().toLowerCase();
    const missingSheet = !normalized.some((n) => n === expected);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName]!,
      { defval: "", raw: false }
    );
    return { rows, missingSheet };
  });
}

export function MonOrganisationImportDialog({
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
  const [lines, setLines] = useState<MonOrganisationPreviewLine[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const summary = useMemo(() => summarizeMonOrganisationImportPreview(lines), [lines]);
  const groupedLines = useMemo(() => groupMonOrganisationPreviewLines(lines), [lines]);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const reset = useCallback(() => {
    setStep("pick");
    setFileName(null);
    setLines([]);
    setContacts([]);
    setSelected(new Set());
    setBusy(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const commitLineEdit = (lineKey: string, patch: Partial<MonOrganisationPreviewLine>) => {
    flushSync(() => {
      const patches = new Map([[lineKey, patch]]);
      const next = patchMonOrganisationPreviewLines(linesRef.current, patches, contacts);
      linesRef.current = next;
      setLines(next);
      setSelected((selectedPrev) => syncMonOrganisationSelection(selectedPrev, next));
    });
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const { rows, missingSheet } = await readMonOrganisationWorkbookRows(file);
      if (rows.length === 0) {
        toast.error(
          missingSheet
            ? `Feuille « ${MON_ORGANISATION_SHEET_NAME} » introuvable`
            : "Fichier vide"
        );
        return;
      }
      const parsed = parseMonOrganisationRows(rows);
      const loadedContacts = await getAllContacts();
      const preview = buildMonOrganisationImportPreview(parsed, loadedContacts);
      setFileName(file.name);
      setContacts(loadedContacts);
      setLines(preview);
      setSelected(defaultSelectedMonOrganisationLineKeys(preview));
      setStep("preview");
      if (missingSheet) {
        toast.warning(`Feuille « ${MON_ORGANISATION_SHEET_NAME} » absente — première feuille utilisée`);
      }
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
      const { applied, failed, lines: updatedLines } = await applyMonOrganisationImport(
        linesRef.current,
        selected
      );
      if (applied > 0) {
        const loadedContacts = await getAllContacts();
        setContacts(loadedContacts);
        const seenInFile = buildMonOrganisationPreviewSeenInFileFromLines(updatedLines);
        const importNameKeys = buildMonOrganisationImportNameKeys(updatedLines);
        const refreshed = updatedLines.map((line) =>
          line.status === "imported"
            ? line
            : reassessMonOrganisationPreviewLine(
                line,
                loadedContacts,
                seenInFile,
                importNameKeys
              )
        );
        linesRef.current = refreshed;
        setLines(refreshed);
        setSelected(defaultSelectedMonOrganisationLineKeys(refreshed));
        toast.success(
          `${applied} filleul(s) importé(s)${failed ? `, ${failed} échec(s)` : ""}`
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
          <DialogTitle>Import Mon Organisation (filleuls)</DialogTitle>
          <DialogDescription>
            Export Finzzle « Mon Organisation » : consultants du réseau, parrainage hiérarchique,
            coordonnées. Date d&apos;entrée = date d&apos;inscription (pas invitation JD/PO).
            Corrigez toutes les valeurs avant import.
          </DialogDescription>
        </DialogHeader>

        <div className={IMPORT_DIALOG_BODY_CLASS}>
          {step === "pick" && (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-4 rounded-lg border border-dashed">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Excel (.xlsx) — feuille « Mon Organisation ». Import par niveau hiérarchique
                (00 → 03) pour créer les parrains avant les filleuls.
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
                {fileName} — {summary.ready} à importer, {summary.duplicateCrm} déjà en base,{" "}
                {summary.duplicateCsv} doublon(s) fichier
              </p>
              <div className={IMPORT_PREVIEW_LIST_CLASS}>
                {groupedLines.map((section) => (
                  <ImportPreviewSection
                    key={section.status}
                    title={section.label}
                    count={section.lines.length}
                  >
                    {section.status === "duplicate_crm" ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="inline-block rounded bg-emerald-50 px-1 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:ring-emerald-800">
                          Vert
                        </span>{" "}
                        = absent en CRM ·{" "}
                        <span className="inline-block rounded bg-amber-50 px-1 ring-1 ring-amber-200 dark:bg-amber-950/35 dark:ring-amber-800">
                          Ambre
                        </span>{" "}
                        = valeur différente de la fiche CRM
                      </p>
                    ) : null}
                    {section.lines.map((line) => {
                      const existing =
                        line.status === "duplicate_crm" && line.contactId
                          ? contactById.get(line.contactId)
                          : undefined;
                      return (
                        <MonOrganisationImportPreviewLine
                          key={line.lineKey}
                          line={line}
                          editable={line.status !== "imported"}
                          selectable={isMonOrganisationLineSelectable(line)}
                          checked={selected.has(line.lineKey)}
                          onToggle={(c) => toggleLine(line.lineKey, c)}
                          onEdit={(patch) => commitLineEdit(line.lineKey, patch)}
                          crmDiffHighlights={
                            existing
                              ? getMonOrganisationCrmDiffFieldHighlights(line, existing, contacts)
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
              <Button type="button" variant="outline" onClick={() => reset()} disabled={busy}>
                Changer de fichier
              </Button>
              <Button type="button" onClick={() => void handleApply()} disabled={busy}>
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
