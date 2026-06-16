/** Produits acceptant des versements complémentaires ponctuels. */
export const VERSEMENT_COMPLEMENTAIRE_TYPES = [
  "ASSURANCE_VIE",
  "PER",
  "CONTRAT_CAPITALISATION",
] as const;

export type VersementComplementaireType = (typeof VERSEMENT_COMPLEMENTAIRE_TYPES)[number];

export function isVersementComplementaireEligible(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (VERSEMENT_COMPLEMENTAIRE_TYPES as readonly string[]).includes(typeProduit);
}

/** Montant annuel en centimes (aligné dashboard Rust). */
export function versementProgrammeAnnuelCentimes(
  montantCentimes: number,
  frequence?: string | null
): number {
  switch (frequence) {
    case "MENSUEL":
      return montantCentimes * 12;
    case "TRIMESTRIEL":
      return montantCentimes * 4;
    case "SEMESTRIEL":
      return montantCentimes * 2;
    case "ANNUEL":
      return montantCentimes;
    default:
      return montantCentimes * 12;
  }
}

type VersementProgrammeFields = {
  id?: number;
  origine?: string;
  versement_programme?: boolean;
  montant_versement_programme?: number | null;
  frequence_versement?: string | null;
};

export function computeVersementsProgrammesAnnuelStats(
  investissements: VersementProgrammeFields[],
  options?: { avecMoiOnly?: boolean }
): { annuelCentimes: number; count: number } {
  const avecMoiOnly = options?.avecMoiOnly !== false;
  const seenIds = new Set<number>();
  let annuelCentimes = 0;
  let count = 0;
  for (const inv of investissements) {
    if (inv.id != null) {
      if (seenIds.has(inv.id)) continue;
      seenIds.add(inv.id);
    }
    if (avecMoiOnly && inv.origine !== "MON_CONSEIL") continue;
    if (!inv.versement_programme) continue;
    const montant = inv.montant_versement_programme;
    if (montant == null || montant <= 0) continue;
    annuelCentimes += versementProgrammeAnnuelCentimes(montant, inv.frequence_versement);
    count += 1;
  }
  return { annuelCentimes, count };
}
