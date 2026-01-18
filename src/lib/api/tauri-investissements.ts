import { invoke } from "@tauri-apps/api/core";

export type OrigineInvestissement = "MON_CONSEIL" | "EXISTANT_CLIENT";

export interface Investissement {
  id: number;
  contact_id?: number; // Optionnel pour les investissements de foyer
  foyer_id?: number;
  type_produit: string;
  partenaire_id?: number;
  nom_produit: string;
  montant_initial?: number;
  date_souscription?: number;
  date_fin_demembrement?: number;
  versement_programme: boolean;
  montant_versement_programme?: number;
  frequence_versement?: string;
  reinvestissement_dividendes: boolean;
  notes?: string;
  origine: OrigineInvestissement; // "MON_CONSEIL" ou "EXISTANT_CLIENT"
  created_at: number;
  updated_at: number;
}

export interface NewInvestissement {
  contact_id?: number; // Optionnel pour les investissements de foyer
  foyer_id?: number;
  type_produit: string;
  partenaire_id?: number;
  nom_produit: string;
  montant_initial?: number;
  date_souscription?: string; // ISO string ou timestamp
  date_fin_demembrement?: string; // ISO string ou timestamp
  versement_programme?: boolean;
  montant_versement_programme?: number;
  frequence_versement?: string;
  reinvestissement_dividendes?: boolean;
  notes?: string;
  origine?: OrigineInvestissement; // Défaut: "MON_CONSEIL"
}

export interface InvestissementWithDetails {
  id: number;
  contact_id?: number; // Optionnel pour les investissements de foyer
  contact_nom: string;
  contact_prenom: string;
  foyer_id?: number;
  foyer_nom?: string;
  type_produit: string;
  partenaire_id?: number;
  partenaire_nom?: string;
  nom_produit: string;
  montant_initial?: number;
  date_souscription?: number;
  date_fin_demembrement?: number;
  versement_programme: boolean;
  montant_versement_programme?: number;
  frequence_versement?: string;
  reinvestissement_dividendes: boolean;
  notes?: string;
  origine: OrigineInvestissement; // "MON_CONSEIL" ou "EXISTANT_CLIENT"
  created_at: number;
  updated_at: number;
}

export async function getAllInvestissements(): Promise<Investissement[]> {
  return await invoke<Investissement[]>("get_all_investissements");
}

export async function getInvestissementsByContact(contactId: number): Promise<Investissement[]> {
  return await invoke<Investissement[]>("get_investissements_by_contact", { contactId });
}

export async function getInvestissementsByFoyer(foyerId: number): Promise<Investissement[]> {
  return await invoke<Investissement[]>("get_investissements_by_foyer", { foyerId });
}

export async function getInvestissementsWithDetails(): Promise<InvestissementWithDetails[]> {
  return await invoke<InvestissementWithDetails[]>("get_investissements_with_details");
}

export async function createInvestissement(newInvestissement: NewInvestissement): Promise<Investissement> {
  return await invoke<Investissement>("create_investissement", { newInvestissement });
}

export async function getInvestissementById(id: number): Promise<Investissement> {
  return await invoke<Investissement>("get_investissement_by_id", { id });
}

export async function updateInvestissement(id: number, investissement: NewInvestissement): Promise<Investissement> {
  return await invoke<Investissement>("update_investissement", { id, investissement });
}

export async function deleteInvestissement(id: number): Promise<void> {
  return await invoke<void>("delete_investissement", { id });
}
