import { useCallback, useRef, useState } from "react";
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
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { importFundWatchlistEntries } from "@/lib/api/tauri-fund-watchlist";
import {
  parseCristallianceSupportsSheetRows,
  summarizeCristallianceSupportsImport,
  type CristallianceSupportsImportRow,
} from "@/lib/fund-watchlist/cristalliance-supports-import";

type Step = "pick" | "preview";

function readSupportsWorkbook(file: File): Promise<CristallianceSupportsImportRow[]> {
  return file.arrayBuffer().then((data) => {
    const workbook = XLSX.read(data, { type: "array", cellDates: false });
    const sheetName =
      workbook.SheetNames.find((name) => name.toLowerCase() === "supports") ??
      workbook.SheetNames[0];
    if (!sheetName) return [];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, {
      header: 1,
      defval: "",
      raw: true,
    });
    return parseCristallianceSupportsSheetRows(rawRows);
  });
}

export function FundWatchlistImportDialog({
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
  const [rows, setRows] = useState<CristallianceSupportsImportRow[]>([]);
  const [busy, setBusy] = useState(false);

  const summary = summarizeCristallianceSupportsImport(rows);

  const reset = useCallback(() => {
    setStep("pick");
    setFileName(null);
    setRows([]);
    setBusy(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await readSupportsWorkbook(file);
      if (parsed.length === 0) {
        toast.error("Aucun fonds reconnu (vérifiez la feuille Supports et la colonne ISIN).");
        return;
      }
      setFileName(file.name);
      setRows(parsed);
      setStep("preview");
    } catch {
      toast.error("Impossible de lire le fichier Excel.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const result = await importFundWatchlistEntries(rows, "cristalliance");
      toast.success(
        `Import terminé : ${result.inserted} ajouté(s), ${result.updated} mis à jour.`
      );
      onApplied?.();
      handleOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer les supports contrat</DialogTitle>
          <DialogDescription>
            Fichier Excel Cristalliance (.xls / .xlsx) — feuille Supports, colonnes ISIN et
            unité de compte.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" ? (
          <div className="space-y-4">
            <div
              className="border border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              {busy ? (
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              ) : (
                <FileUp className="h-8 w-8 mx-auto text-muted-foreground" />
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                Cliquez pour sélectionner un fichier Excel
              </p>
            </div>
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
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{fileName}</span>
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{summary.total} fonds reconnus</li>
              <li>{summary.withPerfYtd} avec perf. YTD</li>
              <li>{summary.withVl} avec données VL (stockées, non affichées)</li>
            </ul>
            <p className="text-muted-foreground">
              Les fonds déjà présents seront mis à jour (les favoris épinglés sont conservés).
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("pick")} disabled={busy}>
                Choisir un autre fichier
              </Button>
              <Button onClick={() => void handleImport()} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importer {summary.total} fonds
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
