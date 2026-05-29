import { invoke } from "@tauri-apps/api/core";

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

export async function getAllInteractionsWithContacts(): Promise<InteractionWithContact[]> {
  return invoke<InteractionWithContact[]>("get_all_interactions_with_contacts");
}

export async function getInteractionsByContact(contactId: number): Promise<Interaction[]> {
  return invoke<Interaction[]>("get_interactions_by_contact", { contactId });
}

export async function createInteraction(data: NewInteraction): Promise<Interaction> {
  return invoke<Interaction>("create_interaction", { newInteraction: data });
}

export async function updateInteraction(
  id: number,
  data: NewInteraction
): Promise<Interaction> {
  return invoke<Interaction>("update_interaction", { id, interaction: data });
}

export async function deleteInteraction(id: number): Promise<void> {
  return invoke<void>("delete_interaction", { id });
}
