import { invoke } from "@tauri-apps/api/core";
import type { ContratSupportImportRow } from "@/lib/fund-watchlist/contrat-supports-import";

export interface ContratSupportHorsVeille {
  isin: string;
  libelle: string;
  encours: number;
}

export interface ContratSupportsImportResult {
  lignes_total: number;
  lignes_importees: number;
  lignes_ignorees: number;
  contrats_reconnus: number;
  contrats_inconnus: string[];
  encours_total: number;
  vl_points_ajoutes: number;
  supports_hors_veille: ContratSupportHorsVeille[];
}

export interface FundHolder {
  contact_id?: number | null;
  nom: string;
  prenom: string;
  numero_contrat: string;
  nom_produit: string;
  encours?: number | null;
  nb_parts?: number | null;
  plus_moins_value_pct?: number | null;
  date_valeur?: number | null;
}

export async function listFundHolders(isin: string): Promise<FundHolder[]> {
  return await invoke<FundHolder[]>("list_fund_holders", { isin });
}

export interface ContratSupportLine {
  isin: string;
  libelle: string;
  type_support?: string | null;
  sri?: number | null;
  nb_parts?: number | null;
  valeur_unitaire?: number | null;
  encours?: number | null;
  plus_moins_value_pct?: number | null;
  date_valeur?: number | null;
}

export async function listContratSupports(
  investissementId: number
): Promise<ContratSupportLine[]> {
  return await invoke<ContratSupportLine[]>("list_contrat_supports", {
    investissementId,
  });
}

export async function importContratSupports(
  rows: ContratSupportImportRow[],
  sourceLabel = "supports"
): Promise<ContratSupportsImportResult> {
  return await invoke<ContratSupportsImportResult>("import_contrat_supports", {
    rows,
    sourceLabel,
  });
}
