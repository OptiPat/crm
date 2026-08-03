import { Copy, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FundWatchlistCoachLegalNotice } from "@/components/fund-watchlist/FundWatchlistCoachLegalNotice";
import { FundWatchlistCoachPrintPortal } from "@/components/fund-watchlist/FundWatchlistCoachPrintPortal";
import { useFundWatchlistCoachPrintExport } from "@/hooks/useFundWatchlistCoachPrintExport";
import type { FundWatchlistEntry, FundWatchlistFavoritesReport } from "@/lib/api/tauri-fund-watchlist";
import { FundWatchlistCoachDiagnosticPanel } from "@/components/fund-watchlist/FundWatchlistCoachDiagnosticPanel";
import { FundWatchlistCoachMarkdown } from "@/lib/fund-watchlist/fund-watchlist-coach-markdown";
import type { FundDiagnostic } from "@/lib/fund-watchlist/fund-watchlist-diagnostic";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: FundWatchlistFavoritesReport | null;
  entries: FundWatchlistEntry[];
  diagnostics: Map<string, FundDiagnostic>;
};

export function FundWatchlistCoachDialog({
  open,
  onOpenChange,
  report,
  entries,
  diagnostics,
}: Props) {
  const { printBundle, printReport, isPrinting } = useFundWatchlistCoachPrintExport();

  const copyMarkdown = async () => {
    if (!report?.markdown) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      toast.success("Rapport copié dans le presse-papiers.");
    } catch {
      toast.error("Impossible de copier le rapport.");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] min-h-[min(80vh,720px)] max-w-3xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Rapport Coach Patrimonial</DialogTitle>
            <DialogDescription>
              {report
                ? "Lecture patrimoniale en tête du rapport, puis analyse qualitative (actus, top 10)."
                : "Lecture patrimoniale sur vos favoris — générez le rapport depuis Veille fonds."}
            </DialogDescription>
          </DialogHeader>

          {!report ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              <FundWatchlistCoachDiagnosticPanel entries={entries} diagnostics={diagnostics} />
              <p className="text-sm text-muted-foreground">
                Aucun rapport disponible. Lancez une génération depuis Veille fonds.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              {report.warnings.length > 0 && (
                <div className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="font-medium mb-1">Avertissements collecte</p>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                    {report.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="shrink-0 text-xs text-muted-foreground">
                Généré le{" "}
                {new Date(report.generated_at * 1000).toLocaleString("fr-FR")} —{" "}
                {report.favorite_count} fond(s)
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border bg-muted/30 p-4 [contain:strict]">
                <FundWatchlistCoachMarkdown markdown={report.markdown} />
              </div>
              <div className="shrink-0">
                <FundWatchlistCoachLegalNotice />
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 gap-2 sm:gap-0">
            {report && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void printReport(report)}
                  disabled={isPrinting}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  {isPrinting ? "Export…" : "Exporter PDF"}
                </Button>
                <Button type="button" variant="outline" onClick={() => void copyMarkdown()}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copier
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FundWatchlistCoachPrintPortal printDoc={printBundle} />
    </>
  );
}
