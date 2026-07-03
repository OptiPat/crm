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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import { getAllContacts } from "@/lib/api/tauri-contacts";
import {
  applyFinzzleClientsImport,
  buildFinzzleClientsImportPreview,
  defaultSelectedFinzzleClientLineKeys,
  dateInputToIso,
  FINZZLE_CLIENT_CATEGORIE_OPTIONS,
  FINZZLE_CLIENT_CIVILITE_OPTIONS,
  FINZZLE_DUPLICATE_ACTION_OPTIONS,
  isoToDateInput,
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

const STATUS_LABEL: Record<FinzzleClientPreviewLine["status"], string> = {
  ready: "À importer",
  enrich: "Enrichir",
  duplicate_homonym: "Homonyme",
  invalid: "Invalide",
  duplicate_csv: "Doublon fichier",
  imported: "Importé",
};

const STATUS_VARIANT: Record<
  FinzzleClientPreviewLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  enrich: "default",
  duplicate_homonym: "destructive",
  invalid: "destructive",
  duplicate_csv: "destructive",
  imported: "secondary",
};

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
                  Les homonymes (même nom, email/tél différents) ne sont pas importables — vérifiez
                  manuellement ou choisissez « Créer des homonymes ».
                </p>
              )}
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 w-8" />
                      <th className="p-2 text-left whitespace-nowrap">Ligne</th>
                      <th className="p-2 text-left whitespace-nowrap">Statut</th>
                      <th className="p-2 text-left whitespace-nowrap">Civ.</th>
                      <th className="p-2 text-left whitespace-nowrap">Nom</th>
                      <th className="p-2 text-left whitespace-nowrap">Prénom</th>
                      <th className="p-2 text-left whitespace-nowrap">Email</th>
                      <th className="p-2 text-left whitespace-nowrap">Téléphone</th>
                      <th className="p-2 text-left whitespace-nowrap">Adresse</th>
                      <th className="p-2 text-left whitespace-nowrap">CP</th>
                      <th className="p-2 text-left whitespace-nowrap">Ville</th>
                      <th className="p-2 text-left whitespace-nowrap">Pays</th>
                      <th className="p-2 text-left whitespace-nowrap">Naissance</th>
                      <th className="p-2 text-left whitespace-nowrap">Origine</th>
                      <th className="p-2 text-left whitespace-nowrap">TMI</th>
                      <th className="p-2 text-left whitespace-nowrap">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const selectable = isFinzzleClientLineSelectable(line, duplicateAction);
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
                          <td className="p-2">
                            {editable ? (
                              <select
                                className="h-8 min-w-[100px] rounded-md border border-input bg-background px-2 text-xs"
                                value={line.categorie}
                                onChange={(e) =>
                                  commitLineEdit(line.lineKey, {
                                    categorie: e.target.value as FinzzleClientPreviewLine["categorie"],
                                  })
                                }
                              >
                                {FINZZLE_CLIENT_CATEGORIE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              line.categorie.replace(/_/g, " ")
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <select
                                className="h-8 min-w-[90px] rounded-md border border-input bg-background px-2 text-xs"
                                value={line.civilite}
                                onChange={(e) =>
                                  commitLineEdit(line.lineKey, { civilite: e.target.value })
                                }
                              >
                                {FINZZLE_CLIENT_CIVILITE_OPTIONS.map((opt) => (
                                  <option key={opt.value || "none"} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              line.civilite || "—"
                            )}
                          </td>
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
                                defaultValue={isoToDateInput(line.dateNaissanceIso)}
                                onBlur={(e) => {
                                  const iso = dateInputToIso(e.target.value);
                                  if (iso === line.dateNaissanceIso) return;
                                  commitLineEdit(line.lineKey, { dateNaissanceIso: iso });
                                }}
                              />
                            ) : (
                              isoToDateInput(line.dateNaissanceIso)
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 min-w-[120px]"
                                defaultValue={line.sourceLead}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v === line.sourceLead) return;
                                  commitLineEdit(line.lineKey, { sourceLead: v });
                                }}
                              />
                            ) : (
                              line.sourceLead
                            )}
                          </td>
                          <td className="p-2">
                            {editable ? (
                              <Input
                                className="h-8 w-16"
                                defaultValue={line.tmi}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v === line.tmi) return;
                                  commitLineEdit(line.lineKey, { tmi: v });
                                }}
                              />
                            ) : (
                              line.tmi || "—"
                            )}
                          </td>
                          <td className="p-2">
                            <Badge variant={STATUS_VARIANT[line.status]}>
                              {STATUS_LABEL[line.status]}
                            </Badge>
                            {line.statusMessage ? (
                              <p className="text-xs text-muted-foreground mt-1 max-w-[140px]">
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
