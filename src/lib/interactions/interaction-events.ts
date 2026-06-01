/** Journal Historique des échanges — recharger après CRUD interaction ou sync relation. */
export const INTERACTIONS_CHANGED_EVENT = "crm:interactions-changed";

export function notifyInteractionsChanged(): void {
  window.dispatchEvent(new CustomEvent(INTERACTIONS_CHANGED_EVENT));
}

export function subscribeInteractionsChanged(handler: () => void): () => void {
  window.addEventListener(INTERACTIONS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(INTERACTIONS_CHANGED_EVENT, handler);
}
