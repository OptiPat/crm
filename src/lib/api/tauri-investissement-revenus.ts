import { invoke } from "@tauri-apps/api/core";

export interface InvestissementRevenuPercu {
  id: number;
  investissement_id: number;
  montant: number;
  date_perception: number;
  source: string;
  created_at: number;
}

export async function getRevenusPercusByInvestissement(
  investissementId: number
): Promise<InvestissementRevenuPercu[]> {
  return await invoke<InvestissementRevenuPercu[]>(
    "get_revenus_percus_by_investissement",
    { investissementId }
  );
}

export function formatRevenuPercuSource(source: string): string {
  if (source === "ESPACE_CLIENT") return "Espace client";
  return source;
}
