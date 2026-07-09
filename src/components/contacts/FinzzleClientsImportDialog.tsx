import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FinzzleClientImportPreviewLine } from "@/components/contacts/FinzzleClientImportPreviewLine";
import { IMPORT_PREVIEW_LIST_CLASS, ImportPreviewSection } from "@/components/contacts/import-preview-ui";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import { getAllContacts } from "@/lib/api/tauri-contacts";
import {
  applyFinzzleClientsImport,
  buildFinzzleClientsImportPreview,
  defaultSelectedFinzzleClientLineKeys,
  FINZZLE_DUPLICATE_ACTION_OPTIONS,
  getFinzzleEnrichFieldHighlights,
  groupFinzzleClientPreviewLines,
  isFinzzleClientLineSelectable,
  parseFinzzleClientRows,
  patchFinzzleClientPreviewLines,
  readFinzzleClientsWorkbookRows,
  reassessFinzzleClientsPreview,
  summarizeFinzzleClientsImportPreview,
  type FinzzleClientPreviewLine,
  type FinzzleDuplicateAction,
} from "@/lib/contacts/finzzle-clients-import";
import {
  IMPORT_DIALOG_BODY_CLASS,
  IMPORT_DIALOG_CONTENT_CLASS,
  IMPORT_DIALOG_FOOTER_CLASS,
  IMPORT_DIALOG_HEADER_CLASS,
  flushImportDialogPendingEdits,
} from "@/components/investissements/import-dialog-fullscreen";

type Step = "pick" | "preview";

