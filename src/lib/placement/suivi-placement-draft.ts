import type { PlacementOperation } from "@/lib/api/tauri-box-placement";
import {
  placementOperationIsDismissed,
  placementOperationIsPipeTracked,
} from "@/lib/placement/placement-operations-ui";

/** Acte créé sur le suivi, pas encore confirmé envoyé chez Stellium. */
export function placementOperationIsSuiviDraft(
  operation: Pick<
    PlacementOperation,
    | "status"
    | "pipe_timeline_entry_id"
    | "email_received_at"
    | "pipe_id"
    | "dismissed_at"
  >
): boolean {
  if (placementOperationIsDismissed(operation)) return false;
  if (operation.status !== "PENDING") return false;
  if (operation.pipe_id == null || operation.pipe_id <= 0) return false;
  if (placementOperationIsPipeTracked(operation)) return false;
  const mailFromScan = operation.email_received_at != null && operation.email_received_at > 0;
  return !mailFromScan;
}
