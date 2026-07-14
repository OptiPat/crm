import type {
  PlacementOperation,
  PlacementOperationStatus,
} from "@/lib/api/tauri-box-placement";

const STATUS_LABELS: Record<PlacementOperationStatus, string> = {
  PENDING: "En attente partenaire",
  CONFORME: "Conforme",
  NON_CONFORME: "Non conforme",
};

const TYPE_LABELS: Record<string, string> = {
  ARBITRAGE: "Arbitrage",
  VERSEMENT: "Versement",
  REINVESTISSEMENT: "Réinvestissement",
  SOUSCRIPTION: "Souscription",
  AUTRE: "Opération",
};

export function placementOperationStatusLabel(
  status: string | null | undefined
): string {
  if (!status) return "—";
  return STATUS_LABELS[status as PlacementOperationStatus] ?? status;
}

export function placementOperationTypeLabel(type: string | null | undefined): string {
  if (!type) return "Opération";
  return TYPE_LABELS[type] ?? type;
}

export function placementOperationStatusAccent(status: string): string {
  switch (status) {
    case "NON_CONFORME":
      return "bg-red-100 text-red-800 border-red-200";
    case "CONFORME":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "PENDING":
    default:
      return "bg-amber-100 text-amber-900 border-amber-200";
  }
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
    if (row.operation.status === "PENDING") pending += 1;
  }
  return { pending, nonConforme };
}

export function placementOperationIsDismissed(
  operation: Pick<PlacementOperation, "dismissed_at">
): boolean {
  return operation.dismissed_at != null && operation.dismissed_at > 0;
}

function placementTs(value: number | null | undefined): boolean {
  return value != null && value > 0;
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

export function placementOperationIsPipeTracked(
  operation: Pick<PlacementOperation, "pipe_timeline_entry_id">
): boolean {
  return (
    operation.pipe_timeline_entry_id != null && operation.pipe_timeline_entry_id > 0
  );
}

export function placementOperationIsDeclaredInWorkflow(
  operation: Pick<PlacementOperation, "pipe_id" | "pipe_timeline_entry_id">
): boolean {
  if (operation.pipe_id != null && operation.pipe_id > 0) return true;
  return placementOperationIsPipeTracked(operation);
}

export function placementOperationIsUndeclared(
  operation: Pick<PlacementOperation, "pipe_timeline_entry_id">
): boolean {
  return !placementOperationIsPipeTracked(operation);
}

export function placementOperationIsClosed(
  operation: Pick<PlacementOperation, "status" | "client_notified_at" | "dismissed_at">
): boolean {
  if (operation.status === "NON_CONFORME") return false;
  if (placementOperationIsDismissed(operation)) return true;
  if (operation.status === "CONFORME") {
    return operation.client_notified_at != null && operation.client_notified_at > 0;
  }
  return false;
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
