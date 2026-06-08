import { invoke } from "@tauri-apps/api/core";
import { notifyInteractionsChanged } from "@/lib/interactions/interaction-events";

export interface Interaction {
  id: number;
  contact_id: number;
  type_interaction: string;
  sujet?: string;
  contenu?: string;
  date_interaction: number;
  email_id?: number;
  created_at: number;
}

export interface InteractionWithContact {
  id: number;
  contact_id: number;
  contact_nom: string;
  contact_prenom: string;
  type_interaction: string;
  sujet?: string;
  contenu?: string;
  date_interaction: number;
  created_at: number;
}

export interface NewInteraction {
  contact_id: number;
  type_interaction: string;
  sujet?: string;
  contenu?: string;
  date_interaction?: string;
}

export const INTERACTION_TYPES = [
  { value: "APPEL", label: "Appel téléphonique" },
  { value: "EMAIL", label: "Email" },
  { value: "RDV", label: "Rendez-vous" },
  { value: "NOTE", label: "Note / compte-rendu" },
  { value: "AUTRE", label: "Autre" },
] as const;

export interface ExchangeHistoryEntry {
  entry_kind: "manual" | "email_campagne";
  sort_date: number;
  contact_id: number;
  contact_nom: string;
  contact_prenom: string;
  contact_email?: string | null;
  contact_telephone?: string | null;
  contact_etiquette_id?: number | null;
  etiquette_nom?: string | null;
  sent_at?: number | null;
  sent_subject?: string | null;
  sent_body?: string | null;
  sent_template_nom?: string | null;
  template_sujet?: string | null;
  template_corps?: string | null;
  template_agenda_link_id?: string | null;
  email_gmail_message_id?: string | null;
  email_gmail_thread_id?: string | null;
  email_reponse_at?: number | null;
  email_reponse_type?: string | null;
  email_reponse_body?: string | null;
  email_reponse_gmail_message_id?: string | null;
  interaction_id?: number | null;
  type_interaction?: string | null;
  sujet?: string | null;
  contenu?: string | null;
  created_at?: number | null;
}

export async function getAllInteractionsWithContacts(): Promise<InteractionWithContact[]> {
  return invoke<InteractionWithContact[]>("get_all_interactions_with_contacts");
}

export async function getExchangeHistoryTimeline(
  maxEntries?: number
): Promise<ExchangeHistoryEntry[]> {
  return invoke<ExchangeHistoryEntry[]>("get_exchange_history_timeline", {
    maxEntries: maxEntries ?? null,
  });
}

export async function getExchangeHistoryTimelineForContact(
  contactId: number,
  maxEntries?: number
): Promise<ExchangeHistoryEntry[]> {
  return invoke<ExchangeHistoryEntry[]>("get_exchange_history_timeline_for_contact", {
    contactId,
    maxEntries: maxEntries ?? null,
  });
}

export async function getInteractionsByContact(contactId: number): Promise<Interaction[]> {
  return invoke<Interaction[]>("get_interactions_by_contact", { contactId });
}

export async function createInteraction(data: NewInteraction): Promise<Interaction> {
  const result = await invoke<Interaction>("create_interaction", { newInteraction: data });
  notifyInteractionsChanged();
  return result;
}

export async function updateInteraction(
  id: number,
  data: NewInteraction
): Promise<Interaction> {
  const result = await invoke<Interaction>("update_interaction", { id, interaction: data });
  notifyInteractionsChanged();
  return result;
}

export async function deleteInteraction(id: number): Promise<void> {
  await invoke<void>("delete_interaction", { id });
  notifyInteractionsChanged();
}
