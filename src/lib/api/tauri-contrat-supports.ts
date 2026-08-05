import { invoke } from "@tauri-apps/api/core";
import type { ContratSupportImportRow } from "@/lib/fund-watchlist/contrat-supports-import";
import { notifyInvestissementsChanged } from "@/lib/investissements/investissement-events";

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

/**
 * Chaque carte Patrimoine éligible demande sa composition : sans mémoire, ouvrir un client à
 * quinze contrats relance quinze appels à chaque rendu de la liste. Les positions ne changent
 * qu'à l'import, d'où le cache — contourné avec `refresh` quand une mutation est signalée.
 */
const supportsCache = new Map<number, Promise<ContratSupportLine[]>>();

export async function listContratSupports(
  investissementId: number,
  options?: { refresh?: boolean }
): Promise<ContratSupportLine[]> {
  const cached = supportsCache.get(investissementId);
  if (cached && !options?.refresh) return cached;

  const request = invoke<ContratSupportLine[]>("list_contrat_supports", {
    investissementId,
  }).catch((error) => {
    // Une erreur ne doit pas rester en cache, sinon la composition ne revient jamais.
    supportsCache.delete(investissementId);
    throw error;
  });
  supportsCache.set(investissementId, request);
  return request;
}

export async function importContratSupports(
  rows: ContratSupportImportRow[],
  sourceLabel = "supports"
): Promise<ContratSupportsImportResult> {
  const result = await invoke<ContratSupportsImportResult>("import_contrat_supports", {
    rows,
    sourceLabel,
  });
  supportsCache.clear();
  notifyInvestissementsChanged();
  return result;
}
