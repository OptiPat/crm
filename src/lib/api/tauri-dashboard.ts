import { invoke } from "@tauri-apps/api/core";
import type { DashboardPeriodGranularity } from "@/lib/dashboard/dashboard-period-filter";

export interface DashboardStats {
  total_clients: number;
  encours_placements: number;
  versements_programmes_annuels: number;
  nombre_biens_immobiliers: number;
  panier_moyen: number;
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

export interface YearlyActivityStats {
  year: number;
  label: string;
  clients: number;
  panier_moyen: number;
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

export interface ConversionClientStats {
  rdv_r1: number;
  /** R1 renseigné dans la période + au moins une solution « avec moi ». */
  signatures: number;
  /** Contacts signés « avec moi » (souscription datée dans la période filtrée). */
  signatures_portfolio: number;
  taux_conversion: number;
}

export interface ConversionFilleulStats {
  invites: number;
  presents: number;
  convertis: number;
  taux_presence: number;
  taux_conversion: number;
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
  date_alerte: string;
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

export async function getYearlyActivityStats(
  periodStart: number,
  periodEnd: number,
  bucket: DashboardPeriodGranularity
): Promise<YearlyActivityStats[]> {
  return invoke<YearlyActivityStats[]>("get_yearly_activity_stats", {
    periodStart,
    periodEnd,
    bucket,
  });
}

export async function getConversionClientStats(
  periodStart: number,
  periodEnd: number
): Promise<ConversionClientStats> {
  return invoke<ConversionClientStats>("get_conversion_client_stats", {
    periodStart,
    periodEnd,
  });
}

export async function getConversionFilleulStats(
  periodStart: number,
  periodEnd: number
): Promise<ConversionFilleulStats> {
  return invoke<ConversionFilleulStats>("get_conversion_filleul_stats", {
    periodStart,
    periodEnd,
  });
}

export async function getProductStats(): Promise<ProductStats[]> {
  return invoke<ProductStats[]>("get_product_stats");
}

export async function getPipelineStats(): Promise<PipelineStats> {
  return invoke<PipelineStats>("get_pipeline_stats");
}

export async function getAlertesWithContacts(
  limit?: number | null
): Promise<AlerteWithContact[]> {
  return invoke<AlerteWithContact[]>("get_alertes_with_contacts", {
    limit: limit ?? null,
  });
}
