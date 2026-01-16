import { invoke } from "@tauri-apps/api/core";

export interface DashboardStats {
  total_clients: number;
  total_prospects: number;
  total_suspects: number;
  encours_total: number;
  alertes_non_traitees: number;
}

export interface CategoryStats {
  clients: number;
  prospect_client: number;
  prospect_filleul: number;
  suspect_client: number;
  suspect_filleul: number;
}

export interface MonthlyStats {
  month: string;      // Format: "Jan 2026"
  nouveaux: number;   // Nombre de nouveaux contacts
}

export interface ProductStats {
  type_produit: string;   // Type de produit
  montant: number;        // Montant en euros
}

export interface PipelineStats {
  suspects: number;    // Nombre de suspects
  prospects: number;   // Nombre de prospects
  clients: number;     // Nombre de clients
}

export interface AlerteWithContact {
  alerte_id: number;
  contact_id: number;
  contact_nom: string;
  contact_prenom: string;
  contact_categorie: string;
  date_dernier_contact: number | null;
  type_alerte: string;
  message: string;
  date_alerte: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke<DashboardStats>("get_dashboard_stats");
}

export async function getCategoryStats(): Promise<CategoryStats> {
  return invoke<CategoryStats>("get_category_stats");
}

export async function getMonthlyStats(): Promise<MonthlyStats[]> {
  return invoke<MonthlyStats[]>("get_monthly_stats");
}

export async function getProductStats(): Promise<ProductStats[]> {
  return invoke<ProductStats[]>("get_product_stats");
}

export async function getPipelineStats(): Promise<PipelineStats> {
  return invoke<PipelineStats>("get_pipeline_stats");
}

export async function getAlertesWithContacts(limit: number): Promise<AlerteWithContact[]> {
  return invoke<AlerteWithContact[]>("get_alertes_with_contacts", { limit });
}
