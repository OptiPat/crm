import type { Alerte } from "@/lib/api/tauri-alertes";
import { getEtiquetteNomForAlerte } from "@/lib/alertes/alerte-etiquette-links";
import {
  getEtiquetteEmailQueue,
  type EtiquetteEmailQueueItem,
  type EtiquetteWithCount,
} from "@/lib/api/tauri-etiquettes";
import {
  formatEtiquetteSendDatetime,
  getIncompleteQueueLabel,
} from "@/lib/etiquettes/etiquette-email-preview";

export type AlerteEmailResolution =
  | { kind: "send"; item: EtiquetteEmailQueueItem }
  | { kind: "followup"; item: EtiquetteEmailQueueItem }
  | { kind: "incomplete"; message: string }
  | { kind: "scheduled"; message: string }
  | { kind: "sent_waiting"; message: string }
  | { kind: "cancelled"; item: EtiquetteEmailQueueItem }
  | { kind: "no_campaign" };

function findLinkedEtiquette(
  alerte: Alerte,
  etiquettes: EtiquetteWithCount[]
): EtiquetteWithCount | null {
  const nom = getEtiquetteNomForAlerte(alerte.type_alerte);
  if (!nom) return null;
  return etiquettes.find((e) => e.nom === nom) ?? null;
}

/** Campagne email active pour cette alerte ? */
export function alerteHasActiveEmailCampaign(
  alerte: Alerte,
  etiquettes: EtiquetteWithCount[]
): boolean {
  const etiquette = findLinkedEtiquette(alerte, etiquettes);
  return !!etiquette?.email_actif && !!etiquette.email_template_id;
}

/** Résout l'action email depuis une alerte (file Suivi → Envois). */
export async function resolveAlerteEmailAction(
  alerte: Alerte,
  etiquettes: EtiquetteWithCount[]
): Promise<AlerteEmailResolution> {
  const etiquette = findLinkedEtiquette(alerte, etiquettes);
  if (!etiquette) {
    return { kind: "no_campaign" };
  }
  if (!etiquette.email_actif || !etiquette.email_template_id) {
    return {
      kind: "no_campaign",
    };
  }

  const match = (items: EtiquetteEmailQueueItem[]) =>
    items.find(
      (q) => q.contact_id === alerte.contact_id && q.etiquette_id === etiquette.id
    );

  const ready = await getEtiquetteEmailQueue("ready");
  const readyItem = match(ready);
  if (readyItem) {
    return { kind: "send", item: readyItem };
  }

  const cancelled = await getEtiquetteEmailQueue("cancelled");
  const cancelledItem = match(cancelled);
  if (cancelledItem) {
    return { kind: "cancelled", item: cancelledItem };
  }

  const incomplete = await getEtiquetteEmailQueue("incomplete");
  const incompleteItem = match(incomplete);
  if (incompleteItem) {
    return {
      kind: "incomplete",
      message: getIncompleteQueueLabel(incompleteItem.queue_issue),
    };
  }

  const scheduled = await getEtiquetteEmailQueue("scheduled");
  const scheduledItem = match(scheduled);
  if (scheduledItem) {
    return {
      kind: "scheduled",
      message: `Envoi planifié le ${formatEtiquetteSendDatetime(scheduledItem.email_date_prevue)} — rien à faire pour l'instant.`,
    };
  }

  const followup = await getEtiquetteEmailQueue("followup");
  const followupItem = match(followup);
  if (followupItem) {
    return { kind: "followup", item: followupItem };
  }

  const sent = await getEtiquetteEmailQueue("sent");
  const sentItem = match(sent);
  if (sentItem) {
    return {
      kind: "sent_waiting",
      message:
        "Email déjà envoyé — en attente de retour client (voir « À relancer » dans Envois).",
    };
  }

  return {
    kind: "incomplete",
    message:
      "Aucune ligne en file pour ce contact. Recalculez les étiquettes et vérifiez la campagne email.",
  };
}

/** @deprecated Utiliser resolveAlerteEmailAction */
export async function findEmailQueueItemForAlerte(
  alerte: Alerte,
  etiquettes: EtiquetteWithCount[]
): Promise<EtiquetteEmailQueueItem | null> {
  const resolution = await resolveAlerteEmailAction(alerte, etiquettes);
  if (resolution.kind === "send") return resolution.item;
  return null;
}
