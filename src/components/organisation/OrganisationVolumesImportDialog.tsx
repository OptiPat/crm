import { useCallback, useMemo, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { getAllContacts } from "@/lib/api/tauri-contacts";
import { importFilleulVolumeExercices } from "@/lib/api/tauri-filleul-volumes";
import { currentFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import {
  defaultSelectedOrganisationVolumeLineKeys,
  flattenOrganisationVolumesImportEntries,
  buildOrganisationVolumesImportPreview,
  formatOrganisationVolumeImportCellPreview,
  parseOrganisationVolumesWorkbookSheets,
  summarizeOrganisationVolumesImportPreview,
  type OrganisationVolumeImportPreviewLine,
} from "@/lib/organisation/organisation-volumes-import";
import { formatFilleulVolumeDisplay } from "@/lib/organisation/organisation-branch-volumes";

type Step = "pick" | "preview";

function readOrganisationVolumesWorkbook(file: File) {
  return file.arrayBuffer().then((data) => {
    const workbook = XLSX.read(data, { type: "array", cellDates: false });
    const sheets = workbook.SheetNames.map((sheetName) => ({
      sheetName,
      rawRows: XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[sheetName]!,
        { defval: "", raw: true }
      ),
    }));
    return parseOrganisationVolumesWorkbookSheets(sheets);
  });
}

function formatCellPreview(cell: OrganisationVolumeImportPreviewLine["cells"][number]): string {
  const raw = formatOrganisationVolumeImportCellPreview(cell);
  const [label, values] = raw.split(": ");
  if (!values) return raw;
  return `${label}: ${values
    .split(" / ")
    .map((part) => {
      const [kind, amount] = part.split(" ");
      const value = Number(amount);
      if (!Number.isFinite(value)) return part;
      const prefix = kind === "P" ? "perso " : kind === "O" ? "orga " : "";
      return `${prefix}${formatFilleulVolumeDisplay(value)}`;
    })
    .join(" · ")}`;
}

export function OrganisationVolumesImportDialog({
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
  const [lines, setLines] = useState<OrganisationVolumeImportPreviewLine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncCurrentVolumes, setSyncCurrentVolumes] = useState(true);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => summarizeOrganisationVolumesImportPreview(lines), [lines]);

  const reset = useCallback(() => {
    setStep("pick");
    setFileName(null);
    setLines([]);
    setSelected(new Set());
    setSyncCurrentVolumes(true);
    setBusy(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await readOrganisationVolumesWorkbook(file);
      if (parsed.length === 0) {
        toast.error("Feuille Excel vide ou non reconnue (Perso ou 4 niveaux)");
        return;
      }
      const contacts = await getAllContacts();
      const preview = buildOrganisationVolumesImportPreview(parsed, contacts);
      setFileName(file.name);
      setLines(preview);
      setSelected(defaultSelectedOrganisationVolumeLineKeys(preview));
      setStep("preview");
    } catch (error) {
      console.error(error);
      toast.error("Impossible de lire le fichier Excel");
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

  const handleImport = async () => {
    const entries = flattenOrganisationVolumesImportEntries(lines, selected);
    if (entries.length === 0) {
      toast.error("Aucune ligne sélectionnée");
      return;
    }
    setBusy(true);
    try {
      const applied = await importFilleulVolumeExercices({
        entries,
        syncCurrentContactVolumes: syncCurrentVolumes,
        currentExerciceLabel: currentFiscalYearLabel(),
      });
      toast.success(`${applied} volume${applied > 1 ? "s" : ""} importé${applied > 1 ? "s" : ""}`);
      handleOpenChange(false);
      onApplied?.();
    } catch (error) {
      console.error(error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importer volumes historiques</DialogTitle>
          <DialogDescription>
            Exports Finzzle « Historique des VAVC Perso » et/ou « Historique des VAVC 4 niveaux ».
            Le volume perso et le volume organisation (branche Finzzle) sont enregistrés par
            exercice ; l&apos;exercice en cours reste calculé en live.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" ? (
          <div className="flex flex-col items-center gap-4 py-8 border border-dashed rounded-lg">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <FileUp className="h-10 w-10 text-muted-foreground" aria-hidden />
            <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Choisir un fichier Excel
            </Button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            <p className="text-sm text-muted-foreground">
              {fileName} — {summary.ready} contact{summary.ready > 1 ? "s" : ""} reconnus ·{" "}
              {summary.cellCount} cellule{summary.cellCount > 1 ? "s" : ""} volume
              {summary.unmatched > 0 ? ` · ${summary.unmatched} non trouvé(s)` : ""}
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <Checkbox
                id="sync-current-volumes"
                checked={syncCurrentVolumes}
                onCheckedChange={(checked) => setSyncCurrentVolumes(checked === true)}
              />
              <Label htmlFor="sync-current-volumes" className="text-sm leading-snug cursor-pointer">
                Mettre à jour le volume propre courant pour l&apos;exercice{" "}
                {currentFiscalYearLabel()}
              </Label>
            </div>
            <ul className="space-y-2 text-sm">
              {lines.map((line) => {
                const selectable = line.status === "ready";
                return (
                  <li
                    key={line.lineKey}
                    className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2"
                  >
                    {selectable ? (
                      <Checkbox
                        checked={selected.has(line.lineKey)}
                        onCheckedChange={(checked) => toggleLine(line.lineKey, checked === true)}
                        className="mt-0.5"
                      />
                    ) : (
                      <span className="w-4" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{line.displayName}</p>
                      <p className="text-xs text-muted-foreground">{line.statusMessage}</p>
                      {line.cells.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                          {line.cells
                            .slice(0, 3)
                            .map((cell) => formatCellPreview(cell))
                            .join(" · ")}
                          {line.cells.length > 3 ? ` · +${line.cells.length - 3}` : ""}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          {step === "preview" && (
            <Button type="button" disabled={busy || summary.ready === 0} onClick={() => void handleImport()}>
              {busy ? "Import…" : "Importer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
