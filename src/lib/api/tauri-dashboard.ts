import { invoke } from "@tauri-apps/api/core";

export interface DashboardStats {
  total_clients: number;
  total_prospects: number;
  total_suspects: number;
  encours_total: number;
  alertes_non_traitees: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke<DashboardStats>("get_dashboard_stats");
}
