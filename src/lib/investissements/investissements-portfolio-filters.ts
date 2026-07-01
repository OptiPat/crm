import type { Investissement } from "@/lib/api/tauri-investissements";
import { isPlacementEncoursEligible } from "@/lib/investissements/investissement-encours";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";

/** Placement éligible encours sans valorisation saisie (champ vide). */
export function isSansEncoursRenseigne(
  inv: Pick<Investissement, "type_produit" | "encours_actuel">
): boolean {
  if (!isPlacementEncoursEligible(inv.type_produit)) return false;
  return inv.encours_actuel == null;
}

export function isSansEncoursAvecMoi(
  inv: Pick<Investissement, "type_produit" | "encours_actuel" | "origine" | "statut">
): boolean {
  return (
    isInvestissementActifEncours(inv) &&
    inv.origine === "MON_CONSEIL" &&
    isSansEncoursRenseigne(inv)
  );
}

export function filterSansEncoursRenseigne<
  T extends Pick<Investissement, "type_produit" | "encours_actuel">,
>(items: T[]): T[] {
  return items.filter(isSansEncoursRenseigne);
}

/** AV, PER, FIP/FCPI… « avec moi » sans encours saisi — aligné VP / réinv. */
export function filterSansEncoursRenseigneAvecMoi<
  T extends Pick<Investissement, "type_produit" | "encours_actuel" | "origine">,
>(items: T[]): T[] {
  return items.filter(isSansEncoursAvecMoi);
}

/** Regroupement auto quand un filtre réduit la liste (évite la section « Immobilier » seule). */
export function resolvePortfolioGroupModeWhenFiltered(
  groupMode: "category" | "client" | "partenaire" | "type" | "flat",
  hasNarrowingFilters: boolean
): typeof groupMode {
  if (hasNarrowingFilters && groupMode === "category") {
    return "flat";
  }
  return groupMode;
}
