import { parseStelliumAmount } from "./amounts";

/**
 * Somme des échéances annuelles de l'onglet Passifs (crédits immo, etc.).
 * Ignore le CRD et les lignes TOTAL vides.
 */
export function parsePassifsEcheanceAnnuelle(patrimoineSection: string): number {
  const passifsIdx = patrimoineSection.search(/\bPassifs\b/i);
  if (passifsIdx < 0) return 0;

  let block = patrimoineSection.slice(passifsIdx);
  const endIdx = block.search(/\bRevenus et charges\b/i);
  if (endIdx >= 0) {
    block = block.slice(0, endIdx);
  }

  let total = 0;

  const subtotalPattern =
    /Crédits?\s+immobilier\s+([\d\s,]+)\s*€/gi;
  let match: RegExpExecArray | null;
  while ((match = subtotalPattern.exec(block)) !== null) {
    const amount = parseStelliumAmount(match[1]);
    if (amount != null && amount > 0) {
      total += amount;
    }
  }

  if (total > 0) {
    return total;
  }

  const linePattern = /Crédit[^€\n]*?([\d\s,]+)\s*€/gi;
  while ((match = linePattern.exec(block)) !== null) {
    const amount = parseStelliumAmount(match[1]);
    if (amount != null && amount > 0) {
      total += amount;
    }
  }

  return total;
}
