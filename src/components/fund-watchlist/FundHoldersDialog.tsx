import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { listFundHolders, type FundHolder } from "@/lib/api/tauri-contrat-supports";
import {
  formatFundEncours,
  formatFundPerfPercent,
  fundPerfSignTextClass,
} from "@/lib/fund-watchlist/fund-watchlist-display";
import { cn } from "@/lib/utils";

export function FundHoldersDialog({
  isin,
  nom,
  onClose,
}: {
  isin: string | null;
  nom: string | null;
  onClose: () => void;
}) {
  const [holders, setHolders] = useState<FundHolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isin) {
      setHolders(null);
      setError(null);
      return;
    }
    let active = true;
    setHolders(null);
    setError(null);
    listFundHolders(isin)
      .then((rows) => {
        if (active) setHolders(rows);
      })
      .catch((e: unknown) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [isin]);

  const total = (holders ?? []).reduce((sum, holder) => sum + (holder.encours ?? 0), 0);

  return (
    <Dialog open={isin != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{nom ?? "Détenteurs"}</DialogTitle>
          <DialogDescription>
            Positions issues du dernier import — {isin}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!holders && !error && (
          <div className="py-8 text-center">
            <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
          </div>
        )}

        {holders && holders.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            Aucun client ne détient ce fonds dans le dernier import.
          </p>
        )}

        {holders && holders.length > 0 && (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Contrat</TableHead>
                  <TableHead className="text-right">Encours</TableHead>
                  <TableHead className="text-right">+/- value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holders.map((holder, index) => (
                  <TableRow key={`${holder.numero_contrat}-${index}`}>
                    <TableCell className="font-medium">
                      {`${holder.nom} ${holder.prenom}`.trim() || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {holder.numero_contrat}
                      <span className="block text-xs">{holder.nom_produit}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatFundEncours(holder.encours)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        fundPerfSignTextClass(holder.plus_moins_value_pct)
                      )}
                    >
                      {formatFundPerfPercent(holder.plus_moins_value_pct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-sm text-muted-foreground">
              {holders.length} position(s) — {formatFundEncours(total)} au total
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
