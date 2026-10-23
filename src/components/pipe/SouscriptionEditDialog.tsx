import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlacementMontantField } from "@/components/pipe/PlacementMontantField";
import { SouscriptionDetailsFields } from "@/components/pipe/SouscriptionDetailsFields";
import { useSouscriptionHolderChoices } from "@/hooks/useSouscriptionHolderChoices";
import { useTeamFormRecordLock } from "@/hooks/useTeamFormRecordLock";
import { useUnsavedCloseGuard } from "@/hooks/useUnsavedCloseGuard";
import {
  updatePlacementSouscriptionDetails,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import { userErrorMessage } from "@/lib/api/invoke-error";
import {
  formatMontantCentimesInput,
  parseMontantEurosToCentimes,
} from "@/lib/pipe/placement-montant";
import { inferTypeProduitFromStelliumProductLabel } from "@/lib/pipe/remuneration-type-produit";
import { formatStelliumProductForDisplay } from "@/lib/placement/stellium-box-placement-products";
import {
  resolveSouscriptionHolderKey,
  souscriptionExtrasFromOperation,
  souscriptionExtrasToPayload,
  souscriptionHolderFieldVisible,
  souscriptionHolderKeyFromOperation,
  souscriptionHolderPayload,
  type SouscriptionExtrasValue,
  type SouscriptionHolderKey,
} from "@/lib/placement/souscription-details";
import { toast } from "sonner";

interface SouscriptionEditDialogProps {
  operation: PlacementOperation | null;
  pipeId: number;
  contactId: number;
  secondaryContactId?: number | null;
  onOpenChange: (open: boolean) => void;
}

/** Modifie montant / titulaire / VP / réinvestissement d'une souscription non validée. */
export function SouscriptionEditDialog({
  operation,
  pipeId,
  contactId,
  secondaryContactId,
  onOpenChange,
}: SouscriptionEditDialogProps) {
  const open = operation != null;
  const closeGuard = useUnsavedCloseGuard({ open, onClose: () => onOpenChange(false) });
  // Mode équipe : enregistrement seulement une fois le verrou de l'affaire obtenu.
  const mutationLock = useTeamFormRecordLock({
    open,
    onOpenChange,
    entityType: "pipe",
    entityId: pipeId,
  });
  const choices = useSouscriptionHolderChoices(contactId, secondaryContactId, open);
  const [montantEuros, setMontantEuros] = useState("");
  const [holderKey, setHolderKey] = useState<SouscriptionHolderKey | null>(null);
  const [extras, setExtras] = useState<SouscriptionExtrasValue>(() =>
    souscriptionExtrasFromOperation({})
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!operation) return;
    setMontantEuros(formatMontantCentimesInput(operation.montant_centimes));
    setHolderKey(souscriptionHolderKeyFromOperation(operation));
    setExtras(souscriptionExtrasFromOperation(operation));
  }, [operation]);

  const typeProduit =
    operation?.type_produit?.trim() ||
    inferTypeProduitFromStelliumProductLabel(operation?.product_label ?? "");

  const handleSave = async () => {
    if (!operation) return;
    const montant = parseMontantEurosToCentimes(montantEuros);
    if (!montant) {
      toast.error("Montant souscrit requis.");
      return;
    }
    const extrasResult = souscriptionExtrasToPayload(extras, typeProduit);
    if ("error" in extrasResult) {
      toast.error(extrasResult.error);
      return;
    }
    // Choix pas encore chargés : on conserve le titulaire enregistré.
    // Champ masqué (client seul) : règle par défaut ; sinon le choix affiché.
    const holderToSave =
      choices == null
        ? holderKey
        : souscriptionHolderFieldVisible(choices)
          ? resolveSouscriptionHolderKey(holderKey, choices)
          : null;
    setSaving(true);
    try {
      await updatePlacementSouscriptionDetails(operation.id, {
        montant_centimes: montant,
        ...souscriptionHolderPayload(holderToSave),
        ...extrasResult.payload,
      });
      toast.success("Souscription mise à jour");
      closeGuard.resetDirty();
      onOpenChange(false);
    } catch (err) {
      toast.error(userErrorMessage(err, "Impossible de modifier la souscription"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(next) => !saving && closeGuard.handleOpenChange(next)}>
      <DialogContent className="sm:max-w-md" {...closeGuard.trackDirtyProps}>
        <DialogHeader>
          <DialogTitle>Modifier la souscription</DialogTitle>
          <DialogDescription>
            {formatStelliumProductForDisplay(operation?.product_label?.trim() ?? "") ||
              "Souscription partenaire"}
            {" — modifiable jusqu'à la validation du partenaire."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PlacementMontantField value={montantEuros} onChange={setMontantEuros} />
          <SouscriptionDetailsFields
            choices={choices}
            holderKey={holderKey}
            onHolderChange={setHolderKey}
            typeProduit={typeProduit}
            extras={extras}
            onExtrasChange={setExtras}
            disabled={saving}
          />
        </div>
        <DialogFooter data-no-dirty>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => closeGuard.requestClose()}
          >
            Annuler
          </Button>
          <Button
            type="button"
            disabled={saving || !mutationLock.ready}
            onClick={() => void handleSave()}
          >
            {saving
              ? "Enregistrement…"
              : !mutationLock.ready
                ? "Réservation en cours…"
                : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {closeGuard.discardDialog}
    </>
  );
}
