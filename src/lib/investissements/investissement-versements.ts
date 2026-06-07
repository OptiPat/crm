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
