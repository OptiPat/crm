/** Événement léger pour rafraîchir compteurs / attributions sans recalcul complet. */
export const ETIQUETTES_CHANGED_EVENT = "crm:etiquettes-changed";

export function notifyEtiquettesChanged(): void {
  window.dispatchEvent(new CustomEvent(ETIQUETTES_CHANGED_EVENT));
}

export function subscribeEtiquettesChanged(handler: () => void): () => void {
  window.addEventListener(ETIQUETTES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ETIQUETTES_CHANGED_EVENT, handler);
}
