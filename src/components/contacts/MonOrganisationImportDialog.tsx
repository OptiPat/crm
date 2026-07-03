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
import {
  applyMonOrganisationImport,
  buildMonOrganisationImportPreview,
  buildMonOrganisationPreviewSeenInFileFromLines,
  buildMonOrganisationImportNameKeys,
  dateInputToIso,
  isoToDateInput,
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

const STATUS_LABEL: Record<MonOrganisationPreviewLine["status"], string> = {
  ready: "À importer",
  invalid: "Invalide",
  duplicate_crm: "Déjà en base",
  duplicate_csv: "Doublon fichier",
  imported: "Importé",
};

const STATUS_VARIANT: Record<
  MonOrganisationPreviewLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  invalid: "destructive",
  duplicate_crm: "secondary",
  duplicate_csv: "destructive",
  imported: "secondary",
};

const SELECTABLE_STATUSES = new Set<MonOrganisationPreviewLine["status"]>(["ready"]);

function readMonOrganisationWorkbookRows(
  file: File
): Promise<{ rows: Record<string, unknown>[]; missingSheet: boolean }> {
  return file.arrayBuffer().then((data) => {
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const sheetName = pickMonOrganisationSheetName(workbook.SheetNames);
    if (!sheetName) return { rows: [] as Record<string, unknown>[], missingSheet: true };
    const normalized = workbook.SheetNames.map((n) => n.trim().toLowerCase());
    const expected = MON_ORGANISATION_SHEET_NAME.trim().toLowerCase();
    const missingSheet = !normalized.some((n) => n === expected);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName]!,
      { defval: "" }
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
      setLines((prev) => {
        const patches = new Map([[lineKey, patch]]);
        const next = patchMonOrganisationPreviewLines(prev, patches, contacts);
        linesRef.current = next;
        return next;
      });
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
      setSelected(new Set(preview.filter((l) => l.status === "ready").map((l) => l.lineKey)));
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
        setSelected(new Set(refreshed.filter((l) => l.status === "ready").map((l) => l.lineKey)));
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
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 w-8" />
                      <th className="p-2 text-left whitespace-nowrap">Ligne</th>
                      <th className="p-2 text-left whitespace-nowrap">Niv.</th>
                      <th className="p-2 text-left whitespace-nowrap">Nom</th>
                      <th className="p-2 text-left whitespace-nowrap">Prénom</th>
                      <th className="p-2 text-left whitespace-nowrap">Email</th>
                      <th className="p-2 text-left whitespace-nowrap">Téléphone</th>
                      <th className="p-2 text-left whitespace-nowrap">Adresse</th>
                      <th className="p-2 text-left whitespace-nowrap">CP</th>
                      <th className="p-2 text-left whitespace-nowrap">Ville</th>
                      <th className="p-2 text-left whitespace-nowrap">Pays</th>
                      <th className="p-2 text-left whitespace-nowrap">Inscription</th>
                      <th className="p-2 text-left whitespace-nowrap">Dernier contact</th>
                      <th className="p-2 text-left whitespace-nowrap">Parrain</th>
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
                          <td className="p-2">{line.niveau}</td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[100px]"
                                defaultValue={line.nom}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (!v || v === line.nom) return;
                                  commitLineEdit(line.lineKey, { nom: v });
                                }}
                              />
                            ) : (
                              line.nom
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[100px]"
                                defaultValue={line.prenom}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (!v || v === line.prenom) return;
                                  commitLineEdit(line.lineKey, { prenom: v });
                                }}
                              />
                            ) : (
                              line.prenom
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[160px]"
                                defaultValue={line.email}
                                onBlur={(e) => {
                                  const v = e.target.value.trim().toLowerCase();
                                  if (v === line.email) return;
                                  commitLineEdit(line.lineKey, { email: v });
                                }}
                              />
                            ) : (
                              line.email
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[120px]"
                                defaultValue={line.telephone}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v === line.telephone) return;
                                  commitLineEdit(line.lineKey, { telephone: v });
                                }}
                              />
                            ) : (
                              line.telephone
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[140px]"
                                defaultValue={line.adresse}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v === line.adresse) return;
                                  commitLineEdit(line.lineKey, { adresse: v });
                                }}
                              />
                            ) : (
                              line.adresse
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 w-20"
                                defaultValue={line.codePostal}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v === line.codePostal) return;
                                  commitLineEdit(line.lineKey, { codePostal: v });
                                }}
                              />
                            ) : (
                              line.codePostal
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[100px]"
                                defaultValue={line.ville}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v === line.ville) return;
                                  commitLineEdit(line.lineKey, { ville: v });
                                }}
                              />
                            ) : (
                              line.ville
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[80px]"
                                defaultValue={line.pays}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v === line.pays) return;
                                  commitLineEdit(line.lineKey, { pays: v });
                                }}
                              />
                            ) : (
                              line.pays
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                type="date"
                                className="h-8"
                                defaultValue={isoToDateInput(line.dateInscriptionIso)}
                                onBlur={(e) => {
                                  const iso = dateInputToIso(e.target.value);
                                  if (iso === line.dateInscriptionIso) return;
                                  commitLineEdit(line.lineKey, { dateInscriptionIso: iso });
                                }}
                              />
                            ) : (
                              isoToDateInput(line.dateInscriptionIso)
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                type="date"
                                className="h-8"
                                defaultValue={isoToDateInput(line.dateDernierContactFilleulIso)}
                                onBlur={(e) => {
                                  const iso = dateInputToIso(e.target.value);
                                  if (iso === line.dateDernierContactFilleulIso) return;
                                  commitLineEdit(line.lineKey, {
                                    dateDernierContactFilleulIso: iso,
                                  });
                                }}
                              />
                            ) : (
                              isoToDateInput(line.dateDernierContactFilleulIso) || "—"
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[140px]"
                                defaultValue={line.parrainLabel}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (!v || v === line.parrainLabel) return;
                                  commitLineEdit(line.lineKey, { parrainLabel: v });
                                }}
                              />
                            ) : (
                              line.parrainLabel || "—"
                            )}
                          </td>
                          <td className="p-2">
                            <Badge variant={STATUS_VARIANT[line.status]}>
                              {STATUS_LABEL[line.status]}
                            </Badge>
                            {line.statusMessage ? (
                              <p className="text-xs text-muted-foreground mt-1 max-w-[160px]">
                                {line.statusMessage}
                              </p>
                            ) : null}
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
