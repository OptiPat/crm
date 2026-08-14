/** Biens meubles et professionnels — date + valorisation, pas une enveloppe. */

export const BIENS_MEUBLES_TYPES = [
  "BIJOUX",
  "OBJET_ART",
  "VOITURE_COLLECTION",
  "PARTS_SOCIETE",
  "FONDS_COMMERCE",
] as const;

export type BiensMeublesType = (typeof BIENS_MEUBLES_TYPES)[number];

const BIENS_MEUBLES_SET = new Set<string>(BIENS_MEUBLES_TYPES);

export function isBiensMeublesType(
  typeProduit: string | undefined
): typeProduit is BiensMeublesType {
  if (!typeProduit) return false;
  return BIENS_MEUBLES_SET.has(typeProduit);
}
