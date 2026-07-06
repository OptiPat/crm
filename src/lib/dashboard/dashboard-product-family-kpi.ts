import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  DASHBOARD_PRODUCT_FAMILY_META,
  resolveDashboardProductFamily,
  type DashboardProductFamilyId,
} from "@/lib/dashboard/dashboard-product-families";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";

/** Encours actifs « avec moi » pour une famille produit (aligné graphique Par produit). */
export function filterDashboardProductFamilyEncoursAvecMoi(
  items: InvestissementWithDetails[],
  familyId: DashboardProductFamilyId
): InvestissementWithDetails[] {
  return items.filter((inv) => {
    if (inv.origine !== "MON_CONSEIL") return false;
    if (!isInvestissementActifEncours(inv)) return false;
    if (getEffectiveEncoursCentimes(inv) <= 0) return false;
    return resolveDashboardProductFamily(inv.type_produit) === familyId;
  });
}

export function dashboardProductFamilySheetTitle(familyId: DashboardProductFamilyId): string {
  return DASHBOARD_PRODUCT_FAMILY_META[familyId].name;
}

export function dashboardProductFamilySheetDescription(
  familyId: DashboardProductFamilyId
): string {
  if (familyId === "EPARGNE_SALARIALE") {
    return "PEE, PERCO / PERCOL et épargne salariale — encours actifs « avec moi ».";
  }
  return `Encours actifs « avec moi » — famille ${DASHBOARD_PRODUCT_FAMILY_META[familyId].name}.`;
}
