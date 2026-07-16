import type { PlacementOperation } from "@/lib/api/tauri-box-placement";
import { formatStelliumProductForDisplay } from "@/lib/placement/stellium-box-placement-products";
import {
  placementOperationIsAwaitingPartner,
  placementOperationIsDeclaredInWorkflow,
  placementOperationIsDetachedSuiviDraft,
  placementOperationIsDismissed,
  placementOperationIsPipeTracked,
} from "@/lib/placement/placement-operation-tracking";
import { placementOperationTypeLabel } from "@/lib/placement/placement-operations-ui-core";

export {
  PLACEMENT_UNDECLARED_BOX_LABEL,
  placementOperationIsAwaitingPartner,
  placementOperationIsClosed,
  placementOperationIsDeclaredInWorkflow,
  placementOperationIsDetachedSuiviDraft,
  placementOperationIsDismissed,
  placementOperationIsPipeTracked,
  placementOperationIsUndeclared,
} from "@/lib/placement/placement-operation-tracking";

export {
  placementOperationStatusAccent,
  placementOperationStatusLabel,
  placementOperationTypeLabel,
} from "@/lib/placement/placement-operations-ui-core";

export {
  placementOperationDisplayStatusAccent,
  placementOperationDisplayStatusKind,
  placementOperationDisplayStatusLabel,
  resolvePlacementSuiviStatusBadge,
  type PlacementSuiviStatusBadge,
  type PlacementSuiviStatusBadgeKind,
} from "@/lib/placement/placement-suivi-status-badge";

/** Libellé acte exact (sélection Stellium), pas le type grossier ARBITRAGE / VERSEMENT. */
export function formatPlacementOperationSuiviTitle(
  operation: Pick<PlacementOperation, "stellium_label" | "operation_type">
): string {
  const acte = operation.stellium_label?.trim();
  if (acte) return acte;
  return placementOperationTypeLabel(operation.operation_type);
}

export function formatPlacementOperationSuiviSubtitle(
  operation: Pick<PlacementOperation, "product_label">,
  options?: { pipeTitre?: string | null }
): string {
  const produit = formatStelliumProductForDisplay(operation.product_label?.trim() ?? "");
  if (produit) return produit;
  const pipeTitre = options?.pipeTitre?.trim();
  if (pipeTitre) return pipeTitre;
  return "Produit non renseigné";
}

export function countOpenPlacementOperations(
  rows: Array<{
    operation: Pick<
      PlacementOperation,
      | "status"
      | "dismissed_at"
      | "pipe_id"
      | "pipe_timeline_entry_id"
      | "email_received_at"
      | "gmail_message_id"
    >;
  }>
): { pending: number; nonConforme: number } {
  let pending = 0;
  let nonConforme = 0;
  for (const row of rows) {
    if (row.operation.status === "NON_CONFORME") {
      nonConforme += 1;
      continue;
    }
    if (placementOperationIsDismissed(row.operation)) continue;
    if (placementOperationIsDetachedSuiviDraft(row.operation)) continue;
    if (
      row.operation.status === "PENDING" &&
      !placementOperationIsDeclaredInWorkflow(row.operation)
    ) {
      continue;
    }
    if (placementOperationIsAwaitingPartner(row.operation)) pending += 1;
  }
  return { pending, nonConforme };
}

export function placementConformeNeedsClientNotify(
  operation: Pick<PlacementOperation, "status" | "client_notified_at">
): boolean {
  return (
    operation.status === "CONFORME" &&
    (operation.client_notified_at == null || operation.client_notified_at <= 0)
  );
}

export function isPlacementRowVisibleInSuivi(
  operation: Pick<
    PlacementOperation,
    | "status"
    | "client_notified_at"
    | "pipe_timeline_entry_id"
    | "dismissed_at"
    | "pipe_id"
    | "email_received_at"
    | "gmail_message_id"
  >
): boolean {
  if (operation.status === "NON_CONFORME") return true;
  if (placementOperationIsDismissed(operation)) return false;
  if (placementOperationIsDetachedSuiviDraft(operation)) return false;
  if (operation.status === "PENDING") {
    return placementOperationIsDeclaredInWorkflow(operation);
  }
  return (
    placementConformeNeedsClientNotify(operation) &&
    placementOperationIsPipeTracked(operation)
  );
}

export function countPlacementPendingClientNotify(
  rows: Array<{
    operation: Pick<
      PlacementOperation,
      "status" | "client_notified_at" | "pipe_timeline_entry_id"
    >;
  }>
): number {
  return rows.filter(
    (row) =>
      placementConformeNeedsClientNotify(row.operation) &&
      placementOperationIsPipeTracked(row.operation)
  ).length;
}
