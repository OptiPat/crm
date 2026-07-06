import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ComptaDepense,
  ComptaDeplacement,
  ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import {
  buildComptaJournalEntries,
  comptaJournalTypeBadgeClass,
  comptaJournalTypeLabel,
} from "@/lib/compta/compta-journal";
import { formatComptaMoney } from "@/lib/compta/compta-money";
import { formatComptaDateFr } from "@/lib/compta/compta-month";
import { openComptaDriveLink } from "@/lib/compta/compta-drive";
import { cn } from "@/lib/utils";

interface ComptaJournalTabProps {
  depenses: ComptaDepense[];
  encaissements: ComptaEncaissement[];
  deplacements: ComptaDeplacement[];
}

export function ComptaJournalTab({
  depenses,
  encaissements,
  deplacements,
}: ComptaJournalTabProps) {
  const entries = buildComptaJournalEntries(encaissements, depenses, deplacements);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Libellé</th>
              <th className="p-3 font-medium text-right">HT</th>
              <th className="p-3 font-medium text-right">TVA</th>
              <th className="p-3 font-medium text-right">TTC</th>
              <th className="p-3 font-medium text-right">Don</th>
              <th className="p-3 font-medium">Justif.</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  Aucune entrée pour ce mois
                </td>
              </tr>
            ) : (
              entries.map((e, i) => (
                <tr key={`${e.type}-${e.date}-${i}`} className="border-t">
                  <td className="p-3 whitespace-nowrap">{formatComptaDateFr(e.date)}</td>
                  <td className="p-3">
                    <Badge
                      variant="outline"
                      className={cn(comptaJournalTypeBadgeClass(e.type))}
                    >
                      {comptaJournalTypeLabel(e.type)}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {e.libelle}
                    {e.km != null ? (
                      <span className="text-muted-foreground"> ({e.km.toFixed(1)} km)</span>
                    ) : null}
                  </td>
                  <td className="p-3 text-right">{formatComptaMoney(e.ht)}</td>
                  <td className="p-3 text-right">{formatComptaMoney(e.tva)}</td>
                  <td className="p-3 text-right">{formatComptaMoney(e.ttc)}</td>
                  <td className="p-3 text-right">
                    {e.don > 0 ? formatComptaMoney(e.don) : "—"}
                  </td>
                  <td className="p-3">
                    {e.lienDrive ? (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => void openComptaDriveLink(e.lienDrive!)}
                      >
                        <ExternalLink className="mr-1 h-3 w-3 inline" />
                        Voir
                      </Button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
