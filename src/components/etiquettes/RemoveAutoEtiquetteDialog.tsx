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

export type RemoveAutoEtiquetteTarget = {
  contactId: number;
  etiquetteId: number;
  etiquetteNom: string;
};

export function isAutoEtiquetteAttribution(attribuePar?: string | null): boolean {
  return attribuePar === "AUTO";
}

export function RemoveAutoEtiquetteDialog({
  target,
  onOpenChange,
  onConfirm,
  stacked = false,
}: {
  target: RemoveAutoEtiquetteTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (excludeFromAuto: boolean) => void;
  stacked?: boolean;
}) {
  return (
    <AlertDialog open={target != null} onOpenChange={onOpenChange}>
      <AlertDialogContent stacked={stacked} className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer l&apos;étiquette automatique ?</AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-2">
            {target && (
              <>
                <span className="block">
                  <strong>{target.etiquetteNom}</strong> a été appliquée par une règle
                  automatique. Au prochain recalcul, elle pourrait réapparaître.
                </span>
                <span className="block text-sm">
                  « Exclure du calcul auto » empêche cette étiquette d&apos;être réappliquée
                  automatiquement à ce contact.
                </span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          <AlertDialogAction
            className="mt-0 h-auto min-h-10 w-full whitespace-normal px-3 py-2.5 text-center leading-snug"
            onClick={() => target && onConfirm(true)}
          >
            Retirer et exclure du calcul auto
          </AlertDialogAction>
          <AlertDialogAction
            className="mt-0 h-auto min-h-10 w-full whitespace-normal border border-input bg-background px-3 py-2.5 text-center leading-snug text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => target && onConfirm(false)}
          >
            Retirer seulement
          </AlertDialogAction>
          <AlertDialogCancel className="mt-0 w-full">
            Annuler
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
