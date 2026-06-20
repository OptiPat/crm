import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

export type EtiquetteQueueRowKind = "etiquette" | "template";

export function getEtiquetteQueueRowKind(
  item: Pick<EtiquetteEmailQueueItem, "queue_row_kind">
): EtiquetteQueueRowKind {
  return item.queue_row_kind === "template" ? "template" : "etiquette";
}

/** Clé stable UI — évite collision entre contact_etiquettes.id et contact_template_envois.id */
export function getEtiquetteQueueItemKey(
  item: Pick<EtiquetteEmailQueueItem, "queue_row_kind" | "contact_etiquette_id">
): string {
  return `${getEtiquetteQueueRowKind(item)}:${item.contact_etiquette_id}`;
}

export function isSameEtiquetteQueueItem(
  a: Pick<EtiquetteEmailQueueItem, "queue_row_kind" | "contact_etiquette_id">,
  b: Pick<EtiquetteEmailQueueItem, "queue_row_kind" | "contact_etiquette_id">
): boolean {
  return getEtiquetteQueueItemKey(a) === getEtiquetteQueueItemKey(b);
}
