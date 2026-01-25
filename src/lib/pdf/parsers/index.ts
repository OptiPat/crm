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
import { parseGeneric } from "./generic-parser";
import { parseRIO, isRIO } from "./rio-parser";

/**
 * Parse automatiquement un texte en détectant le type de document
 */
export function parseAuto(text: string): ExtractedData {
  // Détecter le type de document
  if (isRIO(text)) {
    return parseRIO(text);
  }

  // Par défaut, utiliser le parser générique
  return parseGeneric(text);
}
