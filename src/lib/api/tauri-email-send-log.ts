import { invoke } from "@tauri-apps/api/core";

export interface EmailSendLogEntry {
  id: number;
  contact_id: number;
  contact_prenom: string;
  contact_nom: string;
  contact_etiquette_id: number | null;
  etiquette_id: number | null;
  etiquette_nom: string | null;
  template_nom: string | null;
  subject: string | null;
  status: "success" | "error" | string;
  error_message: string | null;
  gmail_message_id: string | null;
  batch_id: string | null;
  send_mode: string;
  created_at: number;
}

export async function getEmailSendLog(limit = 200): Promise<EmailSendLogEntry[]> {
  return invoke<EmailSendLogEntry[]>("get_email_send_log", { limit });
}

export async function logEmailSendError(input: {
  contactId: number;
  contactEtiquetteId?: number | null;
  etiquetteNom?: string | null;
  templateNom?: string | null;
  subject?: string | null;
  errorMessage: string;
  batchId?: string | null;
  sendMode?: string;
}): Promise<void> {
  return invoke<void>("log_email_send_error", {
    contactId: input.contactId,
    contactEtiquetteId: input.contactEtiquetteId ?? null,
    etiquetteNom: input.etiquetteNom ?? null,
    templateNom: input.templateNom ?? null,
    subject: input.subject ?? null,
    errorMessage: input.errorMessage,
    batchId: input.batchId ?? null,
    sendMode: input.sendMode ?? "individual",
  });
}
