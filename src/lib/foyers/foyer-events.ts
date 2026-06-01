/** Foyers — recharger après CRUD foyer. */
export const FOYERS_CHANGED_EVENT = "crm:foyers-changed";

export function notifyFoyersChanged(): void {
  window.dispatchEvent(new CustomEvent(FOYERS_CHANGED_EVENT));
}

export function subscribeFoyersChanged(handler: () => void): () => void {
  window.addEventListener(FOYERS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(FOYERS_CHANGED_EVENT, handler);
}
