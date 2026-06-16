import type { ExtractedData } from "./types";
import { parseStelliumAuto } from "./stellium";

/** Détection et parsing Stellium (RIO / QPI) uniquement. */
export function parseAuto(text: string): ExtractedData {
  const stellium = parseStelliumAuto(text);
  if (stellium) return stellium;
  return { raw: text, confidence: 0 };
}
