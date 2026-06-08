import type { GoogleContactSyncResult } from "@/lib/api/tauri-google-contacts";

export function canSyncContactToGoogle(contact: {
  email?: string | null;
  telephone?: string | null;
}): boolean {
  return Boolean(contact.email?.trim() || contact.telephone?.trim());
}

export function googleSyncNeedsContactRefresh(result: GoogleContactSyncResult): boolean {
  return result.enrichedEmail || result.enrichedPhone;
}
