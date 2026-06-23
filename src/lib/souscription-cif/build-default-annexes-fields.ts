import type { SouscriptionCifProductType } from "@/lib/souscription-cif/souscription-cif-storage";

/** Texte type — annexes SCPI, paragraphe Conseil (page 1). */
export const DEFAULT_CONSEIL_TEXT =
  "Afin de vous constituer du patrimoine et de répondre à vos objectifs, je vous conseille de souscrire des parts de SCPI en pleine propriété.";

/** Texte type — annexes Capital investissement, paragraphe Conseil (page 1). */
export const DEFAULT_CONSEIL_CAPITAL_INVEST_TEXT =
  "Afin de vous constituer du patrimoine et de répondre à vos objectifs, je vous conseille de souscrire des parts de FCPI.";

/** Texte type — annexes G3F, paragraphe Conseil (page 1). */
export const DEFAULT_CONSEIL_G3F_TEXT =
  "Afin de répondre à vos objectifs, je vous conseille de souscrire en Girardin industriel.";

export function buildDefaultConseil(
  productType: SouscriptionCifProductType = "scpi"
): string {
  if (productType === "capital-investissement") {
    return DEFAULT_CONSEIL_CAPITAL_INVEST_TEXT;
  }
  if (productType === "g3f") {
    return DEFAULT_CONSEIL_G3F_TEXT;
  }
  return DEFAULT_CONSEIL_TEXT;
}
