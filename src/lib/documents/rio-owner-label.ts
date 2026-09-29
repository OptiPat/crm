import type { RioCoupleOwnerHint } from "@/lib/pdf/types";

export interface RioOwnerLabelSource {
  isCouple?: boolean;
  prenom?: string;
  nom?: string;
  conjoint?: { prenom?: string; nom?: string };
}

function memberName(prenom?: string, nom?: string, fallback?: string): string {
  const name = [prenom?.trim(), nom?.trim()].filter(Boolean).join(" ");
  return name || fallback || "";
}

/** Libellé du détenteur d'une ligne patrimoine RIO couple. */
export function rioOwnerDisplayLabel(
  data: RioOwnerLabelSource,
  hint?: RioCoupleOwnerHint
): string | null {
  if (!data.isCouple || !hint) return null;
  if (hint === "foyer") return "Commun";
  if (hint === "person1") return memberName(data.prenom, data.nom, "Investisseur 1");
  return memberName(data.conjoint?.prenom, data.conjoint?.nom, "Investisseur 2");
}
