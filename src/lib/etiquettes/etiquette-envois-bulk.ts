import {
  cancelPendingEmailCampaign,
  dismissCancelledPendingEmailCampaign,
  dismissEmailCampaignFollowup,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";

export type EnvoisBulkRemoveAction = "cancel" | "dismiss" | "dismissFollowup";

export async function runEnvoisBulkRemove(
  action: EnvoisBulkRemoveAction,
  items: EtiquetteEmailQueueItem[]
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const id = item.contact_etiquette_id;
      const kind = item.queue_row_kind ?? "etiquette";
      if (action === "cancel") {
        await cancelPendingEmailCampaign(id, kind);
      } else if (action === "dismiss") {
        await dismissCancelledPendingEmailCampaign(id, kind);
      } else {
        await dismissEmailCampaignFollowup(id, kind);
      }
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return { succeeded, failed };
}

export function getEnvoisBulkRemoveLabel(action: EnvoisBulkRemoveAction): string {
  switch (action) {
    case "cancel":
      return "Retirer la sélection";
    case "dismiss":
      return "Ne plus proposer la sélection";
    case "dismissFollowup":
      return "Ignorer le suivi (sélection)";
  }
}
