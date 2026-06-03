import { invoke } from "@tauri-apps/api/core";
import type { Alerte } from "@/lib/api/tauri-alertes";

export interface ContactPendingEmail {
  contact_etiquette_id: number;
  queue_row_kind?: "etiquette" | "template" | string;
  etiquette_nom: string;
  queue_status: "ready" | "scheduled" | "incomplete" | "followup" | "sent" | string;
  email_date_prevue: number | null;
}

export interface ContactRelationStatus {
  open_alertes: Alerte[];
  pending_email: ContactPendingEmail | null;
}

export async function getContactRelationStatus(
  contactId: number
): Promise<ContactRelationStatus> {
  return invoke<ContactRelationStatus>("get_contact_relation_status", { contactId });
}
