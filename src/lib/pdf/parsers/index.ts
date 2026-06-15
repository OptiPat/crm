// Point d'entrée des parsers
export { parseGeneric } from "./generic-parser";
export { parseRIO, isRIO } from "./rio-parser";
export {
  PRODUCT_SYNONYMS,
  KNOWN_SCPI_NAMES,
  normalizeForMatching,
  matchesProductType,
  detectProductType,
  detectImmobilierType,
  detectEpargneType,
  isKnownSCPI,
} from "./product-synonyms";
export type { ProductType, ProductCategory } from "./product-synonyms";

import type { ExtractedData } from "../types";
import { parseStelliumAuto } from "../stellium";
import { parseGeneric } from "./generic-parser";
import { parseRIO, isRIO } from "./rio-parser";

/**
 * Parse automatiquement un texte en détectant le type de document.
 * Priorité : formats Stellium 2026+ → RIO legacy → générique.
 */
export function parseAuto(text: string): ExtractedData {
  const stellium = parseStelliumAuto(text);
  if (stellium) return stellium;

  if (isRIO(text)) {
    return parseRIO(text);
  }

  return parseGeneric(text);
}
