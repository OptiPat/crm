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
}: {
  target: RemoveAutoEtiquetteTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (excludeFromAuto: boolean) => void;
}) {
  return (
    <AlertDialog open={target != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
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
                  Choisissez « Exclure du calcul auto » pour que cette étiquette ne soit plus
                  proposée automatiquement à ce contact.
                </span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => target && onConfirm(false)}
          >
            Retirer seulement
          </AlertDialogAction>
          <AlertDialogAction
            className="bg-primary"
            onClick={() => target && onConfirm(true)}
          >
            Retirer et exclure du calcul auto
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
