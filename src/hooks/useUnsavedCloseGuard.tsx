import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
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
import { usePageLeaveGuard } from "@/lib/navigation/page-leave-guard";

interface UnsavedCloseGuardOptions {
  /** Formulaire ouvert : l'état « modifié » repart de zéro à chaque ouverture. */
  open: boolean;
  /** Fermeture réelle (après confirmation si besoin). */
  onClose: () => void;
  /** Confirmation affichée au-dessus d'un panneau empilé. */
  stacked?: boolean;
}

/**
 * Toute saisie ou action de l'utilisateur dans le formulaire compte comme une modification,
 * sauf les onglets et les zones marquées `data-no-dirty` (pied de fenêtre, aperçu…).
 */
function isUserEditEvent(target: EventTarget | null, kind: "input" | "click", trusted: boolean): boolean {
  // Seules les actions de l'utilisateur comptent : les composants (listes, interrupteurs)
  // émettent aussi des événements quand le code fixe leur valeur au chargement.
  if (!trusted || !(target instanceof Element)) return false;
  if (target.closest("[data-no-dirty]") || target.closest('[role="tab"]')) return false;
  if (kind === "input") return true;
  const control = target.closest(
    'button, [role="switch"], [role="checkbox"], [role="radio"], [role="option"], [role="menuitem"]'
  );
  // Ouvrir une liste déroulante n'est pas une modification (le choix d'une option, si).
  return control != null && control.getAttribute("role") !== "combobox";
}

/**
 * Demande « Quitter sans enregistrer ? » quand on ferme (Échap, clic à côté, Annuler, croix)
 * un formulaire modifié par l'utilisateur ; ferme directement sinon.
 * Étaler `trackDirtyProps` sur le conteneur du formulaire et rendre `discardDialog`.
 */
export function useUnsavedCloseGuard({ open, onClose, stacked = false }: UnsavedCloseGuardOptions) {
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Changement de page (recherche globale, notification) : App demande la même confirmation.
  usePageLeaveGuard(open && dirty);

  const setDirtyValue = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDirtyValue(false);
    setConfirmOpen(false);
  }, [open, setDirtyValue]);

  const markDirty = useCallback(() => setDirtyValue(true), [setDirtyValue]);
  const resetDirty = useCallback(() => setDirtyValue(false), [setDirtyValue]);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  }, [onClose]);

  /** À brancher sur `onOpenChange` du Dialog / Sheet. */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) requestClose();
    },
    [requestClose]
  );

  const track = useCallback(
    (e: SyntheticEvent, kind: "input" | "click") => {
      if (isUserEditEvent(e.target, kind, e.nativeEvent.isTrusted)) markDirty();
    },
    [markDirty]
  );

  const trackDirtyProps = {
    onInputCapture: (e: SyntheticEvent) => track(e, "input"),
    onChangeCapture: (e: SyntheticEvent) => track(e, "input"),
    onClickCapture: (e: SyntheticEvent) => track(e, "click"),
    // Choix d'une option à la souris dans une liste : validé au relâchement, sans clic.
    onPointerUpCapture: (e: SyntheticEvent) => {
      if (e.target instanceof Element && e.target.closest('[role="option"]')) track(e, "click");
    },
    // Activation au clavier (Entrée / Espace sur une option, un interrupteur, une case).
    onKeyDownCapture: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") track(e, "click");
    },
  };

  const confirmDiscard = () => {
    setConfirmOpen(false);
    setDirtyValue(false);
    onClose();
  };

  const discardDialog = (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent stacked={stacked} data-no-dirty>
        <AlertDialogHeader>
          <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
          <AlertDialogDescription>Vos modifications seront perdues.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuer l&apos;édition</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDiscard}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Quitter sans enregistrer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dirty, markDirty, resetDirty, requestClose, handleOpenChange, trackDirtyProps, discardDialog };
}
