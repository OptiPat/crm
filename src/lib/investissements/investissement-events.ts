/** Rafraîchissement ciblé (dashboard, patrimoine) sans recharger toute la fiche contact. */
export const INVESTISSEMENTS_CHANGED_EVENT = "crm:investissements-changed";

let suppressNotifyDepth = 0;

/** Bloque les notify pendant import — un seul refresh à la fin. */
export function suppressInvestissementsChangedNotify(): () => void {
  suppressNotifyDepth += 1;
  return () => {
    suppressNotifyDepth = Math.max(0, suppressNotifyDepth - 1);
  };
}

export function notifyInvestissementsChanged(): void {
  if (suppressNotifyDepth > 0) return;
  window.dispatchEvent(new CustomEvent(INVESTISSEMENTS_CHANGED_EVENT));
}

export function subscribeInvestissementsChanged(handler: () => void): () => void {
  window.addEventListener(INVESTISSEMENTS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(INVESTISSEMENTS_CHANGED_EVENT, handler);
}
