import { invoke } from "@tauri-apps/api/core";
import { notifyAlertesChanged } from "@/lib/alertes/alert-events";

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

/** Libellé titre alerte : nom du contact (sans motif dupliqué avec le badge). */
export function formatAlerteContactLabel(
  message: string,
  typeAlerte?: string
): string {
  if (
    typeAlerte === "FIN_DEMEMBREMENT" ||
    typeAlerte === "ANNIVERSAIRE"
  ) {
    return message.trim();
  }
  let label = message.split(" - ")[0]?.trim() ?? message.trim();
  label = label.replace(/^🔴|🟠|🟡|🟢|🔵|🟣|⚪\s*/u, "").trim();
  return label;
}

export async function getAllAlertes(): Promise<Alerte[]> {
  return invoke<Alerte[]>("get_all_alertes");
}

export async function getAlertesNonTraitees(): Promise<Alerte[]> {
  return invoke<Alerte[]>("get_alertes_non_traitees");
}

export async function createAlerte(alerte: NewAlerte): Promise<Alerte> {
  const created = await invoke<Alerte>("create_alerte", { newAlerte: alerte });
  notifyAlertesChanged();
  return created;
}

export async function marquerAlerteLue(id: number): Promise<void> {
  return invoke<void>("marquer_alerte_lue", { id });
}

export async function marquerAlerteTraitee(id: number): Promise<void> {
  await invoke<void>("marquer_alerte_traitee", { id });
  notifyAlertesChanged();
}

export async function deleteAlerte(id: number): Promise<void> {
  await invoke<void>("delete_alerte", { id });
  notifyAlertesChanged();
}

export async function snoozeAlerte(id: number, days: number): Promise<void> {
  await invoke<void>("snooze_alerte", { id, days });
  notifyAlertesChanged();
}

export async function countAlertesTraiteesDepuis(sinceTs: number): Promise<number> {
  return invoke<number>("count_alertes_traitees_depuis", { sinceTs });
}

export async function genererAlertesAutomatiques(): Promise<number> {
  return invoke<number>("generer_alertes_automatiques");
}

export async function checkAndCreateDemembrementAlerts(): Promise<Alerte[]> {
  return invoke<Alerte[]>("check_and_create_demembrement_alerts");
}
