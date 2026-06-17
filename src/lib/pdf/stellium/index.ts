export { parseStelliumAmount, normalizeStelliumAmounts, extractAmountAfterLabel } from "./amounts";
export { normalizeStelliumText } from "./normalize";
export { splitStelliumSections, extractFieldValue, getSection } from "./sections";
export type { StelliumSectionKey, StelliumSections } from "./sections";
export {
  detectStelliumDocument,
  isStelliumQpi,
  isStelliumRio,
  type StelliumDocumentKind,
} from "./detect";
export { parseStelliumRio } from "./rio-parser";
export { parseStelliumQpi, mapProfilToSri, extractSensibiliteExtraFinanciere } from "./qpi-parser";
export { computeStelliumConfidence } from "./confidence";
export { extractStelliumSignatureDate } from "./signature-date";

import type { ExtractedData } from "../types";
import { detectStelliumDocument } from "./detect";
import { parseStelliumQpi } from "./qpi-parser";
import { parseStelliumRio } from "./rio-parser";

/**
 * Point d'entrée Stellium : retourne null si le texte n'est pas un document Stellium reconnu.
 */
export function parseStelliumAuto(text: string): ExtractedData | null {
  const kind = detectStelliumDocument(text);
  if (kind === "RIO") return parseStelliumRio(text);
  if (kind === "QPI") return parseStelliumQpi(text);
  return null;
}
