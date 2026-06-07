import type { Investissement } from "@/lib/api/tauri-investissements";

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

export function isPlacementEncoursEligible(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (PLACEMENT_ENCOURS_TYPES as readonly string[]).includes(typeProduit);
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
