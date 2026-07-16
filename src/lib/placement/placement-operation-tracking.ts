import type { PlacementOperation } from "@/lib/api/tauri-box-placement";

/** Acte créé mais pas encore confirmé envoyé chez Stellium (brouillon pipe ou scan sans journal). */
export const PLACEMENT_UNDECLARED_BOX_LABEL = "Non déclarée Box";

function placementTs(value: number | null | undefined): boolean {
  return value != null && value > 0;
}

export function placementOperationIsDismissed(
  operation: Pick<PlacementOperation, "dismissed_at">
): boolean {
  return operation.dismissed_at != null && operation.dismissed_at > 0;
}

export function placementOperationIsPipeTracked(
  operation: Pick<PlacementOperation, "pipe_timeline_entry_id">
): boolean {
  return (
    operation.pipe_timeline_entry_id != null && operation.pipe_timeline_entry_id > 0
  );
}

export function placementOperationIsUndeclared(
  operation: Pick<PlacementOperation, "pipe_timeline_entry_id">
): boolean {
  return !placementOperationIsPipeTracked(operation);
}

/** PENDING avec envoi Stellium confirmé (journal timeline) — en attente de réponse partenaire. */
export function placementOperationIsAwaitingPartner(
  operation: Pick<PlacementOperation, "status" | "pipe_timeline_entry_id">
): boolean {
  return (
    operation.status === "PENDING" && placementOperationIsPipeTracked(operation)
  );
}

export function placementOperationIsDeclaredInWorkflow(
  operation: Pick<PlacementOperation, "pipe_id" | "pipe_timeline_entry_id">
): boolean {
  if (operation.pipe_id != null && operation.pipe_id > 0) return true;
  return placementOperationIsPipeTracked(operation);
}

/** Brouillon suivi dont le pipe a été supprimé (pipe_id remis à NULL par la FK). */
export function placementOperationIsDetachedSuiviDraft(
  operation: Pick<
    PlacementOperation,
    | "status"
    | "pipe_id"
    | "pipe_timeline_entry_id"
    | "email_received_at"
    | "gmail_message_id"
    | "dismissed_at"
  >
): boolean {
  if (placementOperationIsDismissed(operation)) return false;
  if (operation.status !== "PENDING") return false;
  if (operation.pipe_id != null && operation.pipe_id > 0) return false;
  if (placementTs(operation.pipe_timeline_entry_id)) return false;
  if (placementTs(operation.email_received_at)) return false;
  const gmail = operation.gmail_message_id?.trim();
  return !gmail;
}

export function placementOperationIsClosed(
  operation: Pick<PlacementOperation, "status" | "client_notified_at" | "dismissed_at">
): boolean {
  if (operation.status === "NON_CONFORME") return false;
  return placementOperationIsDismissed(operation);
}
