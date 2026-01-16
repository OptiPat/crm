import { invoke } from "@tauri-apps/api/core";

export interface Alerte {
  id: number;
  contact_id: number;
  type_alerte: string;
  message: string;
  date_alerte: number;
  lue: boolean;
  traitee: boolean;
  created_at: number;
}

export interface NewAlerte {
  contact_id: number;
  type_alerte: string;
  message: string;
  date_alerte?: number;
}

export async function getAllAlertes(): Promise<Alerte[]> {
  return invoke<Alerte[]>("get_all_alertes");
}

export async function getAlertesNonTraitees(): Promise<Alerte[]> {
  return invoke<Alerte[]>("get_alertes_non_traitees");
}

export async function createAlerte(alerte: NewAlerte): Promise<Alerte> {
  return invoke<Alerte>("create_alerte", { newAlerte: alerte });
}

export async function marquerAlerteLue(id: number): Promise<void> {
  return invoke<void>("marquer_alerte_lue", { id });
}

export async function marquerAlerteTraitee(id: number): Promise<void> {
  return invoke<void>("marquer_alerte_traitee", { id });
}

export async function deleteAlerte(id: number): Promise<void> {
  return invoke<void>("delete_alerte", { id });
}

export async function genererAlertesAutomatiques(): Promise<number> {
  return invoke<number>("generer_alertes_automatiques");
}

export async function checkAndCreateDemembrementAlerts(): Promise<Alerte[]> {
  return invoke<Alerte[]>("check_and_create_demembrement_alerts");
}
