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
  body_fetched: boolean;
  provider: string;
  attachments_json: string | null;
  sent_at: number;
  synced_at: number;
}

export interface MailAttachmentMeta {
  name: string;
  size_bytes: number | null;
  attachmentId?: string | null;
  mimeType?: string | null;
}

export interface ContactGmailSyncResult {
  imported: number;
  skipped: number;
  scanned: number;
  incremental: boolean;
  complete: boolean;
}

export interface ContactMailSyncProgress {
  contactId: number;
  scanned: number;
  imported: number;
  skipped: number;
  phase: string;
  done: boolean;
  error: string | null;
}

export interface ContactMailSyncState {
  contact_id: number;
  last_sync_at: number | null;
  last_message_sent_at: number | null;
  initial_sync_complete: boolean;
  backfill_complete: boolean;
  list_page_token: string | null;
}

export const SETTING_CONTACT_MAIL_AUTO_SYNC = "contact_mail_auto_sync";

export async function openContactMailAttachment(
  messageRowId: number,
  attachmentId: string
): Promise<void> {
  return invoke<void>("open_contact_mail_attachment", {
    messageRowId,
    attachmentId,
  });
}

export async function openGmailMessage(
  gmailMessageId: string,
  gmailThreadId?: string | null
): Promise<void> {
  return invoke<void>("open_gmail_message", {
    gmailMessageId,
    gmailThreadId: gmailThreadId ?? null,
  });
}

export function parseAttachments(json: string | null): MailAttachmentMeta[] {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json) as MailAttachmentMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function syncContactGmailMessages(
  contactId: number
): Promise<ContactGmailSyncResult> {
  return invoke<ContactGmailSyncResult>("sync_contact_gmail_messages", { contactId });
}

export async function getContactGmailMessages(
  contactId: number,
  excludeCampaignDuplicates = true
): Promise<ContactGmailMessage[]> {
  return invoke<ContactGmailMessage[]>("get_contact_gmail_messages", {
    contactId,
    excludeCampaignDuplicates,
  });
}

export interface FetchedContactMailBody {
  body: string;
  attachmentsJson: string | null;
}

export async function fetchContactGmailMessageBody(
  messageRowId: number
): Promise<FetchedContactMailBody> {
  return invoke<FetchedContactMailBody>("fetch_contact_gmail_message_body", {
    messageRowId,
  });
}

export async function getContactMailSyncState(
  contactId: number
): Promise<ContactMailSyncState | null> {
  return invoke<ContactMailSyncState | null>("get_contact_mail_sync_state", { contactId });
}
