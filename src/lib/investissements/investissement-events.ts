/** Rafraîchissement ciblé (dashboard, patrimoine) sans recharger toute la fiche contact. */
export const INVESTISSEMENTS_CHANGED_EVENT = "crm:investissements-changed";

export function notifyInvestissementsChanged(): void {
  window.dispatchEvent(new CustomEvent(INVESTISSEMENTS_CHANGED_EVENT));
}

export function subscribeInvestissementsChanged(handler: () => void): () => void {
  window.addEventListener(INVESTISSEMENTS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(INVESTISSEMENTS_CHANGED_EVENT, handler);
}
