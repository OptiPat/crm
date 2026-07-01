import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";

/** Produits acceptant des versements complémentaires ponctuels. */
export const VERSEMENT_COMPLEMENTAIRE_TYPES = [
  "ASSURANCE_VIE",
  "PER",
  "CONTRAT_CAPITALISATION",
] as const;

export type VersementComplementaireType = (typeof VERSEMENT_COMPLEMENTAIRE_TYPES)[number];

/** AV & PER — cible du suivi des versements programmés. */
export const AV_PER_TYPES = ["ASSURANCE_VIE", "PER"] as const;

export type AvPerType = (typeof AV_PER_TYPES)[number];

type VersementProgrammeFields = {
  id?: number;
  origine?: string;
  statut?: string;
  type_produit?: string;
  versement_programme?: boolean;
  montant_versement_programme?: number | null;
  frequence_versement?: string | null;
};

export function isAvPerType(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (AV_PER_TYPES as readonly string[]).includes(typeProduit);
}

export function hasActiveVersementProgramme(
  inv: Pick<VersementProgrammeFields, "versement_programme" | "montant_versement_programme">
): boolean {
  return (
    Boolean(inv.versement_programme) &&
    inv.montant_versement_programme != null &&
    inv.montant_versement_programme > 0
  );
}

export function isAvPerAvecMoi(
  inv: Pick<VersementProgrammeFields, "origine" | "type_produit"> & { type_produit?: string }
): boolean {
  return inv.origine === "MON_CONSEIL" && isAvPerType(inv.type_produit);
}

export interface AvPerVersementProgrammeCoverageStats {
  total: number;
  withVp: number;
  withoutVp: number;
  /** 0–100, null si aucun contrat AV/PER avec moi. */
  percentWithVp: number | null;
}

export function computeAvPerVersementProgrammeCoverageStats(
  investissements: (VersementProgrammeFields & { type_produit?: string })[],
  options?: { avecMoiOnly?: boolean }
): AvPerVersementProgrammeCoverageStats {
  const avecMoiOnly = options?.avecMoiOnly !== false;
  const seenIds = new Set<number>();
  let total = 0;
  let withVp = 0;

  for (const inv of investissements) {
    if (inv.id != null) {
      if (seenIds.has(inv.id)) continue;
      seenIds.add(inv.id);
    }
    if (avecMoiOnly && inv.origine !== "MON_CONSEIL") continue;
    if (!isInvestissementActifEncours(inv)) continue;
    if (!isAvPerType(inv.type_produit)) continue;
    total += 1;
    if (hasActiveVersementProgramme(inv)) withVp += 1;
  }

  const withoutVp = total - withVp;
  return {
    total,
    withVp,
    withoutVp,
    percentWithVp: total > 0 ? (withVp / total) * 100 : null,
  };
}

export function filterAvPerSansVersementProgramme<
  T extends VersementProgrammeFields & { type_produit?: string; origine?: string },
>(investissements: T[]): T[] {
  return investissements.filter(
    (inv) =>
      isInvestissementActifEncours(inv) &&
      isAvPerAvecMoi(inv) &&
      !hasActiveVersementProgramme(inv)
  );
}

export function isVersementComplementaireEligible(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (VERSEMENT_COMPLEMENTAIRE_TYPES as readonly string[]).includes(typeProduit);
}

type MontantInvestiFields = {
  montant_initial?: number | null;
  montant_investi_total?: number | null;
};

/** Montant investi cumulé : souscription + versements complémentaires. */
export function getMontantInvestiCentimes(inv: MontantInvestiFields): number {
  if (inv.montant_investi_total != null) {
    return inv.montant_investi_total;
  }
  return inv.montant_initial ?? 0;
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
    if (!isInvestissementActifEncours(inv)) continue;
    if (!inv.versement_programme) continue;
    const montant = inv.montant_versement_programme;
    if (montant == null || montant <= 0) continue;
    annuelCentimes += versementProgrammeAnnuelCentimes(montant, inv.frequence_versement);
    count += 1;
  }
  return { annuelCentimes, count };
}
