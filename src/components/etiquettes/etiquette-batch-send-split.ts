import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

export type BlockedBatchItem = {
  item: EtiquetteEmailQueueItem;
  reason: string;
};

/**
 * Sépare un lot d'envoi en lignes envoyables et lignes bloquées (SCPI / Stellium…).
 * Le blocage n'est jamais levé : les lignes bloquées sont seulement exclues du lot.
 */
export function splitBatchSendItems(
  items: EtiquetteEmailQueueItem[],
  getBlockReason: (item: EtiquetteEmailQueueItem) => string | null
): { sendable: EtiquetteEmailQueueItem[]; blocked: BlockedBatchItem[] } {
  const sendable: EtiquetteEmailQueueItem[] = [];
  const blocked: BlockedBatchItem[] = [];
  for (const item of items) {
    const reason = getBlockReason(item);
    if (reason) blocked.push({ item, reason });
    else sendable.push(item);
  }
  return { sendable, blocked };
}

/** Nom affiché d'un destinataire (« Prénom Nom », sinon l'email). */
export function batchRecipientLabel(item: EtiquetteEmailQueueItem): string {
  const name = `${item.contact_prenom ?? ""} ${item.contact_nom ?? ""}`.trim();
  return name || item.contact_email?.trim() || "Contact sans nom";
}
