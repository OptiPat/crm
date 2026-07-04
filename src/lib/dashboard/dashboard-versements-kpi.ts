import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  hasActiveVersementProgramme,
  versementProgrammeAnnuelCentimes,
} from "@/lib/investissements/investissement-versements";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";

/** Aligné sur `dashboard_stats.rs` — KPI « Versements programmés » (tous types produits). */
export function isDashboardVersementProgrammeKpiInvestissement(
  inv: Pick<
    InvestissementWithDetails,
    | "origine"
    | "statut"
    | "versement_programme"
    | "montant_versement_programme"
    | "contact_id"
    | "foyer_id"
  >
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
