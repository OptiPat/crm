import type { PlacementOperation } from "@/lib/api/tauri-box-placement";
import {
  getPlacementBoardColumn,
  PLACEMENT_BOARD_COLUMN_COLORS,
  PLACEMENT_SUIVI_LIST_COLUMN_LABELS,
  placementBoardRowShowsNonConformeAlert,
} from "@/lib/placement/placement-operation-board";
import {
  PLACEMENT_UNDECLARED_BOX_LABEL,
  placementOperationIsAwaitingPartner,
  placementOperationIsUndeclared,
} from "@/lib/placement/placement-operation-tracking";
import {
  placementOperationStatusAccent,
  placementOperationStatusLabel,
} from "@/lib/placement/placement-operations-ui-core";

export type PlacementSuiviStatusBadgeKind =
  | "nc"
  | "undeclared"
  | "waiting"
  | "client_mail"
  | "column"
  | "status";

export type PlacementSuiviStatusBadge = {
  label: string;
  accent: string;
  kind: PlacementSuiviStatusBadgeKind;
};

export function resolvePlacementSuiviStatusBadge(
  operation: Pick<
    PlacementOperation,
    | "status"
    | "pipe_timeline_entry_id"
    | "client_notified_at"
    | "email_received_at"
    | "non_conforme_at"
    | "partner_resent_at"
    | "dismissed_at"
    | "pipe_id"
  >,
  options?: { needsClientNotify?: boolean }
): PlacementSuiviStatusBadge {
  if (options?.needsClientNotify) {
    return {
      label: PLACEMENT_SUIVI_LIST_COLUMN_LABELS.client_mail,
      accent: PLACEMENT_BOARD_COLUMN_COLORS.client_mail.badge,
      kind: "client_mail",
    };
  }
  if (placementBoardRowShowsNonConformeAlert(operation)) {
    return {
      label: "NC",
      accent: "bg-red-100 text-red-800 border-red-200",
      kind: "nc",
    };
  }
  if (operation.status === "PENDING" && placementOperationIsUndeclared(operation)) {
    return {
      label: PLACEMENT_UNDECLARED_BOX_LABEL,
      accent:
        "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
      kind: "undeclared",
    };
  }
  if (placementOperationIsAwaitingPartner(operation)) {
    return {
      label: "En attente",
      accent: "bg-amber-100 text-amber-900 border-amber-200",
      kind: "waiting",
    };
  }
  const column = getPlacementBoardColumn(operation);
  if (column) {
    return {
      label: PLACEMENT_SUIVI_LIST_COLUMN_LABELS[column],
      accent: PLACEMENT_BOARD_COLUMN_COLORS[column].badge,
      kind: "column",
    };
  }
  return {
    label: placementOperationStatusLabel(operation.status),
    accent: placementOperationStatusAccent(operation.status),
    kind: "status",
  };
}

export function placementOperationDisplayStatusLabel(
  operation: Parameters<typeof resolvePlacementSuiviStatusBadge>[0],
  options?: { needsClientNotify?: boolean }
): string {
  return resolvePlacementSuiviStatusBadge(operation, options).label;
}

export function placementOperationDisplayStatusAccent(
  operation: Parameters<typeof resolvePlacementSuiviStatusBadge>[0],
  options?: { needsClientNotify?: boolean }
): string {
  return resolvePlacementSuiviStatusBadge(operation, options).accent;
}

export function placementOperationDisplayStatusKind(
  operation: Parameters<typeof resolvePlacementSuiviStatusBadge>[0],
  options?: { needsClientNotify?: boolean }
): PlacementSuiviStatusBadgeKind {
  return resolvePlacementSuiviStatusBadge(operation, options).kind;
}
