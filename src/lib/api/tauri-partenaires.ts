import { invoke } from "@tauri-apps/api/core";

export interface Partenaire {
  id: number;
  type_partenaire: string;
  raison_sociale: string;
  nom_contact?: string;
  prenom_contact?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  specialite?: string;
  zone_geo?: string;
  niveau_collaboration?: string;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface NewPartenaire {
  type_partenaire: string;
  raison_sociale: string;
  nom_contact?: string;
  prenom_contact?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  specialite?: string;
  zone_geo?: string;
  niveau_collaboration?: string;
  notes?: string;
}

export async function getAllPartenaires(): Promise<Partenaire[]> {
  return await invoke<Partenaire[]>("get_all_partenaires");
}

export async function getPartenaireById(id: number): Promise<Partenaire> {
  return await invoke<Partenaire>("get_partenaire_by_id", { id });
}

export async function createPartenaire(newPartenaire: NewPartenaire): Promise<Partenaire> {
  return await invoke<Partenaire>("create_partenaire", { newPartenaire });
}

export async function updatePartenaire(id: number, partenaire: NewPartenaire): Promise<Partenaire> {
  return await invoke<Partenaire>("update_partenaire", { id, partenaire });
}

export async function deletePartenaire(id: number): Promise<void> {
  return await invoke<void>("delete_partenaire", { id });
}
