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
  /** Adresse d'envoi (validée côté Rust). */
  sender_email?: string | null;
  /** Contact CRM pour audit équipe (best-effort). */
  audit_contact_id?: number | null;
  /** Pièces jointes du modèle (mêmes fichiers pour tous les destinataires). */
  attachments?: SendEmailAttachmentInput[];
  /** Newsletter : adresse du lien de désinscription (en-tête List-Unsubscribe). */
  list_unsubscribe_email?: string | null;
}

export interface SendEmailAttachmentInput {
  template_id: number;
  stored_name: string;
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
  /** D2b : relances passées seules dans « Prêts » pendant la synchro. */
  relance_prepared?: number;
  /** Contacts désinscrits de la newsletter par email « Désinscription newsletter ». */
  newsletter_unsubscribed?: number;
}

export async function syncEmailCampaignResponses(): Promise<EmailCampaignSyncResult> {
  return invoke<EmailCampaignSyncResult>("sync_email_campaign_responses");
}
