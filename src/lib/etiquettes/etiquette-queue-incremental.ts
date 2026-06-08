import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

export function buildSentQueueItem(
  item: EtiquetteEmailQueueItem,
  sentAtSec: number,
  subject?: string
): EtiquetteEmailQueueItem {
  return {
    ...item,
    email_date_envoi: sentAtSec,
    email_date_prevue: item.email_date_prevue,
    template_sujet: subject?.trim() || item.template_sujet,
    queue_issue: null,
    email_reponse_at: null,
    email_reponse_type: null,
    email_is_relance: false,
  };
}

/** Retire une ligne des files actives et l’ajoute en tête de « Envoyés » (sans requête SQLite). */
export function applyIncrementalEmailSent(
  queues: {
    ready: EtiquetteEmailQueueItem[];
    scheduled: EtiquetteEmailQueueItem[];
    sent: EtiquetteEmailQueueItem[];
  },
  contactEtiquetteId: number,
  sentItem: EtiquetteEmailQueueItem
): typeof queues {
  const filterOut = (list: EtiquetteEmailQueueItem[]) =>
    list.filter((row) => row.contact_etiquette_id !== contactEtiquetteId);

  return {
    ready: filterOut(queues.ready),
    scheduled: filterOut(queues.scheduled),
    sent: [
      sentItem,
      ...filterOut(queues.sent).filter(
        (row) => row.contact_etiquette_id !== contactEtiquetteId
      ),
    ],
  };
}
