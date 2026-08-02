import { invoke } from "@tauri-apps/api/core";
import { notifyAlertesChanged } from "@/lib/alertes/alert-events";
import { notifyInteractionsChanged } from "@/lib/interactions/interaction-events";
import { notifyInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { notifyTachesChanged } from "@/lib/taches/tache-events";

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
    typeAlerte === "ANNIVERSAIRE" ||
    typeAlerte === "ARBITRAGE_AV_PER"
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
  notifyTachesChanged();
  notifyInvestissementsChanged();
}

export async function deleteAlerte(id: number): Promise<void> {
  await invoke<void>("delete_alerte", { id });
  notifyAlertesChanged();
  notifyTachesChanged();
  notifyInvestissementsChanged();
}

export async function snoozeAlerte(id: number, days: number): Promise<void> {
  await invoke<void>("snooze_alerte", { id, days });
  notifyAlertesChanged();
  notifyTachesChanged();
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

export async function checkAndCreateArbitrageAlerts(): Promise<Alerte[]> {
  const created = await invoke<Alerte[]>("check_and_create_arbitrage_alerts");
  notifyAlertesChanged();
  return created;
}

export async function traiterAlerteArbitrage(
  alerteId: number,
  dateDernierArbitrage?: number,
  dateProchainArbitrage?: number,
  note?: string
): Promise<void> {
  await invoke<void>("traiter_alerte_arbitrage", {
    alerteId,
    dateDernierArbitrage: dateDernierArbitrage ?? null,
    dateProchainArbitrage: dateProchainArbitrage ?? null,
    note: note?.trim() || null,
  });
  notifyAlertesChanged();
  notifyTachesChanged();
  notifyInvestissementsChanged();
  if (note?.trim()) notifyInteractionsChanged();
}

export async function reporterAlerteArbitrage(
  alerteId: number,
  mois: number
): Promise<void> {
  await invoke<void>("reporter_alerte_arbitrage", { alerteId, mois });
  notifyAlertesChanged();
  notifyTachesChanged();
}
