import { invoke } from "@tauri-apps/api/core";

// Types
export interface Famille {
  id: number;
  nom: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface NewFamille {
  nom: string;
  notes?: string | null;
}

// API Functions
export async function getAllFamilles(): Promise<Famille[]> {
  return invoke<Famille[]>("get_all_familles");
}

export async function getFamilleById(id: number): Promise<Famille> {
  return invoke<Famille>("get_famille_by_id", { id });
}

export async function createFamille(newFamille: NewFamille): Promise<Famille> {
  return invoke<Famille>("create_famille", { newFamille });
}

export async function updateFamille(id: number, famille: NewFamille): Promise<Famille> {
  return invoke<Famille>("update_famille", { id, famille });
}

export async function deleteFamille(id: number): Promise<void> {
  return invoke<void>("delete_famille", { id });
}

export async function getOrCreateFamille(nom: string): Promise<Famille> {
  return invoke<Famille>("get_or_create_famille", { nom });
}
