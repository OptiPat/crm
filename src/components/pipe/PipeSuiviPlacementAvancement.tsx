import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Send } from "lucide-react";
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

export function PipeSuiviPlacementAvancement({ pipeId }: { pipeId: number }) {
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
        return (
          <div key={op.id} className={archived ? "space-y-2 opacity-70" : "space-y-2"}>
            <PipePlacementStepper operation={op} hideTitle={index > 0} />
            <div className="flex flex-wrap items-center gap-2">
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
