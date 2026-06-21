import { invoke } from "@tauri-apps/api/core";
import { notifyInvestissementsChanged } from "@/lib/investissements/investissement-events";

export interface InvestissementValorisation {
  id: number;
  investissement_id: number;
  montant: number;
  date_valorisation: number;
  notes?: string;
  stellium_versements_nets_centimes?: number;
  stellium_perf_euro_centimes?: number;
  created_at: number;
}

export interface NewInvestissementValorisation {
  investissement_id: number;
  montant: number;
  date_valorisation?: string;
  notes?: string;
  stellium_versements_nets_centimes?: number;
  stellium_perf_euro_centimes?: number;
}

export async function getValorisationsByInvestissement(
  investissementId: number
): Promise<InvestissementValorisation[]> {
  return await invoke<InvestissementValorisation[]>(
    "get_valorisations_by_investissement",
    { investissementId }
  );
}

export async function createInvestissementValorisation(
  valorisation: NewInvestissementValorisation
): Promise<InvestissementValorisation> {
  const created = await invoke<InvestissementValorisation>(
    "create_investissement_valorisation",
    { valorisation }
  );
  notifyInvestissementsChanged();
  return created;
}

export async function deleteInvestissementValorisation(id: number): Promise<void> {
  await invoke<void>("delete_investissement_valorisation", { id });
  notifyInvestissementsChanged();
}
