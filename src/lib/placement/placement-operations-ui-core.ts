import type { PlacementOperationStatus } from "@/lib/api/tauri-box-placement";

const STATUS_LABELS: Record<PlacementOperationStatus, string> = {
  PENDING: "En attente",
  CONFORME: "Conforme",
  NON_CONFORME: "NC",
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

export function placementOperationTypeLabel(type: string | null | undefined): string {
  if (!type) return "Opération";
  return TYPE_LABELS[type] ?? type;
}
