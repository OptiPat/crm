import type { Investissement } from "@/lib/api/tauri-investissements";
import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";

/** Produits financiers dont l'encours peut évoluer (aligné dashboard). */
export const PLACEMENT_ENCOURS_TYPES = [
  "ASSURANCE_VIE",
  "PER",
  "CONTRAT_CAPITALISATION",
  "EPARGNE_SALARIALE",
  "FIP_FCPI",
  "FCPR",
] as const;

export type PlacementEncoursType = (typeof PLACEMENT_ENCOURS_TYPES)[number];

const IMMOBILIER_SET = new Set<string>(IMMOBILIER_TYPES);

const SCPI_VALORISATION_TYPES = new Set([
  "SCPI",
  "SCPI_DEMEMBREMENT",
  "SCPI_FISCALE",
]);

export type PlacementValorisationUiMode = "encours" | "valorisation";

export function isPlacementEncoursEligible(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (PLACEMENT_ENCOURS_TYPES as readonly string[]).includes(typeProduit);
}

export function isScpiValorisationType(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return SCPI_VALORISATION_TYPES.has(typeProduit);
}

/** Espace client — historique encours / valorisation dans la fiche placement. */
export function isClientPreviewValorisationHistoryEligible(
  typeProduit: string | undefined
): boolean {
  return (
    isPlacementEncoursEligible(typeProduit) ||
    isScpiValorisationType(typeProduit)
  );
}

/** Immobilier / SCPI : même mécanique de relevés, copy « valorisation ». */
export function isPlacementImmoScpiValorisationEligible(
  typeProduit: string | undefined
): boolean {
  if (!typeProduit) return false;
  return (
    IMMOBILIER_SET.has(typeProduit) || SCPI_VALORISATION_TYPES.has(typeProduit)
  );
}

/** Bouton / panneau de mise à jour de valeur (AV-style ou immo/SCPI). */
export function isPlacementValorisationUpdateEligible(
  typeProduit: string | undefined
): boolean {
  return (
    isPlacementEncoursEligible(typeProduit) ||
    isPlacementImmoScpiValorisationEligible(typeProduit)
  );
}

export function getPlacementValorisationUiMode(
  typeProduit: string | undefined
): PlacementValorisationUiMode | null {
  if (isPlacementEncoursEligible(typeProduit)) return "encours";
  if (isPlacementImmoScpiValorisationEligible(typeProduit)) return "valorisation";
  return null;
}

/** Encours effectif : valorisation (ou initial) + versements complémentaires postérieurs (calcul backend). */
export function getEffectiveEncoursCentimes(
  inv: Pick<Investissement, "encours_actuel" | "montant_initial">
): number {
  if (inv.encours_actuel != null && inv.encours_actuel > 0) {
    return inv.encours_actuel;
  }
  return inv.montant_initial ?? 0;
}

export function computeEncoursPlacementsStats(
  investissements: Investissement[],
  options?: { avecMoiOnly?: boolean }
): { encoursCentimes: number; count: number } {
  const avecMoiOnly = options?.avecMoiOnly !== false;
  const seenIds = new Set<number>();
  let encoursCentimes = 0;
  let count = 0;
  for (const inv of investissements) {
    if (seenIds.has(inv.id)) continue;
    if (!isInvestissementActifEncours(inv)) continue;
    if (avecMoiOnly && inv.origine !== "MON_CONSEIL") continue;
    if (!isPlacementEncoursEligible(inv.type_produit)) continue;
    const amount = getEffectiveEncoursCentimes(inv);
    if (amount <= 0) continue;
    seenIds.add(inv.id);
    encoursCentimes += amount;
    count += 1;
  }
  return { encoursCentimes, count };
}

export function isEncoursAvecMoiEligible(
  inv: Pick<Investissement, "origine" | "type_produit" | "statut">
): boolean {
  return (
    isInvestissementActifEncours(inv) &&
    inv.origine === "MON_CONSEIL" &&
    isPlacementEncoursEligible(inv.type_produit)
  );
}

export function filterEncoursPlacementsAvecMoi<T extends Investissement>(items: T[]): T[] {
  return items.filter(isEncoursAvecMoiEligible);
}

export function sortEncoursPlacementsByEncoursDesc<
  T extends Pick<Investissement, "encours_actuel" | "montant_initial">,
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => getEffectiveEncoursCentimes(b) - getEffectiveEncoursCentimes(a)
  );
}

export function listEncoursPlacementsAvecMoi<T extends Investissement>(items: T[]): T[] {
  return sortEncoursPlacementsByEncoursDesc(filterEncoursPlacementsAvecMoi(items));
}
