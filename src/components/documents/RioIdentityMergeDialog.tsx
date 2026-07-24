import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

interface RioIdentityMergeDialogProps {
  open: boolean;
  message: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Overlay fixe (pas de Dialog Radix) : le wizard RIO est déjà dans un Dialog
 * DocumentUpload — un 2ᵉ Dialog imbriqué bloque focus/clics et laisse le
 * spinner « loading » tourner indéfiniment.
 */
export function RioIdentityMergeDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: RioIdentityMergeDialogProps) {
  if (!open || message == null || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rio-identity-merge-title"
        className="grid w-full max-w-lg gap-4 rounded-lg border bg-background p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <h2 id="rio-identity-merge-title" className="text-lg font-semibold">
            Fusionner avec la fiche existante ?
          </h2>
          <pre className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap font-sans text-sm text-muted-foreground">
            {message}
          </pre>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Créer une nouvelle fiche
          </Button>
          <Button type="button" onClick={onConfirm}>
            Fusionner
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
