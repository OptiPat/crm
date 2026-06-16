import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RioIdentityMergeDialogProps {
  open: boolean;
  message: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RioIdentityMergeDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: RioIdentityMergeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fusionner avec la fiche existante ?</DialogTitle>
          <DialogDescription asChild>
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans mt-2 max-h-[50vh] overflow-y-auto">
              {message}
            </pre>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Créer une nouvelle fiche
          </Button>
          <Button type="button" onClick={onConfirm}>
            Fusionner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
