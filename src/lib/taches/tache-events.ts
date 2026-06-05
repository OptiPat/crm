/** Tâches — recharger après CRUD tâche. */
export const TACHES_CHANGED_EVENT = "crm:taches-changed";

export function notifyTachesChanged(): void {
  window.dispatchEvent(new CustomEvent(TACHES_CHANGED_EVENT));
}

export function subscribeTachesChanged(handler: () => void): () => void {
  window.addEventListener(TACHES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(TACHES_CHANGED_EVENT, handler);
}
