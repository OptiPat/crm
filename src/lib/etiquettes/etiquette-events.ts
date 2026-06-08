/** Événement léger pour rafraîchir compteurs / attributions sans recalcul complet. */
export const ETIQUETTES_CHANGED_EVENT = "crm:etiquettes-changed";

/** Rafraîchissement fiche relation (interactions, alertes, file email). */
export const RELATION_CHANGED_EVENT = "crm:relation-changed";

export type RelationChangedDetail = {
  contactId?: number;
  /** Évite le rechargement complet de la file Envois (mise à jour locale déjà faite). */
  skipQueueReload?: boolean;
  /** Évite le recalcul étiquettes global (compteurs mis à jour autrement). */
  skipEtiquettesChanged?: boolean;
};

export function notifyEtiquettesChanged(): void {
  window.dispatchEvent(new CustomEvent(ETIQUETTES_CHANGED_EVENT));
}

export function notifyRelationChanged(
  contactId?: number,
  options?: Pick<RelationChangedDetail, "skipQueueReload" | "skipEtiquettesChanged">
): void {
  window.dispatchEvent(
    new CustomEvent<RelationChangedDetail>(RELATION_CHANGED_EVENT, {
      detail: { contactId, ...options },
    })
  );
  if (!options?.skipEtiquettesChanged) {
    notifyEtiquettesChanged();
  }
}

export function subscribeEtiquettesChanged(handler: () => void): () => void {
  window.addEventListener(ETIQUETTES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ETIQUETTES_CHANGED_EVENT, handler);
}

export function subscribeRelationChanged(
  handler: (detail: RelationChangedDetail) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<RelationChangedDetail>).detail ?? {};
    handler(detail);
  };
  window.addEventListener(RELATION_CHANGED_EVENT, listener);
  return () => window.removeEventListener(RELATION_CHANGED_EVENT, listener);
}

const RELATION_DEBOUNCE_MS = 300;

/** Même bus relation, regroupé sur 300 ms pour limiter les rafales SQLite. */
export function subscribeRelationChangedDebounced(
  handler: (detail: RelationChangedDetail) => void,
  debounceMs = RELATION_DEBOUNCE_MS
): () => void {
  let timeout: number | null = null;
  let pending: RelationChangedDetail = {};

  return subscribeRelationChanged((detail) => {
    pending = {
      ...pending,
      ...detail,
      skipQueueReload: pending.skipQueueReload || detail.skipQueueReload,
      skipEtiquettesChanged:
        pending.skipEtiquettesChanged || detail.skipEtiquettesChanged,
    };
    if (timeout != null) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      timeout = null;
      const snapshot = pending;
      pending = {};
      handler(snapshot);
    }, debounceMs);
  });
}
