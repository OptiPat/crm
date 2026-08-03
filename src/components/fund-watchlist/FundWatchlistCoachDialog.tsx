import { Copy } from "lucide-react";
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
import type { FundWatchlistFavoritesReport } from "@/lib/api/tauri-fund-watchlist";
import { FundWatchlistCoachMarkdown } from "@/lib/fund-watchlist/fund-watchlist-coach-markdown";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: FundWatchlistFavoritesReport | null;
};

export function FundWatchlistCoachDialog({ open, onOpenChange, report }: Props) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl flex flex-col">
        <DialogHeader>
          <DialogTitle>Rapport Coach Patrimonial</DialogTitle>
          <DialogDescription>
            Analyse des favoris : perfs, top 10 Boursorama, actualités sous-jacents.
          </DialogDescription>
        </DialogHeader>

        {!report ? (
          <p className="text-sm text-muted-foreground">
            Aucun rapport disponible. Lancez une génération depuis Veille fonds.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {report.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium mb-1">Avertissements collecte</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  {report.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Généré le{" "}
              {new Date(report.generated_at * 1000).toLocaleString("fr-FR")} —{" "}
              {report.favorite_count} fond(s)
            </p>
            <div className="h-[min(55vh,480px)] overflow-y-auto rounded-md border bg-muted/30 p-4">
              <FundWatchlistCoachMarkdown markdown={report.markdown} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {report && (
            <Button type="button" variant="outline" onClick={() => void copyMarkdown()}>
              <Copy className="h-4 w-4 mr-2" />
              Copier
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
