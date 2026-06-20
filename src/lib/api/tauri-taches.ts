import { invoke } from "@tauri-apps/api/core";
import { notifyTachesChanged } from "@/lib/taches/tache-events";

export type TacheStatut = "A_FAIRE" | "FAIT";
export type TachePriorite = "BASSE" | "NORMALE" | "HAUTE";

/** Contact rattaché à une tâche (identité minimale pour l'affichage). */
export interface TacheContactRef {
  contact_id: number;
  nom: string;
  prenom: string;
}

export interface Tache {
  id: number;
  titre: string;
  description?: string | null;
  /** Échéance en timestamp Unix (secondes, minuit UTC). */
  date_echeance?: number | null;
  priorite: TachePriorite;
  statut: TacheStatut;
  completed_at?: number | null;
  created_at: number;
  updated_at: number;
  /** Contacts liés (vide = tâche libre). */
  contacts: TacheContactRef[];
  /** Créée automatiquement par une action étiquette. */
  from_etiquette_auto?: boolean;
}

/** Conservé pour compat : une tâche porte désormais directement ses contacts. */
export type TacheWithContact = Tache;

export interface NewTache {
  /** Contacts à rattacher (vide = tâche libre). */
  contact_ids?: number[];
  titre: string;
  description?: string | null;
  date_echeance?: number | null;
  priorite?: TachePriorite;
  statut?: TacheStatut;
}

export async function getAllTaches(): Promise<Tache[]> {
  return invoke<Tache[]>("get_all_taches");
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
