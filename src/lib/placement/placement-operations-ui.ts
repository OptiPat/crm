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
  rows: Array<{ operation: Pick<PlacementOperation, "status"> }>
): { pending: number; nonConforme: number } {
  let pending = 0;
  let nonConforme = 0;
  for (const row of rows) {
    if (row.operation.status === "PENDING") pending += 1;
    if (row.operation.status === "NON_CONFORME") nonConforme += 1;
  }
  return { pending, nonConforme };
}
