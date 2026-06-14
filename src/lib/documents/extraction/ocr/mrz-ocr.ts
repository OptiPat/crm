import {
  extractMrzLines,
  isMrzFullyVerified,
  parseMrzFromText,
} from "@/lib/identity/mrz-parser";
import { preprocessImageDataUrl } from "@/lib/documents/extraction/ocr/preprocess";
import { recognizeDataUrl } from "@/lib/documents/extraction/ocr/recognize";

/** Score 0–300+ ; MRZ vérifiée ICAO ≈ 200+ bonus. */
export function scoreMrzOcrText(text: string): number {
  const mrz = parseMrzFromText(text);
  if (!mrz) {
    return extractMrzLines(text).length * 5;
  }
  let score = mrz.confidence;
  if (isMrzFullyVerified(mrz)) score += 200;
  return score;
}

/** Choisit le texte OCR MRZ le plus fiable (checksums ICAO prioritaires). */
export function selectBestMrzOcrText(candidates: string[]): string {
  const nonEmpty = candidates.filter((c) => c.trim());
  if (nonEmpty.length === 0) return "";

  let best = nonEmpty[0]!;
  let bestScore = scoreMrzOcrText(best);

  for (const candidate of nonEmpty.slice(1)) {
    const score = scoreMrzOcrText(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/** OCR MRZ : plusieurs passes (brut + pré-traité) et sélection par checksum ICAO. */
export async function recognizeMrzDataUrl(dataUrl: string): Promise<string> {
  const attempts: string[] = [];

  const raw = await recognizeDataUrl(dataUrl, "mrz");
  if (raw.trim()) attempts.push(raw);

  try {
    const preprocessed = await preprocessImageDataUrl(dataUrl);
    const enhanced = await recognizeDataUrl(preprocessed, "mrz");
    if (enhanced.trim()) attempts.push(enhanced);
  } catch {
    // Pré-traitement optionnel — conserver la passe brute.
  }

  return selectBestMrzOcrText(attempts);
}
