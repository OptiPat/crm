import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, ExternalLink, Pencil, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PipePlacementStepper } from "@/components/pipe/PipePlacementStepper";
import {
  archivePlacementOperation,
  createInvestissementFromConformeSouscription,
  dismissPlacementOperation,
  listPlacementOperationsForPipe,
  markPlacementPartnerResent,
  notifyPlacementOperationsChanged,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  unarchivePlacementOperation,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import {
  placementOperationCanMarkPartnerResent,
  placementOperationShowsStepper,
} from "@/lib/placement/placement-operation-stepper";
import {
  placementOperationIsArchivable,
  placementOperationIsArchived,
  placementOperationIsDeclaredInWorkflow,
} from "@/lib/placement/placement-operations-ui";
import { formatPlacementBoardActeLabel } from "@/lib/placement/placement-operation-board";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/api/invoke-error";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { SouscriptionEditDialog } from "@/components/pipe/SouscriptionEditDialog";
import { useSouscriptionHolderChoices } from "@/hooks/useSouscriptionHolderChoices";
import { getInvestissementById } from "@/lib/api/tauri-investissements";
import { getContactsByFoyer } from "@/lib/api/tauri-contacts";
import { resolveInvestissementOwnerContactId } from "@/lib/investissements/open-investissement-owner";
import {
  formatSouscriptionDetailsSummary,
  SOUSCRIPTION_PLACEMENT_MISSING_MESSAGE,
  placementOperationIsAffaireSouscription,
  placementSouscriptionIsEditable,
  placementSouscriptionNeedsManualPlacement,
  SOUSCRIPTION_PLACEMENT_ALREADY_CREATED_MESSAGE,
} from "@/lib/placement/souscription-details";

interface PipeSuiviPlacementAvancementProps {
  pipeId: number;
  /** Affaire : souscription modifiable avant validation, lien vers le placement créé. */
  pipe?: Pick<PipeRecord, "pipe_type" | "contact_id" | "secondary_contact_id">;
  /** Ouvre la fiche contact (onglet Patrimoine) du titulaire du placement créé. */
  onOpenContactPatrimoine?: (contactId: number) => void;
}

export function PipeSuiviPlacementAvancement({
  pipeId,
  pipe,
  onOpenContactPatrimoine,
}: PipeSuiviPlacementAvancementProps) {
  const isAffaire = pipe?.pipe_type === "AFFAIRE";
  const holderChoices = useSouscriptionHolderChoices(
    pipe?.contact_id ?? 0,
    pipe?.secondary_contact_id,
    isAffaire
  );
  const [editingSouscription, setEditingSouscription] = useState<PlacementOperation | null>(null);
  const [creatingPlacementId, setCreatingPlacementId] = useState<number | null>(null);

  /** Ouvre la fiche du titulaire réel du placement (contact, ou membre du foyer commun). */
  const handleOpenPlacement = async (operation: PlacementOperation) => {
    if (!pipe || !onOpenContactPatrimoine || operation.investissement_id == null) return;
    try {
      const inv = await getInvestissementById(operation.investissement_id);
      const owner = await resolveInvestissementOwnerContactId(inv, getContactsByFoyer);
      onOpenContactPatrimoine(owner?.contactId ?? pipe.contact_id);
    } catch (err) {
      toast.error(userErrorMessage(err, "Placement introuvable dans le patrimoine"));
    }
  };

  const handleCreatePlacement = async (operation: PlacementOperation) => {
    setCreatingPlacementId(operation.id);
    try {
      await createInvestissementFromConformeSouscription(operation.id);
      toast.success("Placement créé dans le patrimoine du client");
    } catch (err) {
      toast.error(userErrorMessage(err, "Impossible de créer le placement"));
    } finally {
      setCreatingPlacementId(null);
    }
  };
  const [operations, setOperations] = useState<PlacementOperation[]>([]);
  const [resentingId, setResentingId] = useState<number | null>(null);
  /** `archive` figé à l'ouverture du dialogue (pas recalculé après rechargement). */
  const [dismissTarget, setDismissTarget] = useState<{
    operation: PlacementOperation;
    archive: boolean;
  } | null>(null);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await listPlacementOperationsForPipe(pipeId);
      setOperations(
        rows.filter(
          (op) =>
            placementOperationShowsStepper(op) &&
            (op.status === "NON_CONFORME" || placementOperationIsDeclaredInWorkflow(op))
        )
      );
    } catch {
      setOperations([]);
    }
  }, [pipeId]);

  useEffect(() => {
    void reload();
    const debounceRef = { id: null as number | null };
    const onChanged = () => {
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
      debounceRef.id = window.setTimeout(() => {
        debounceRef.id = null;
        void reload();
      }, 150);
    };
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
    };
  }, [reload]);

  const handlePartnerResent = async (operation: PlacementOperation) => {
    setResentingId(operation.id);
    try {
      await markPlacementPartnerResent(operation.id);
      notifyPlacementOperationsChanged();
      toast.success("Renvoi partenaire enregistré — en attente de la réponse Stellium");
      await reload();
    } catch (err) {
      toast.error(userErrorMessage(err, "Impossible d'enregistrer la relance partenaire"));
    } finally {
      setResentingId(null);
    }
  };

  const confirmDismiss = async () => {
    if (!dismissTarget) return;
    const { operation, archive } = dismissTarget;
    setDismissingId(operation.id);
    try {
      if (archive) {
        await archivePlacementOperation(operation.id);
      } else {
        await dismissPlacementOperation(operation.id);
      }
      notifyPlacementOperationsChanged();
      toast.success(
        archive
          ? "Suivi archivé — retrouvable via « Voir les archivés »"
          : "Acte retiré du tableau — les autres actes du suivi restent ouverts"
      );
      setDismissTarget(null);
      await reload();
    } catch (err) {
      toast.error(
        userErrorMessage(
          err,
          archive ? "Impossible d'archiver le suivi" : "Impossible de masquer l'opération"
        )
      );
    } finally {
      setDismissingId(null);
    }
  };

  const handleUnarchive = async (operation: PlacementOperation) => {
    setDismissingId(operation.id);
    try {
      await unarchivePlacementOperation(operation.id);
      notifyPlacementOperationsChanged();
      toast.success("Suivi désarchivé — la carte revient dans le tableau");
      await reload();
    } catch (err) {
      toast.error(userErrorMessage(err, "Impossible de désarchiver le suivi"));
    } finally {
      setDismissingId(null);
    }
  };

  const dismissIsArchive = dismissTarget?.archive ?? false;

  if (operations.length === 0) return null;

  return (
    <div className="space-y-4">
      {operations.map((op, index) => {
        const canResent = placementOperationCanMarkPartnerResent(op);
        const archived = placementOperationIsArchived(op);
        // Mail client envoyé : le suivi est terminé, on l'archive (toujours compté).
        const archivable = placementOperationIsArchivable(op);
        const canDismiss = !archived && !archivable && op.status !== "NON_CONFORME";
        const affaireSouscription =
          isAffaire && placementOperationIsAffaireSouscription(op, pipe?.pipe_type);
        const canEditSouscription =
          affaireSouscription && placementSouscriptionIsEditable(op, pipe?.pipe_type);
        const placementCreated =
          affaireSouscription &&
          op.status === "CONFORME" &&
          op.investissement_id != null &&
          op.investissement_id > 0;
        const needsManualPlacement =
          isAffaire && placementSouscriptionNeedsManualPlacement(op, pipe?.pipe_type);
        const placementAlreadyLinked =
          affaireSouscription &&
          op.status !== "CONFORME" &&
          op.investissement_id != null &&
          op.investissement_id > 0;
        const souscriptionSummary = affaireSouscription
          ? formatSouscriptionDetailsSummary(op, holderChoices)
          : "";
        return (
          <div key={op.id} className={archived ? "space-y-2 opacity-70" : "space-y-2"}>
            <PipePlacementStepper operation={op} hideTitle={index > 0} />
            {souscriptionSummary ? (
              <p className="text-xs text-muted-foreground">{souscriptionSummary}</p>
            ) : null}
            {placementAlreadyLinked ? (
              <p className="text-xs text-muted-foreground">
                {SOUSCRIPTION_PLACEMENT_ALREADY_CREATED_MESSAGE}
              </p>
            ) : null}
            {needsManualPlacement ? (
              <p className="text-xs text-muted-foreground">
                {SOUSCRIPTION_PLACEMENT_MISSING_MESSAGE}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {placementCreated ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!onOpenContactPatrimoine || !pipe}
                  onClick={() => void handleOpenPlacement(op)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Placement créé — Voir
                </Button>
              ) : null}
              {needsManualPlacement ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={creatingPlacementId != null}
                  onClick={() => void handleCreatePlacement(op)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {creatingPlacementId === op.id ? "Création…" : "Créer le placement"}
                </Button>
              ) : null}
              {canEditSouscription ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setEditingSouscription(op)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </Button>
              ) : null}
              {archived ? (
                <Badge variant="outline" className="font-normal">
                  Archivé
                </Badge>
              ) : null}
              {canResent ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={resentingId === op.id}
                  onClick={() => void handlePartnerResent(op)}
                >
                  <Send className="h-3.5 w-3.5" />
                  {resentingId === op.id ? "Enregistrement…" : "Renvoyé chez Stellium"}
                </Button>
              ) : null}
              {archivable ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={dismissingId != null}
                  onClick={() => setDismissTarget({ operation: op, archive: true })}
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archiver
                </Button>
              ) : null}
              {canDismiss ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  disabled={dismissingId != null}
                  onClick={() => setDismissTarget({ operation: op, archive: false })}
                >
                  <Archive className="h-3.5 w-3.5" />
                  Retirer cet acte
                </Button>
              ) : null}
              {archived ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={dismissingId != null}
                  onClick={() => void handleUnarchive(op)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  {dismissingId === op.id ? "Désarchivage…" : "Désarchiver"}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}

      {pipe ? (
        <SouscriptionEditDialog
          operation={editingSouscription}
          pipeId={pipeId}
          contactId={pipe.contact_id}
          secondaryContactId={pipe.secondary_contact_id}
          onOpenChange={(open) => {
            if (!open) setEditingSouscription(null);
          }}
        />
      ) : null}

      <AlertDialog
        open={dismissTarget != null}
        onOpenChange={(open) => {
          if (!open && !dismissingId) setDismissTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dismissIsArchive ? "Archiver ce suivi ?" : "Retirer cet acte du tableau ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dismissTarget ? (
                <>
                  <span className="font-medium text-foreground">
                    {formatPlacementBoardActeLabel(dismissTarget.operation)}
                  </span>
                  {dismissIsArchive
                    ? " — le mail client a été envoyé : la carte quitte le tableau. Elle reste comptée (rémunération, historique) et se retrouve via « Voir les archivés »."
                    : " — seul cet acte sera retiré. Les autres actes du suivi (ex. versements programmés) restent ouverts."}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!dismissingId}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!dismissingId}
              onClick={(e) => {
                e.preventDefault();
                void confirmDismiss();
              }}
            >
              {dismissingId
                ? dismissIsArchive
                  ? "Archivage…"
                  : "Retrait…"
                : dismissIsArchive
                  ? "Archiver"
                  : "Retirer cet acte"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
