import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvestissementEncoursPanel } from "@/components/investissements/InvestissementEncoursPanel";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { formatNomProduit } from "@/lib/investissements/investissement-display";

export function InvestissementEncoursDialog({
  open,
  onOpenChange,
  investissement,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investissement: Investissement | null;
  onUpdated?: () => void;
}) {
  if (!investissement) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Encours — {formatNomProduit(investissement.type_produit)}</DialogTitle>
          <DialogDescription>
            {investissement.nom_produit?.trim()
              ? investissement.nom_produit
              : "Historique et mise à jour de l'encours constaté"}
          </DialogDescription>
        </DialogHeader>
        <InvestissementEncoursPanel
          investissementId={investissement.id}
          montantInitial={investissement.montant_initial}
          dateSouscription={investissement.date_souscription}
          encoursActuel={investissement.encours_actuel}
          encoursDate={investissement.encours_date}
          onUpdated={onUpdated}
        />
      </DialogContent>
    </Dialog>
  );
}
