import { invoke } from "@tauri-apps/api/core";
import { notifyFoyersChanged } from "@/lib/foyers/foyer-events";

export interface Foyer {
  id: number;
  nom: string;
  type_foyer: string;
  nombre_parts_fiscales?: number;
  tranche_imposition?: string;
  revenu_fiscal_reference?: number;
  situation_patrimoniale?: string;
  objectifs_patrimoniaux?: string;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface NewFoyer {
  nom: string;
  type_foyer: string;
  nombre_parts_fiscales?: number;
  tranche_imposition?: string;
  revenu_fiscal_reference?: number;
  situation_patrimoniale?: string;
  objectifs_patrimoniaux?: string;
  notes?: string;
}

export async function getAllFoyers(): Promise<Foyer[]> {
  return await invoke<Foyer[]>("get_all_foyers");
}

export async function getFoyerById(id: number): Promise<Foyer> {
  return await invoke<Foyer>("get_foyer_by_id", { id });
}

export async function createFoyer(newFoyer: NewFoyer): Promise<Foyer> {
  const result = await invoke<Foyer>("create_foyer", { newFoyer });
  notifyFoyersChanged();
  return result;
}

export async function updateFoyer(id: number, foyer: NewFoyer): Promise<Foyer> {
  const result = await invoke<Foyer>("update_foyer", { id, foyer });
  notifyFoyersChanged();
  return result;
}

export async function deleteFoyer(id: number): Promise<void> {
  await invoke<void>("delete_foyer", { id });
  notifyFoyersChanged();
}
