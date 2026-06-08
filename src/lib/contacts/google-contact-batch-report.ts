import type {
  GoogleContactBatchSyncEntry,
  GoogleContactBatchSyncResult,
} from "@/lib/api/tauri-google-contacts";

export type GoogleBatchReportFilter =
  | "all"
  | "created"
  | "updated"
  | "linked_enriched"
  | "unchanged"
  | "error";

export function googleContactBatchActionLabel(action: string): string {
  switch (action) {
    case "created":
      return "Créé sur Google";
    case "updated":
      return "Mis à jour Google";
    case "linked_enriched":
      return "CRM enrichi";
    case "unchanged":
      return "Déjà à jour";
    case "skipped":
      return "Ignoré";
    case "error":
      return "Erreur";
    default:
      return action;
  }
}

export function formatGoogleBatchEntryLine(entry: GoogleContactBatchSyncEntry): string {
  const name = `${entry.prenom} ${entry.nom}`.trim() || `#${entry.contactId}`;
  const dedupe =
    entry.duplicatesRemoved > 0 ? ` · ${entry.duplicatesRemoved} doublon(s) supprimé(s)` : "";
  const detail = entry.message ? ` — ${entry.message}` : "";
  return `${name} · ${googleContactBatchActionLabel(entry.action)}${dedupe}${detail}`;
}

export function filterGoogleBatchEntries(
  entries: GoogleContactBatchSyncEntry[],
  filter: GoogleBatchReportFilter
): GoogleContactBatchSyncEntry[] {
  if (filter === "all") return entries;
  return entries.filter((e) => e.action === filter);
}

export const GOOGLE_BATCH_REPORT_FILTERS: {
  id: GoogleBatchReportFilter;
  label: string;
  count: (result: GoogleContactBatchSyncResult) => number;
}[] = [
  { id: "all", label: "Tous", count: (r) => r.total },
  { id: "created", label: "Créés", count: (r) => r.created },
  { id: "updated", label: "Mis à jour", count: (r) => r.updated },
  {
    id: "linked_enriched",
    label: "CRM enrichi",
    count: (r) => r.linkedEnriched,
  },
  { id: "unchanged", label: "Déjà à jour", count: (r) => r.unchanged },
  { id: "error", label: "Erreurs", count: (r) => r.errors },
];
