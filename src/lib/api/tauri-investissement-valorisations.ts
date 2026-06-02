import { invoke } from "@tauri-apps/api/core";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";

export interface InvestissementValorisation {
  id: number;
  investissement_id: number;
  montant: number;
  date_valorisation: number;
  notes?: string;
  created_at: number;
}

export interface NewInvestissementValorisation {
  investissement_id: number;
  montant: number;
  date_valorisation?: string;
  notes?: string;
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
  notifyContactsChanged();
  return created;
}

export async function deleteInvestissementValorisation(id: number): Promise<void> {
  await invoke<void>("delete_investissement_valorisation", { id });
  notifyContactsChanged();
}
