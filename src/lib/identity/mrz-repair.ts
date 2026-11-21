/**
 * Correction des confusions OCR courantes dans une MRZ (police OCR-B),
 * guidée par la structure ICAO et les clés de contrôle.
 *
 * Règle de sûreté : seuls les champs **exclusivement numériques** (dates, clés de contrôle,
 * n° de l’ancienne CNI) sont corrigés — une lettre y est forcément une erreur OCR, et la
 * conversion est déterministe. Les n° de document alphanumériques ne sont **jamais** modifiés :
 * si la clé elle-même est mal lue, « corriger » le numéro fabriquerait une fausse valeur validée.
 * L’appelant ne garde la version corrigée que si elle valide plus de clés que l’originale.
 */

const LETTER_TO_DIGIT: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  G: "6",
  B: "8",
};

function toDigits(segment: string): string {
  return segment
    .split("")
    .map((ch) => (/\d/.test(ch) ? ch : (LETTER_TO_DIGIT[ch] ?? ch)))
    .join("");
}

function replaceRange(line: string, start: number, endExclusive: number, value: string): string {
  return line.slice(0, start) + value + line.slice(endExclusive);
}

function forceDigits(line: string, start: number, endExclusive: number): string {
  return replaceRange(line, start, endExclusive, toDigits(line.slice(start, endExclusive)));
}

/** TD3 (passeport 2×44) et TD2 (2×36) : même structure sur les 28 premiers caractères de la ligne 2. */
function repairTd2Or3Line2(line: string): string {
  let out = line;
  out = forceDigits(out, 9, 10); // clé n° document
  out = forceDigits(out, 13, 20); // naissance + clé
  out = forceDigits(out, 21, 28); // expiration + clé
  return out;
}

/** TD1 (CNI 2021, 3×30). */
function repairTd1(lines: string[]): string[] {
  let [l1, l2] = lines as [string, string, string];
  const l3 = lines[2]!;
  l1 = forceDigits(l1, 14, 15); // clé n° document
  l2 = forceDigits(l2, 0, 7); // naissance + clé
  l2 = forceDigits(l2, 8, 15); // expiration + clé
  return [l1, l2, l3];
}

/** Ancienne CNI française (2×36) : n° 12 chiffres + clé, naissance + clé + sexe + clé finale. */
function repairFrenchLegacyLine2(line: string): string {
  let out = line;
  out = forceDigits(out, 0, 13); // n° carte (12 chiffres) + clé
  out = forceDigits(out, 27, 34); // naissance + clé
  out = forceDigits(out, 35, 36); // clé finale
  return out;
}

/**
 * Applique les corrections selon le format détecté par la longueur des lignes.
 * Les lignes doivent déjà être normalisées (A–Z, 0–9, `<`) et à la longueur canonique.
 */
export function repairMrzLines(lines: string[]): string[] {
  if (lines.length >= 3 && lines.slice(-3).every((l) => l.length === 30)) {
    return repairTd1(lines.slice(-3));
  }
  const two = lines.slice(-2);
  if (two.length !== 2) return lines;
  const [l1, l2] = two as [string, string];

  if (l1.length === 44 && l2.length === 44) return [l1, repairTd2Or3Line2(l2)];
  if (l1.length === 36 && l2.length === 36) {
    if (l1.startsWith("IDFRA")) return [l1, repairFrenchLegacyLine2(l2)];
    return [l1, repairTd2Or3Line2(l2)];
  }
  return lines;
}
