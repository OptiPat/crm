import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  type CloseFilleulExerciceSnapshot,
} from "@/lib/organisation/organisation-volume-history";
import { closeFilleulExercice } from "@/lib/api/tauri-filleul-volumes";
import { toast } from "sonner";

type OrganisationExerciceCloseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciceLabel: string;
  snapshots: CloseFilleulExerciceSnapshot[];
  /** Exercice fiscal en cours : option de remise à zéro des volumes propres live. */
  allowResetOwnVolumes?: boolean;
  onClosed: () => void;
};

export function OrganisationExerciceCloseDialog({
  open,
  onOpenChange,
  exerciceLabel,
  snapshots,
  allowResetOwnVolumes = false,
  onClosed,
}: OrganisationExerciceCloseDialogProps) {
  const [resetOwnVolumes, setResetOwnVolumes] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) setResetOwnVolumes(false);
  }, [open, exerciceLabel]);

  const handleClose = async () => {
    if (snapshots.length === 0) return;
    setClosing(true);
    try {
      await closeFilleulExercice({
        exerciceLabel,
        entries: snapshots.map((row) => ({
          contactId: row.contactId,
          volumePropre: row.volumePropre,
          volumeBranche: row.volumeBranche,
          volumeManager: row.volumeManager,
        })),
        resetOwnVolumes: allowResetOwnVolumes && resetOwnVolumes,
      });
      toast.success(`Exercice ${exerciceLabel} clôturé`);
      onOpenChange(false);
      onClosed();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Impossible de clôturer l'exercice"
      );
    } finally {
      setClosing(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clôturer l&apos;exercice {exerciceLabel} ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                {allowResetOwnVolumes
                  ? `${snapshots.length} contact${snapshots.length > 1 ? "s" : ""} seront archivés avec leurs volumes propre, branche et objectif Manager (snapshot figé).`
                  : `${snapshots.length} contact${snapshots.length > 1 ? "s" : ""} : les volumes importés seront marqués comme clôturés (aucun recalcul depuis les volumes actuels).`}
              </p>
              {allowResetOwnVolumes ? (
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Checkbox
                    id="reset-own-volumes"
                    checked={resetOwnVolumes}
                    onCheckedChange={(checked) => setResetOwnVolumes(checked === true)}
                  />
                  <Label htmlFor="reset-own-volumes" className="text-sm leading-snug cursor-pointer">
                    Remettre les volumes propres à zéro pour l&apos;exercice en cours
                  </Label>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={closing}>Annuler</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              onClick={() => void handleClose()}
              disabled={closing || snapshots.length === 0}
            >
              <Archive className="h-4 w-4 mr-1.5" aria-hidden />
              {closing ? "Clôture…" : "Clôturer"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type OrganisationExerciceCloseButtonProps = {
  disabled?: boolean;
  onClick: () => void;
};

export function OrganisationExerciceCloseButton({
  disabled,
  onClick,
}: OrganisationExerciceCloseButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={disabled}
      onClick={onClick}
    >
      <Archive className="h-4 w-4" aria-hidden />
      Clôturer l&apos;exercice
    </Button>
  );
}
