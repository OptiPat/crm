/** Cibles Radix portées hors du sheet/dialog parent (Select, Popover, Command…). */
const RADIX_PORTAL_INTERACTION_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[data-radix-select-content]",
  "[data-radix-menu-content]",
  "[data-radix-popover-content]",
  '[role="listbox"]',
  "[cmdk-root]",
].join(", ");

function resolveInteractionElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node && target.parentElement) return target.parentElement;
  return null;
}

/** Clic / focus « outside » qui cible en réalité un portail Radix (dropdown ouvert). */
export function isRadixPortaledInteractionTarget(target: EventTarget | null): boolean {
  const el = resolveInteractionElement(target);
  if (!el) return false;
  return el.closest(RADIX_PORTAL_INTERACTION_SELECTOR) != null;
}

/** Overlays maison portalés sur document.body (hors Dialog Radix), ex. RioIdentityMergeDialog. */
const CUSTOM_OVERLAY_SELECTOR = ["[data-custom-modal-overlay]"].join(", ");

/** Clic / focus « outside » qui cible en réalité un overlay maison portalé par-dessus le Dialog. */
export function isCustomOverlayInteractionTarget(target: EventTarget | null): boolean {
  const el = resolveInteractionElement(target);
  if (!el) return false;
  return el.closest(CUSTOM_OVERLAY_SELECTOR) != null;
}

type OutsideDismissEvent = {
  preventDefault: () => void;
  target: EventTarget | null;
};

/**
 * Empêche la fermeture d'un sheet empilé au clic extérieur,
 * sauf si l'interaction vise un portail Radix (liste déroulante, popover…)
 * ou un overlay maison (ex. confirmation de fusion RIO) rendu par-dessus.
 */
export function preventStackedSheetOutsideDismiss(event: OutsideDismissEvent): void {
  if (isRadixPortaledInteractionTarget(event.target) || isCustomOverlayInteractionTarget(event.target)) {
    return;
  }
  event.preventDefault();
}

/**
 * Empêche un Dialog Radix modal de traiter comme « outside » un clic qui cible
 * en réalité un overlay maison portalé sur document.body (ex. RioIdentityMergeDialog) :
 * sans ça, Radix peut fermer/désactiver le Dialog parent avant que le clic n'atteigne
 * le bouton de l'overlay → boutons inertes, clavier bloqué (cf. RioIdentityMergeDialog).
 */
export function preventCustomOverlayOutsideDismiss(event: OutsideDismissEvent): void {
  if (isCustomOverlayInteractionTarget(event.target)) {
    event.preventDefault();
  }
}
