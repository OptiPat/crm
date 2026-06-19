import { parseStelliumAmount } from "./amounts";

/**
 * Épargne de précaution souhaitée lue dans la section Objectifs du RIO.
 * Solo : une seule valeur (`person1`). Couple : une colonne par personne.
 */
export interface EpargnePrecaution {
  person1?: number;
  person2?: number;
}

// "Epargne de précaution souhaitée   20   000   €" (solo)
// "Epargne de précaution souhaitée   15   000   €   15   000   €" (couple)
const EPARGNE_PRECAUTION_RE =
  /Epargne de pr[eé]caution(?:\s+souhait[eé]e)?\s+([\d\s.,]+?)\s*€(?:\s+([\d\s.,]+?)\s*€)?/i;

/** Extrait l'épargne de précaution souhaitée (par personne) depuis le texte RIO. */
export function parseEpargnePrecaution(text: string): EpargnePrecaution {
  const match = text.match(EPARGNE_PRECAUTION_RE);
  if (!match) return {};

  const result: EpargnePrecaution = {};
  const v1 = parseStelliumAmount(match[1]);
  if (v1 != null && v1 > 0) result.person1 = v1;
  if (match[2]) {
    const v2 = parseStelliumAmount(match[2]);
    if (v2 != null && v2 > 0) result.person2 = v2;
  }
  return result;
}
