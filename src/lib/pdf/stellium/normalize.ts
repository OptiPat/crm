import { normalizeStelliumAmounts } from "./amounts";

/**
 * Préparation du texte brut PDF.js pour le parsing Stellium.
 */
export function normalizeStelliumText(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");

  // Apostrophes et tirets « typographiques »
  text = text.replace(/[\u2018\u2019\u2032]/g, "'");
  text = text.replace(/[\u2013\u2014]/g, "-");

  // Artefacts PDF.js fréquents
  text = text.replace(/Cr[ée]\s+dit/gi, "Crédit");
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");

  // Coches PDF (plusieurs encodages possibles)
  text = text.replace(/[\u2713\u2611\uFE6B]/g, "✓");

  // Puces Word/PDF (U+F0B7 affichée □ si police absente)
  text = text.replace(/[\uE000-\uF8FF]/g, " ");
  text = text.replace(/[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u2219\u00B7]/g, " ");

  text = normalizeStelliumAmounts(text);

  return text.trim();
}

/** Nettoie une valeur extraite (puces, espaces) avant affichage ou persistance. */
export function sanitizeStelliumFieldValue(value?: string): string | undefined {
  const trimmed = value
    ?.replace(/[\uE000-\uF8FF]/g, " ")
    .replace(/[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u2219\u00B7\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed || trimmed === "-" || trimmed === "–") return undefined;
  return trimmed;
}