export function FinzzleClientsImportDialog({
  open,
  onOpenChange,
  onApplied,
  onOpenLegacyImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
  onOpenLegacyImport?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState<string | null>(null);
  const [lines, setLines] = useState<FinzzleClientPreviewLine[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [duplicateAction, setDuplicateAction] = useState<FinzzleDuplicateAction>("consolidate");
  const [busy, setBusy] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const summary = useMemo(() => summarizeFinzzleClientsImportPreview(lines), [lines]);
  const groupedLines = useMemo(() => groupFinzzleClientPreviewLines(lines), [lines]);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const reset = useCallback(() => {
    setStep("pick");
    setFileName(null);
    setLines([]);
    setContacts([]);
    setSelected(new Set());
    setDuplicateAction("consolidate");
    setBusy(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const commitLineEdit = (lineKey: string, patch: Partial<FinzzleClientPreviewLine>) => {
    flushSync(() => {
      setLines((prev) => {
        const patches = new Map([[lineKey, patch]]);
        const next = patchFinzzleClientPreviewLines(prev, patches, contacts, duplicateAction);
        linesRef.current = next;
        return next;
      });
    });
  };

  const applyDuplicateAction = (action: FinzzleDuplicateAction) => {
    setDuplicateAction(action);
    setLines((prev) => {
      const next = reassessFinzzleClientsPreview(prev, contacts, action);
      linesRef.current = next;
      setSelected(defaultSelectedFinzzleClientLineKeys(next, action));
      return next;
    });
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const { rows, isFinzzle } = await readFinzzleClientsWorkbookRows(file);
      if (rows.length === 0) {
        toast.error("Fichier vide");
        return;
      }
      if (!isFinzzle) {
        toast.error(
          "Format non reconnu — attendu export Finzzle contacts (colonnes Statut, Nom, Prénom)"
        );
        return;
      }
      const parsed = parseFinzzleClientRows(rows);
      const loadedContacts = await getAllContacts();
      const preview = buildFinzzleClientsImportPreview(parsed, loadedContacts, duplicateAction);
      setFileName(file.name);
      setContacts(loadedContacts);
      setLines(preview);
      setSelected(defaultSelectedFinzzleClientLineKeys(preview, duplicateAction));
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
      const { applied, failed, lines: updatedLines } = await applyFinzzleClientsImport(
        linesRef.current,
        selected,
        duplicateAction
      );
      if (applied > 0) {
        const loadedContacts = await getAllContacts();
        setContacts(loadedContacts);
        const refreshed = reassessFinzzleClientsPreview(
          updatedLines,
          loadedContacts,
          duplicateAction
        );
        linesRef.current = refreshed;
        setLines(refreshed);
        setSelected(defaultSelectedFinzzleClientLineKeys(refreshed, duplicateAction));
        toast.success(
          `${applied} contact(s) importé(s)${failed ? `, ${failed} échec(s)` : ""}`
        );
        onApplied?.();
      } else if (failed > 0) {
        linesRef.current = updatedLines;
        setLines(updatedLines);
        toast.error(
          `${failed} échec(s) — aucune ligne importée. Détail dans la colonne État.`
        );
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
          <DialogTitle>Import contacts Finzzle</DialogTitle>
          <DialogDescription>
            Export Finzzle clients (CSV ou Excel) : identité, coordonnées, statut Client /
            Prospect / Contact, origine, TMI. Corrigez toutes les valeurs avant import.
          </DialogDescription>
        </DialogHeader>

        <div className={IMPORT_DIALOG_BODY_CLASS}>
          {step === "pick" && (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-4 rounded-lg border border-dashed">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Fichier export Finzzle (.csv point-virgule ou .xlsx) — colonnes Statut, Nom,
                Prénom, Email, Téléphone, adresse…
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
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
              {onOpenLegacyImport ? (
                <Button
                  type="button"
                  variant="link"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    handleOpenChange(false);
                    onOpenLegacyImport();
                  }}
                >
                  Import Excel personnalisé (mapping manuel)…
                </Button>
              ) : null}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
                  {fileName} — {summary.ready} à créer, {summary.enrich} à enrichir,{" "}
                  {summary.duplicateHomonym} homonyme(s), {summary.duplicateCsv} doublon(s) fichier
                </p>
                {(summary.enrich > 0 || summary.duplicateHomonym > 0) && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      Doublons :
                    </span>
                    <Select
                      value={duplicateAction}
                      onValueChange={(v) => applyDuplicateAction(v as FinzzleDuplicateAction)}
                    >
                      <SelectTrigger className="w-[280px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FINZZLE_DUPLICATE_ACTION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {summary.duplicateHomonym > 0 && duplicateAction === "consolidate" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Les homonymes (noms ou coordonnées différents) ne sont pas importables — vérifiez
                  manuellement ou choisissez « Créer des homonymes ».
                </p>
              )}
              <div className={IMPORT_PREVIEW_LIST_CLASS}>
                {groupedLines.map((section) => (
                  <ImportPreviewSection
                    key={section.status}
                    title={section.label}
                    count={section.lines.length}
                  >
                    {section.status === "enrich" ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="inline-block rounded bg-emerald-50 px-1 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:ring-emerald-800">
                          Vert
                        </span>{" "}
                        = champ vide complété ·{" "}
                        <span className="inline-block rounded bg-amber-50 px-1 ring-1 ring-amber-200 dark:bg-amber-950/35 dark:ring-amber-800">
                          Ambre
                        </span>{" "}
                        = valeur différente de la fiche CRM
                      </p>
                    ) : null}
                    {section.lines.map((line) => {
                      const existing =
                        line.status === "enrich" && line.contactId
                          ? contactById.get(line.contactId)
                          : undefined;
                      return (
                        <FinzzleClientImportPreviewLine
                          key={line.lineKey}
                          line={line}
                          editable={line.status !== "imported"}
                          selectable={isFinzzleClientLineSelectable(line, duplicateAction)}
                          checked={selected.has(line.lineKey)}
                          onToggle={(c) => toggleLine(line.lineKey, c)}
                          onEdit={(patch) => commitLineEdit(line.lineKey, patch)}
                          enrichHighlights={
                            existing
                              ? getFinzzleEnrichFieldHighlights(line, existing)
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
