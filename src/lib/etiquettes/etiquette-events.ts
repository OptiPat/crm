/** Événement léger pour rafraîchir compteurs / attributions sans recalcul complet. */
export const ETIQUETTES_CHANGED_EVENT = "crm:etiquettes-changed";

/** Rafraîchissement fiche relation (interactions, alertes, file email). */
export const RELATION_CHANGED_EVENT = "crm:relation-changed";

export function notifyEtiquettesChanged(): void {
  window.dispatchEvent(new CustomEvent(ETIQUETTES_CHANGED_EVENT));
}

export function notifyRelationChanged(contactId?: number): void {
  window.dispatchEvent(
    new CustomEvent(RELATION_CHANGED_EVENT, { detail: { contactId } })
  );
  notifyEtiquettesChanged();
}

export function subscribeEtiquettesChanged(handler: () => void): () => void {
  window.addEventListener(ETIQUETTES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ETIQUETTES_CHANGED_EVENT, handler);
}

export function subscribeRelationChanged(
  handler: (contactId?: number) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ contactId?: number }>).detail;
    handler(detail?.contactId);
  };
  window.addEventListener(RELATION_CHANGED_EVENT, listener);
  return () => window.removeEventListener(RELATION_CHANGED_EVENT, listener);
}
