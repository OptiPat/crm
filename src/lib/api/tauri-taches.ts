import { invoke } from "@tauri-apps/api/core";
import { notifyAlertesChanged } from "@/lib/alertes/alert-events";
import { notifyInteractionsChanged } from "@/lib/interactions/interaction-events";
import { notifyInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { notifyTachesChanged } from "@/lib/taches/tache-events";
import type { TacheRecurrence } from "@/lib/taches/tache-recurrence";

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
  /** Créée automatiquement par une action modèle email. */
  from_template_auto?: boolean;
  /** Règle de récurrence (prochaine occurrence à la complétion). */
  recurrence?: TacheRecurrence | null;
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
  recurrence?: TacheRecurrence | null;
}

export interface SetTacheStatutResult {
  tache: Tache;
  spawned_next?: Tache | null;
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

export async function setTacheStatut(
  id: number,
  statut: TacheStatut
): Promise<SetTacheStatutResult> {
  const result = await invoke<SetTacheStatutResult>("set_tache_statut", { id, statut });
  notifyTachesChanged();
  if (statut === "FAIT") {
    notifyAlertesChanged();
    notifyInvestissementsChanged();
  }
  return result;
}

export async function completeArbitrageTache(
  tacheId: number,
  dateDernierArbitrage: number,
  dateProchainArbitrage: number,
  note?: string
): Promise<void> {
  await invoke<void>("complete_arbitrage_tache", {
    tacheId,
    dateDernierArbitrage,
    dateProchainArbitrage,
    note: note?.trim() || null,
  });
  notifyTachesChanged();
  notifyAlertesChanged();
  notifyInvestissementsChanged();
  if (note?.trim()) notifyInteractionsChanged();
}

export async function deleteTache(id: number): Promise<void> {
  await invoke<void>("delete_tache", { id });
  notifyTachesChanged();
  notifyAlertesChanged();
  notifyInvestissementsChanged();
}
