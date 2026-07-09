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

type OutsideDismissEvent = {
  preventDefault: () => void;
  target: EventTarget | null;
};

/**
 * Empêche la fermeture d'un sheet empilé au clic extérieur,
 * sauf si l'interaction vise un portail Radix (liste déroulante, popover…).
 */
export function preventStackedSheetOutsideDismiss(event: OutsideDismissEvent): void {
  if (isRadixPortaledInteractionTarget(event.target)) return;
  event.preventDefault();
}
