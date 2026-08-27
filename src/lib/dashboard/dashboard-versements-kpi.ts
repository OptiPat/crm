import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  hasActiveVersementProgramme,
  isAvPerType,
  versementProgrammeAnnuelCentimes,
} from "@/lib/investissements/investissement-versements";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";

type VersementProgrammeKpiFields = {
  origine?: string;
  statut?: string;
  type_produit?: string;
  versement_programme?: boolean;
  montant_versement_programme?: number | null;
  contact_id?: number | null;
  foyer_id?: number | null;
};

/** Aligné sur `dashboard_stats.rs` — KPI « Versements programmés » (tous types produits). */
export function isDashboardVersementProgrammeKpiInvestissement(
  inv: VersementProgrammeKpiFields
): boolean {
  if (inv.origine !== "MON_CONSEIL") return false;
  if (!isInvestissementActifEncours(inv)) return false;
  if (!hasActiveVersementProgramme(inv)) return false;
  if (inv.contact_id == null && inv.foyer_id == null) return false;
  return true;
}

export function filterDashboardVersementProgrammeKpiInvestissements(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return items.filter(isDashboardVersementProgrammeKpiInvestissement);
}

export function sortVersementProgrammeKpiByAnnuelDesc(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return [...items].sort((a, b) => {
    const annuelA = versementProgrammeAnnuelCentimes(
      a.montant_versement_programme ?? 0,
      a.frequence_versement
    );
    const annuelB = versementProgrammeAnnuelCentimes(
      b.montant_versement_programme ?? 0,
      b.frequence_versement
    );
    return annuelB - annuelA;
  });
}

export function listDashboardVersementProgrammeKpiInvestissements(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return sortVersementProgrammeKpiByAnnuelDesc(
    filterDashboardVersementProgrammeKpiInvestissements(items)
  );
}

export function isAvPerVersementProgrammeKpiInvestissement(
  inv: VersementProgrammeKpiFields
): boolean {
  return isDashboardVersementProgrammeKpiInvestissement(inv) && isAvPerType(inv.type_produit);
}

export function isScpiVersementProgrammeKpiInvestissement(
  inv: VersementProgrammeKpiFields
): boolean {
  return isDashboardVersementProgrammeKpiInvestissement(inv) && inv.type_produit === "SCPI";
}

export function filterAvPerVersementProgrammeKpiInvestissements(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return items.filter(isAvPerVersementProgrammeKpiInvestissement);
}

export function filterScpiVersementProgrammeKpiInvestissements(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return items.filter(isScpiVersementProgrammeKpiInvestissement);
}

export function listAvPerVersementProgrammeKpiInvestissements(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return sortVersementProgrammeKpiByAnnuelDesc(
    filterAvPerVersementProgrammeKpiInvestissements(items)
  );
}

export function listScpiVersementProgrammeKpiInvestissements(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return sortVersementProgrammeKpiByAnnuelDesc(
    filterScpiVersementProgrammeKpiInvestissements(items)
  );
}
