/** Liste alertes Suivi / barre notifications — recharger après traitement ou suppression. */
export const ALERTES_CHANGED_EVENT = "crm:alertes-changed";

export function notifyAlertesChanged(): void {
  window.dispatchEvent(new CustomEvent(ALERTES_CHANGED_EVENT));
}

export function subscribeAlertesChanged(handler: () => void): () => void {
  window.addEventListener(ALERTES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ALERTES_CHANGED_EVENT, handler);
}
