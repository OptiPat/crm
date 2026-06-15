/**
 * Parse un montant Stellium : "110 000 €", "50 268,00 €", "80923".
 */
export function parseStelliumAmount(raw: string): number | undefined {
  const cleaned = raw
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value) : undefined;
}

/**
 * Normalise les montants PDF.js : "110   000   €" → "110000 €".
 */
export function normalizeStelliumAmounts(text: string): string {
  return text.replace(/(\d(?:\s+\d)+)\s*€/g, (_, digits: string) => {
    const compact = digits.replace(/\s+/g, "");
    return `${compact} €`;
  });
}

/**
 * Cherche un montant après un libellé dans un bloc de texte.
 * Accepte les montants PDF.js avec espaces internes : "295   268".
 */
export function extractAmountAfterLabel(
  text: string,
  labelPattern: RegExp
): number | undefined {
  const match = text.match(labelPattern);
  if (!match?.[1]) return undefined;
  return parseStelliumAmount(match[1]);
}

/** Fragment regex pour un montant monétaire (espaces internes tolérés). */
export const AMOUNT_CAPTURE = String.raw`([\d\s,]+)`;
