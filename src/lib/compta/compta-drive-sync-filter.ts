export type ComptaDriveSyncFilter = "all" | "ready" | "review" | "imported";

type DraftStatus = "loading" | "ready" | "error" | undefined;

export function matchesComptaDriveSyncFilter(input: {
  alreadyImported: boolean;
  status: DraftStatus;
  confidence?: "low" | "medium" | "high";
  filter: ComptaDriveSyncFilter;
}): boolean {
  const { alreadyImported, status, confidence, filter } = input;
  if (filter === "imported") return alreadyImported;
  if (alreadyImported) return filter === "all";
  if (filter === "ready") return status === "ready";
  if (filter === "review") {
    return status === "error" || status === "loading" || confidence === "low";
  }
  return true;
}

export const COMPTA_DRIVE_SYNC_FILTERS: Array<{ id: ComptaDriveSyncFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "ready", label: "Prêts" },
  { id: "review", label: "À vérifier" },
  { id: "imported", label: "Importés" },
];
