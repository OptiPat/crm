import { invoke } from "@tauri-apps/api/core";

export interface TemplateSendDay {
  /** Jour local AAAA-MM-JJ. */
  day: string;
  count: number;
}

export interface TemplateCorrectionTarget {
  row_id: number;
  queue_row_kind: "template" | "etiquette";
  contact_id: number;
  contact_prenom: string;
  contact_nom: string;
  contact_email: string | null;
  contact_registre: string | null;
  sent_subject: string | null;
  email_date_envoi: number;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  /** Correctif déjà envoyé pour cet envoi (pas de doublon). */
  already_corrected: boolean;
}

export async function listTemplateSendDays(templateId: number): Promise<TemplateSendDay[]> {
  return invoke<TemplateSendDay[]>("list_template_send_days", { templateId });
}

export async function listTemplateCorrectionTargets(
  templateId: number,
  day: string
): Promise<TemplateCorrectionTarget[]> {
  return invoke<TemplateCorrectionTarget[]>("list_template_correction_targets", {
    templateId,
    day,
  });
}

export async function recordTemplateCorrectionSent(input: {
  contactId: number;
  queueRowKind: string;
  rowId: number;
  subject: string;
  body: string;
}): Promise<void> {
  return invoke<void>("record_template_correction_sent", input);
}
