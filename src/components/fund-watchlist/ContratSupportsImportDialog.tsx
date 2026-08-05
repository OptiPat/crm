import { useCallback, useRef, useState } from "react";
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
import {
  importContratSupports,
  type ContratSupportsImportResult,
} from "@/lib/api/tauri-contrat-supports";
import {
  decodeContratSupportsCsv,
  parseContratSupportsCsv,
  summarizeContratSupportsImport,
  type ContratSupportImportRow,
} from "@/lib/fund-watchlist/contrat-supports-import";

type Step = "pick" | "preview" | "done";

const EURO = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatDateValeur(unix: number | null): string {
  if (unix == null) return "—";
  return new Date(unix * 1000).toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

async function readSupportsCsv(file: File): Promise<ContratSupportImportRow[]> {
  const buffer = await file.arrayBuffer();
  return parseContratSupportsCsv(decodeContratSupportsCsv(buffer));
}

export function ContratSupportsImportDialog({
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
  const [rows, setRows] = useState<ContratSupportImportRow[]>([]);
  const [result, setResult] = useState<ContratSupportsImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = summarizeContratSupportsImport(rows);

  const reset = useCallback(() => {
    setStep("pick");
    setFileName(null);
    setRows([]);
    setResult(null);
    setBusy(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await readSupportsCsv(file);
      if (parsed.length === 0) {
        toast.error(
          "Aucune position reconnue (vérifiez les colonnes « Numéro contrat », « Support » et « Code ISIN »)."
        );
        return;
      }
      setFileName(file.name);
      setRows(parsed);
      setStep("preview");
    } catch {
      toast.error("Impossible de lire le fichier CSV.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const imported = await importContratSupports(rows, "supports");
      setResult(imported);
      setStep("done");
      onApplied?.();
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
          <DialogTitle>Importer les positions clients</DialogTitle>
          <DialogDescription>
            Export « Supports » de la plateforme (.csv) — rattachement par numéro de contrat.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
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
                Cliquez pour sélectionner le fichier CSV
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3 text-sm">
            <p className="font-medium">{fileName}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{summary.lignes} positions</li>
              <li>{summary.contrats} contrats</li>
              <li>{summary.supports} supports distincts</li>
              <li>{EURO.format(summary.encoursTotal)} d'encours</li>
              <li>Valeurs au {formatDateValeur(summary.dateValeur)}</li>
            </ul>
            <p className="text-muted-foreground">
              Les contrats reconnus sont remplacés par cette photo (les arbitrages sont donc pris
              en compte). Les valeurs unitaires alimentent l'historique, qui est conservé.
            </p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 text-sm">
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                {result.lignes_importees} positions importées sur {result.contrats_reconnus}{" "}
                contrats
              </li>
              <li>{EURO.format(result.encours_total)} d'encours rattaché</li>
              <li>{result.vl_points_ajoutes} nouveaux points de valeur liquidative</li>
            </ul>

            {result.contrats_inconnus.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-amber-900">
                  {result.contrats_inconnus.length} contrat(s) absent(s) du CRM —{" "}
                  {result.lignes_ignorees} ligne(s) ignorée(s)
                </p>
                <p className="mt-1 text-amber-800">
                  {result.contrats_inconnus.slice(0, 8).join(", ")}
                  {result.contrats_inconnus.length > 8 &&
                    ` et ${result.contrats_inconnus.length - 8} autre(s)`}
                </p>
              </div>
            )}

            {result.supports_hors_veille.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="font-medium">
                  {result.supports_hors_veille.length} fonds détenu(s) hors veille fonds
                </p>
                <p className="mt-1 text-muted-foreground">
                  Non analysables tant qu'ils ne sont pas dans la veille (classe de parts
                  renommée, fonds retiré de l'offre).
                </p>
                <ul className="mt-2 space-y-0.5 text-muted-foreground">
                  {result.supports_hors_veille.slice(0, 5).map((support) => (
                    <li key={support.isin}>
                      {support.libelle} — {EURO.format(support.encours)}
                    </li>
                  ))}
                  {result.supports_hors_veille.length > 5 && (
                    <li>et {result.supports_hors_veille.length - 5} autre(s)</li>
                  )}
                </ul>
              </div>
            )}
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
                Importer {summary.lignes} positions
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={() => handleOpenChange(false)}>Fermer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
