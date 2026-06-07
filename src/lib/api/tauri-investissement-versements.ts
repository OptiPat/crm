import { invoke } from "@tauri-apps/api/core";
import { notifyInvestissementsChanged } from "@/lib/investissements/investissement-events";

export interface InvestissementVersement {
  id: number;
  investissement_id: number;
  montant: number;
  date_versement: number;
  notes?: string;
  created_at: number;
}

export interface NewInvestissementVersement {
  investissement_id: number;
  montant: number;
  date_versement?: string;
  notes?: string;
}

export async function getVersementsByInvestissement(
  investissementId: number
): Promise<InvestissementVersement[]> {
  return await invoke<InvestissementVersement[]>("get_versements_by_investissement", {
    investissementId,
  });
}

export async function createInvestissementVersement(
  versement: NewInvestissementVersement
): Promise<InvestissementVersement> {
  const created = await invoke<InvestissementVersement>("create_investissement_versement", {
    versement,
  });
  notifyInvestissementsChanged();
  return created;
}

export async function deleteInvestissementVersement(id: number): Promise<void> {
  await invoke<void>("delete_investissement_versement", { id });
  notifyInvestissementsChanged();
}
