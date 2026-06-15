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

  text = normalizeStelliumAmounts(text);

  return text.trim();
}
