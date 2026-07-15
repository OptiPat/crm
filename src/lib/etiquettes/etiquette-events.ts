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
  /** Le panel Relation recharge la timeline via onSuccess (évite double load). */
  skipTimelineReload?: boolean;
};

export function notifyEtiquettesChanged(): void {
  window.dispatchEvent(new CustomEvent(ETIQUETTES_CHANGED_EVENT));
}

export function notifyRelationChanged(
  contactId?: number,
  options?: Pick<
    RelationChangedDetail,
    "skipQueueReload" | "skipEtiquettesChanged" | "skipTimelineReload"
  >
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

export const ETIQUETTES_DEBOUNCE_MS = 300;

/** Même bus étiquettes, regroupé sur 300 ms pour limiter les rafales SQLite. */
export function subscribeEtiquettesChangedDebounced(
  handler: () => void,
  debounceMs = ETIQUETTES_DEBOUNCE_MS
): () => void {
  let timeout: number | null = null;

  const unsub = subscribeEtiquettesChanged(() => {
    if (timeout != null) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      timeout = null;
      handler();
    }, debounceMs);
  });

  return () => {
    if (timeout != null) window.clearTimeout(timeout);
    timeout = null;
    unsub();
  };
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

/**
 * Fusionne deux évènements relation regroupés dans la fenêtre de debounce.
 * Un drapeau `skip*` n'est conservé que si TOUS les évènements l'ont demandé :
 * dès qu'un seul évènement a besoin du rechargement, on ne le saute pas.
 */
export function mergeRelationChangedDetails(
  pending: RelationChangedDetail | null,
  detail: RelationChangedDetail
): RelationChangedDetail {
  if (pending == null) return { ...detail };
  return {
    ...pending,
    ...detail,
    skipQueueReload: !!pending.skipQueueReload && !!detail.skipQueueReload,
    skipEtiquettesChanged:
      !!pending.skipEtiquettesChanged && !!detail.skipEtiquettesChanged,
    skipTimelineReload: !!pending.skipTimelineReload && !!detail.skipTimelineReload,
  };
}

/** Même bus relation, regroupé sur 300 ms pour limiter les rafales SQLite. */
export function subscribeRelationChangedDebounced(
  handler: (detail: RelationChangedDetail) => void,
  debounceMs = RELATION_DEBOUNCE_MS
): () => void {
  let timeout: number | null = null;
  let pending: RelationChangedDetail | null = null;

  const unsub = subscribeRelationChanged((detail) => {
    pending = mergeRelationChangedDetails(pending, detail);
    if (timeout != null) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      timeout = null;
      const snapshot = pending ?? {};
      pending = null;
      handler(snapshot);
    }, debounceMs);
  });

  return () => {
    if (timeout != null) window.clearTimeout(timeout);
    timeout = null;
    pending = null;
    unsub();
  };
}
