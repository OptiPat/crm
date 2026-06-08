import { invoke } from "@tauri-apps/api/core";

export interface GoogleContactSyncResult {
  action: string;
  resourceName: string | null;
  enrichedEmail: boolean;
  enrichedPhone: boolean;
  duplicatesRemoved?: number;
  message: string | null;
}

export interface GoogleContactBatchSyncEntry {
  contactId: number;
  prenom: string;
  nom: string;
  action: string;
  message: string | null;
  duplicatesRemoved: number;
}

export interface GoogleContactBatchSyncResult {
  total: number;
  created: number;
  updated: number;
  linkedEnriched: number;
  unchanged: number;
  skipped: number;
  duplicatesRemoved: number;
  errors: number;
  errorSamples: string[];
  entries: GoogleContactBatchSyncEntry[];
}

export async function syncContactGoogle(
  contactId: number
): Promise<GoogleContactSyncResult> {
  return invoke<GoogleContactSyncResult>("sync_contact_google_cmd", { contactId });
}

export async function syncAllContactsGoogle(): Promise<GoogleContactBatchSyncResult> {
  return invoke<GoogleContactBatchSyncResult>("sync_all_contacts_google_cmd");
}

export function googleContactSyncToastMessage(result: GoogleContactSyncResult): string {
  const dedupe =
    result.duplicatesRemoved && result.duplicatesRemoved > 0
      ? ` ${result.duplicatesRemoved} doublon(s) Google supprimé(s).`
      : "";
  switch (result.action) {
    case "created":
      return `Contact créé dans Google Contacts.${dedupe}`;
    case "updated":
      return `Contact Google mis à jour.${dedupe}`;
    case "linked_enriched":
      return `Coordonnées complétées depuis Google Contacts.${dedupe}`;
    case "unchanged":
      return result.message ?? `Déjà synchronisé avec Google Contacts.${dedupe}`;
    case "skipped":
      return result.message ?? "Rien à synchroniser.";
    default:
      return result.message ?? "Synchronisation Google Contacts terminée.";
  }
}

export function googleContactBatchSyncSummary(result: GoogleContactBatchSyncResult): string {
  const ok =
    result.created + result.updated + result.linkedEnriched + result.unchanged;
  const parts = [`${result.total} contact(s) traité(s)`, `${ok} synchronisé(s)`];
  if (result.unchanged > 0) parts.push(`${result.unchanged} déjà à jour`);
  if (result.skipped > 0) parts.push(`${result.skipped} ignoré(s)`);
  if (result.duplicatesRemoved > 0) {
    parts.push(`${result.duplicatesRemoved} doublon(s) Google supprimé(s)`);
  }
  if (result.errors > 0) parts.push(`${result.errors} erreur(s)`);
  return parts.join(" · ");
}
