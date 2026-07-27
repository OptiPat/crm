import { useEffect, useState } from "react";
import { ArchiveRestore } from "lucide-react";
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
import { reopenFilleulExercice } from "@/lib/api/tauri-filleul-volumes";
import { toast } from "sonner";

type OrganisationExerciceReopenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciceLabel: string;
  snapshotCount: number;
  /** Exercice fiscal en cours : option de restaurer les volumes propres depuis le snapshot. */
  allowRestoreOwnVolumes?: boolean;
  onReopened: () => void;
};

export function OrganisationExerciceReopenDialog({
  open,
  onOpenChange,
  exerciceLabel,
  snapshotCount,
  allowRestoreOwnVolumes = false,
  onReopened,
}: OrganisationExerciceReopenDialogProps) {
  const [restoreOwnVolumes, setRestoreOwnVolumes] = useState(false);
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    if (open) setRestoreOwnVolumes(false);
  }, [open, exerciceLabel]);

  const handleReopen = async () => {
    setReopening(true);
    try {
      await reopenFilleulExercice({
        exerciceLabel,
        restoreOwnVolumes: allowRestoreOwnVolumes && restoreOwnVolumes,
      });
      toast.success(`Exercice ${exerciceLabel} déclôturé`);
      onOpenChange(false);
      onReopened();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Impossible de déclôturer l'exercice"
      );
    } finally {
      setReopening(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Déclôturer l&apos;exercice {exerciceLabel} ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                L&apos;exercice repassera en mode volumes live (fiches contact). Les snapshots
                archivés ({snapshotCount} contact{snapshotCount > 1 ? "s" : ""}) restent en base
                mais ne figent plus l&apos;affichage.
              </p>
              {allowRestoreOwnVolumes ? (
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Checkbox
                    id="restore-own-volumes"
                    checked={restoreOwnVolumes}
                    onCheckedChange={(checked) => setRestoreOwnVolumes(checked === true)}
                  />
                  <Label htmlFor="restore-own-volumes" className="text-sm leading-snug cursor-pointer">
                    Restaurer les volumes propres depuis le snapshot de clôture
                  </Label>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={reopening}>Annuler</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button type="button" onClick={() => void handleReopen()} disabled={reopening}>
              <ArchiveRestore className="h-4 w-4 mr-1.5" aria-hidden />
              {reopening ? "Déclôture…" : "Déclôturer"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type OrganisationExerciceReopenButtonProps = {
  disabled?: boolean;
  onClick: () => void;
};

export function OrganisationExerciceReopenButton({
  disabled,
  onClick,
}: OrganisationExerciceReopenButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={disabled}
      onClick={onClick}
    >
      <ArchiveRestore className="h-4 w-4" aria-hidden />
      Déclôturer l&apos;exercice
    </Button>
  );
}
