import { invoke } from "@tauri-apps/api/core";

export interface Contact {
  id: number;
  famille_id?: number | null;
  foyer_id?: number;
  role_foyer?: string;
  role_famille?: string;
  categorie: string;
  filleul_categorie?: string | null; // 🔥 Catégorie filleul indépendante
  parrain_id?: number;
  prescripteur_id?: number; // 🔥 Qui a recommandé ce client
  civilite?: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  date_naissance?: number;
  profession?: string;
  situation_familiale?: string;
  source_lead?: string;
  profil_risque_sri?: number;
  // 🔥 Dates de suivi CLIENT (indépendantes des filleuls)
  date_dernier_contact?: number;
  date_prochain_suivi?: number;
  // 🔥 Dates de suivi FILLEUL (indépendantes des clients)
  date_dernier_contact_filleul?: number;
  date_prochain_suivi_filleul?: number;
  statut_suivi: string;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface NewContact {
  famille_id?: number | null;
  foyer_id?: number | null;
  role_foyer?: string | null;
  role_famille?: string | null;
  categorie?: string;
  filleul_categorie?: string | null; // 🔥 Catégorie filleul indépendante
  parrain_id?: number;
  prescripteur_id?: number; // 🔥 Qui a recommandé ce client
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
  // 🔥 Dates de suivi CLIENT (indépendantes des filleuls)
  date_dernier_contact?: string;
  date_prochain_suivi?: string;
  // 🔥 Dates de suivi FILLEUL (indépendantes des clients)
  date_dernier_contact_filleul?: string;
  date_prochain_suivi_filleul?: string;
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

export async function updateContact(id: number, contact: NewContact): Promise<Contact> {
  return await invoke<Contact>("update_contact", { id, contact });
}

export async function deleteContact(id: number): Promise<void> {
  return await invoke<void>("delete_contact", { id });
}

export async function findContactByEmail(email: string): Promise<Contact | null> {
  return await invoke<Contact | null>("find_contact_by_email", { email });
}

export async function getFilleulsByParrain(parrainId: number): Promise<Contact[]> {
  return await invoke<Contact[]>("get_filleuls_by_parrain", { parrainId });
}

export async function findContactByName(nom: string, prenom: string): Promise<Contact | null> {
  return await invoke<Contact | null>("find_contact_by_name", { nom, prenom });
}

// 🔥 Récupérer tous les clients recommandés par un prescripteur
export async function getClientsByPrescripteur(prescripteurId: number): Promise<Contact[]> {
  return await invoke<Contact[]>("get_clients_by_prescripteur", { prescripteurId });
}

// 🔥 Nettoyer les données orphelines (foyers sans membres, investissements sans contact/foyer)
export async function cleanupOrphanedData(): Promise<[number, number]> {
  return await invoke<[number, number]>("cleanup_orphaned_data");
}
