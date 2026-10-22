import { useState } from "react";
import { Archive } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import type { PlacementOperationWithContact } from "@/lib/api/tauri-box-placement";
import {
  formatPlacementBoardActeLabel,
  formatPlacementBoardContactLabel,
} from "@/lib/placement/placement-operation-board";

/**
 * Détail d'une carte Stellium sans suivi ouvrable (pas de pipe_id, ou suivi introuvable) :
 * seul endroit où retirer l'acte, le tableau n'ayant plus de bouton de retrait.
 */
export function PipePlacementOrphanDetail({
  row,
  message,
  onDismiss,
}: {
  row: PlacementOperationWithContact;
  message: string;
  onDismiss: (row: PlacementOperationWithContact) => Promise<boolean>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const canDismiss = row.operation.status !== "NON_CONFORME";

  const confirmDismiss = async () => {
    setDismissing(true);
    try {
      if (await onDismiss(row)) setConfirmOpen(false);
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 px-6 py-8">
      <div>
        <p className="text-sm font-medium">{formatPlacementBoardActeLabel(row.operation)}</p>
        <p className="text-sm text-muted-foreground">{formatPlacementBoardContactLabel(row)}</p>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {canDismiss ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            disabled={dismissing}
            onClick={() => setConfirmOpen(true)}
          >
            <Archive className="h-3.5 w-3.5" />
            Retirer cet acte
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !dismissing) setConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cet acte du tableau ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {formatPlacementBoardActeLabel(row.operation)}
              </span>
              {" — "}
              {formatPlacementBoardContactLabel(row)}
              <br />
              L&apos;opération disparaît du tableau et du suivi actif. Aucun mail client n&apos;est
              envoyé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissing}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={dismissing}
              onClick={(e) => {
                e.preventDefault();
                void confirmDismiss();
              }}
            >
              {dismissing ? "Retrait…" : "Retirer cet acte"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
