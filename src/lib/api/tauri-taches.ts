import { invoke } from "@tauri-apps/api/core";
import { notifyTachesChanged } from "@/lib/taches/tache-events";

export type TacheStatut = "A_FAIRE" | "FAIT";
export type TachePriorite = "BASSE" | "NORMALE" | "HAUTE";

export interface Tache {
  id: number;
  contact_id?: number | null;
  titre: string;
  description?: string | null;
  /** Échéance en timestamp Unix (secondes, minuit UTC). */
  date_echeance?: number | null;
  priorite: TachePriorite;
  statut: TacheStatut;
  completed_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface TacheWithContact extends Tache {
  contact_nom?: string | null;
  contact_prenom?: string | null;
}

export interface NewTache {
  contact_id?: number | null;
  titre: string;
  description?: string | null;
  date_echeance?: number | null;
  priorite?: TachePriorite;
  statut?: TacheStatut;
}

export async function getAllTaches(): Promise<TacheWithContact[]> {
  return invoke<TacheWithContact[]>("get_all_taches");
}

export async function getTachesByContact(contactId: number): Promise<Tache[]> {
  return invoke<Tache[]>("get_taches_by_contact", { contactId });
}

export async function createTache(newTache: NewTache): Promise<Tache> {
  const created = await invoke<Tache>("create_tache", { newTache });
  notifyTachesChanged();
  return created;
}

export async function updateTache(id: number, tache: NewTache): Promise<Tache> {
  const updated = await invoke<Tache>("update_tache", { id, tache });
  notifyTachesChanged();
  return updated;
}

export async function setTacheStatut(id: number, statut: TacheStatut): Promise<Tache> {
  const updated = await invoke<Tache>("set_tache_statut", { id, statut });
  notifyTachesChanged();
  return updated;
}

export async function deleteTache(id: number): Promise<void> {
  await invoke<void>("delete_tache", { id });
  notifyTachesChanged();
}
