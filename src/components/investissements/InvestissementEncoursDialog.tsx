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
import {
  nestedStackedDialogClass,
  nestedStackedOutsideHandlers,
  nestedStackedPortalLayer,
  type NestedStackDepth,
} from "@/lib/ui/nested-stacked-dialog";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";
import { stopWheelPropagation, useLockAppMainScroll } from "@/lib/ui/nested-sheet-scroll";

export function InvestissementEncoursDialog({
  open,
  onOpenChange,
  investissement,
  onUpdated,
  nestedSheet = false,
  nestedDepth = "sheet",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investissement: Investissement | null;
  onUpdated?: () => void;
  nestedSheet?: boolean;
  nestedDepth?: NestedStackDepth;
}) {
  useLockAppMainScroll(open && nestedSheet);

  if (!investissement) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!nestedSheet}>
      <DialogContent
        hideOverlay={nestedSheet}
        className={nestedStackedDialogClass(
          "flex max-h-[90vh] max-w-xl flex-col overflow-hidden",
          nestedSheet,
          nestedDepth
        )}
        onWheel={nestedSheet ? stopWheelPropagation : undefined}
        {...nestedStackedOutsideHandlers(nestedSheet)}
      >
        <PortalLayerProvider layer={nestedStackedPortalLayer(nestedSheet, nestedDepth)}>
          <DialogHeader className="shrink-0">
            <DialogTitle>
              Encours — {formatNomProduit(investissement.type_produit)}
            </DialogTitle>
            <DialogDescription>
              {investissement.nom_produit?.trim()
                ? investissement.nom_produit
                : "Historique et mise à jour de l'encours constaté"}
            </DialogDescription>
          </DialogHeader>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            onWheel={nestedSheet ? stopWheelPropagation : undefined}
          >
            <InvestissementEncoursPanel
              investissementId={investissement.id}
              montantInitial={investissement.montant_initial}
              dateSouscription={investissement.date_souscription}
              encoursActuel={investissement.encours_actuel}
              encoursDate={investissement.encours_date}
              onUpdated={onUpdated}
            />
          </div>
        </PortalLayerProvider>
      </DialogContent>
    </Dialog>
  );
}
