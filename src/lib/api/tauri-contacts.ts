import { invoke } from "@tauri-apps/api/core";

export interface Contact {
  id?: number;
  foyer_id?: number;
  categorie: string;
  civilite?: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  date_naissance?: string;
  profession?: string;
  situation_familiale?: string;
  source_lead?: string;
  profil_risque_sri?: number;
  date_dernier_contact?: string;
  date_prochain_suivi?: string;
  statut_suivi: string;
  notes?: string;
  created_at?: number;
  updated_at?: number;
}

export interface NewContact {
  foyer_id?: number;
  categorie: string;
  civilite?: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  date_naissance?: string;
  profession?: string;
  situation_familiale?: string;
  source_lead?: string;
  profil_risque_sri?: number;
  date_dernier_contact?: string;
  date_prochain_suivi?: string;
  statut_suivi?: string;
  notes?: string;
}

export async function getAllContacts(): Promise<Contact[]> {
  return await invoke<Contact[]>("get_all_contacts");
}

export async function getContactById(id: number): Promise<Contact> {
  return await invoke<Contact>("get_contact_by_id", { id });
}

export async function createContact(newContact: NewContact): Promise<Contact> {
  return await invoke<Contact>("create_contact", { newContact });
}

export async function deleteContact(id: number): Promise<void> {
  return await invoke<void>("delete_contact", { id });
}

export async function updateContact(id: number, contact: NewContact): Promise<Contact> {
  return await invoke<Contact>("update_contact", { id, contact });
}
