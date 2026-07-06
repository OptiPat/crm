import { invoke } from "@tauri-apps/api/core";

export interface ComptaConfig {
  adresseDepart: string;
  indemniteKm: number;
  orsApiKey?: string | null;
  driveRootFolderId: string;
}

export interface ComptaDepense {
  id: number;
  date: string;
  categorie: string;
  tiers: string;
  ttc: number;
  tva: number;
  ht: number;
  lienDrive?: string | null;
  sourceDriveFileId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewComptaDepense {
  date: string;
  categorie: string;
  tiers: string;
  ttc: number;
  tva: number;
  ht: number;
  lienDrive?: string | null;
  sourceDriveFileId?: string | null;
}

export interface ComptaEncaissement {
  id: number;
  client: string;
  date: string;
  exonere: number;
  ht: number;
  tva: number;
  ttc: number;
  total: number;
  don: number;
  isPartenaire: boolean;
  lienDrive?: string | null;
  sourceDriveFileId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewComptaEncaissement {
  client: string;
  date: string;
  exonere: number;
  ht: number;
  tva: number;
  ttc: number;
  total: number;
  don: number;
  isPartenaire: boolean;
  lienDrive?: string | null;
  sourceDriveFileId?: string | null;
}

export interface ComptaBilanData {
  depenses: ComptaDepense[];
  encaissements: ComptaEncaissement[];
  deplacements: ComptaDeplacement[];
}

export interface ComptaDeplacement {
  id: number;
  date: string;
  destination: string;
  objet: string;
  km: number;
  indemnite: number;
  sourceGoogleEventId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewComptaDeplacement {
  date: string;
  destination: string;
  objet: string;
  km: number;
  indemnite: number;
  sourceGoogleEventId?: string | null;
}

export async function getComptaConfig(): Promise<ComptaConfig> {
  return invoke<ComptaConfig>("get_compta_config");
}

export async function saveComptaConfig(config: ComptaConfig): Promise<void> {
  await invoke("save_compta_config", { config });
}

export async function getComptaDepenses(
  year: number,
  month: number
): Promise<ComptaDepense[]> {
  return invoke<ComptaDepense[]>("get_compta_depenses", { year, month });
}

export async function createComptaDepense(
  depense: NewComptaDepense
): Promise<ComptaDepense> {
  return invoke<ComptaDepense>("create_compta_depense", { depense });
}

export async function updateComptaDepense(
  id: number,
  depense: NewComptaDepense
): Promise<ComptaDepense> {
  return invoke<ComptaDepense>("update_compta_depense", { id, depense });
}

export async function deleteComptaDepense(id: number): Promise<void> {
  await invoke("delete_compta_depense", { id });
}

export async function getComptaEncaissements(
  year: number,
  month: number
): Promise<ComptaEncaissement[]> {
  return invoke<ComptaEncaissement[]>("get_compta_encaissements", { year, month });
}

export async function createComptaEncaissement(
  encaissement: NewComptaEncaissement
): Promise<ComptaEncaissement> {
  return invoke<ComptaEncaissement>("create_compta_encaissement", { encaissement });
}

export async function updateComptaEncaissement(
  id: number,
  encaissement: NewComptaEncaissement
): Promise<ComptaEncaissement> {
  return invoke<ComptaEncaissement>("update_compta_encaissement", { id, encaissement });
}

export async function deleteComptaEncaissement(id: number): Promise<void> {
  await invoke("delete_compta_encaissement", { id });
}

export async function getComptaDeplacements(
  year: number,
  month: number
): Promise<ComptaDeplacement[]> {
  return invoke<ComptaDeplacement[]>("get_compta_deplacements", { year, month });
}

export async function createComptaDeplacement(
  deplacement: NewComptaDeplacement
): Promise<ComptaDeplacement> {
  return invoke<ComptaDeplacement>("create_compta_deplacement", { deplacement });
}

export async function updateComptaDeplacement(
  id: number,
  deplacement: NewComptaDeplacement
): Promise<ComptaDeplacement> {
  return invoke<ComptaDeplacement>("update_compta_deplacement", { id, deplacement });
}

export async function deleteComptaDeplacement(id: number): Promise<void> {
  await invoke("delete_compta_deplacement", { id });
}

export async function getComptaBilanData(
  year: number,
  evolutionEndYear: number,
  evolutionEndMonth: number
): Promise<ComptaBilanData> {
  return invoke<ComptaBilanData>("get_compta_bilan_data", {
    year,
    evolutionEndYear,
    evolutionEndMonth,
  });
}

export async function getComptaClosedMonths(): Promise<string[]> {
  return invoke<string[]>("get_compta_closed_months");
}

export async function setComptaMonthClosed(
  year: number,
  month: number,
  closed: boolean
): Promise<void> {
  await invoke("set_compta_month_closed", { year, month, closed });
}

export async function isComptaMonthClosed(year: number, month: number): Promise<boolean> {
  return invoke<boolean>("is_compta_month_closed", { year, month });
}
