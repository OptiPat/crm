import { invoke } from "@tauri-apps/api/core";

export interface SendEmailInput {
  to_email: string;
  to_name?: string;
  subject: string;
  body: string;
  /** HTML avec signature (logo) — optionnel. */
  body_html?: string | null;
  thread_id?: string | null;
  in_reply_to_message_id?: string | null;
}

export interface SendEmailResult {
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
}

export async function sendEmail(emailData: SendEmailInput): Promise<SendEmailResult> {
  return invoke<SendEmailResult>("send_email", { emailData });
}

export interface EmailCampaignSyncResult {
  checked: number;
  mail_detected: number;
  rdv_detected: number;
  errors: string[];
}

export async function syncEmailCampaignResponses(): Promise<EmailCampaignSyncResult> {
  return invoke<EmailCampaignSyncResult>("sync_email_campaign_responses");
}

export async function importCampaignReplyFromGmail(
  contactEtiquetteId: number
): Promise<string> {
  return invoke<string>("import_campaign_reply_from_gmail", {
    contactEtiquetteId,
  });
}
