import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";

/** Types stricts alignés `dashboard_stats.rs`. */
export const DASHBOARD_IMMOBILIER_KPI_STRICT_TYPES = [
  "IMMOBILIER",
  "PINEL",
  "DENORMANDIE",
  "JEANBRUN",
  "MALRAUX",
  "MONUMENT_HISTORIQUE",
  "DEFICIT_FONCIER",
  "LMNP",
  "LMP",
  "NUE_PROPRIETE",
  "RESIDENCE_PRINCIPALE",
  "LOCATIF_CLASSIQUE",
] as const;

/**
 * Alias CRM (import Excel, RIO…) comptés comme immo KPI « avec moi ».
 * RP = résidence principale ; LOCATIF = locatif classique (legacy).
 * RS, SCI, COLOCATION, MONOLOCATION = patrimoine immo import / RIO.
 */
export const DASHBOARD_IMMOBILIER_KPI_ALIAS_TYPES = [
  "RP",
  "LOCATIF",
  "RS",
  "SCI",
  "COLOCATION",
  "MONOLOCATION",
] as const;

/** Aligné sur `dashboard_stats.rs` — KPI « Biens immobiliers ». */
export const DASHBOARD_IMMOBILIER_KPI_TYPES = [
  ...DASHBOARD_IMMOBILIER_KPI_STRICT_TYPES,
  ...DASHBOARD_IMMOBILIER_KPI_ALIAS_TYPES,
] as const;

export function isDashboardImmobilierKpiType(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (DASHBOARD_IMMOBILIER_KPI_TYPES as readonly string[]).includes(typeProduit);
}

export function isDashboardImmobilierKpiInvestissement(
  inv: Pick<
    InvestissementWithDetails,
    "type_produit" | "origine" | "statut" | "contact_id" | "foyer_id"
  >
): boolean {
  if (!isDashboardImmobilierKpiType(inv.type_produit)) return false;
  if (inv.origine !== "MON_CONSEIL") return false;
  if (!isInvestissementActifEncours(inv)) return false;
  if (inv.contact_id == null && inv.foyer_id == null) return false;
  return true;
}

export function filterDashboardImmobilierKpiInvestissements(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return items.filter(isDashboardImmobilierKpiInvestissement);
}
