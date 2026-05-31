import { invoke } from "@tauri-apps/api/core";

export interface ContactGmailMessage {
  id: number;
  contact_id: number;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  direction: "inbound" | "outbound" | "unknown" | string;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  sent_at: number;
  synced_at: number;
}

export interface ContactGmailSyncResult {
  imported: number;
  skipped: number;
  scanned: number;
}

export async function syncContactGmailMessages(
  contactId: number
): Promise<ContactGmailSyncResult> {
  return invoke<ContactGmailSyncResult>("sync_contact_gmail_messages", { contactId });
}

export async function getContactGmailMessages(
  contactId: number
): Promise<ContactGmailMessage[]> {
  return invoke<ContactGmailMessage[]>("get_contact_gmail_messages", { contactId });
}
