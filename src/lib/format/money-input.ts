/**
 * Saisie d'un montant en euros : texte affiché « 10 000,50 » ↔ valeur brute « 10000.50 »
 * (lisible par parseFloat, comme l'ancien champ numérique).
 */

/** Valeur brute (« 10000.5 », « 10000,5 », « 10 000,5 ») → affichage « 10 000,5 ». */
export function formatMoneyInput(raw: string): string {
  const { integer, decimal } = splitMoney(raw);
  if (!integer && decimal == null) return "";
  const grouped = (integer || "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped}${decimal != null ? `,${decimal}` : ""}`;
}

/** Texte saisi ou collé (espaces, virgule ou point) → valeur brute « 10000.5 » ("" si vide). */
export function parseMoneyInput(text: string): string {
  const { integer, decimal } = splitMoney(text);
  if (!integer && decimal == null) return "";
  return `${integer || "0"}${decimal != null ? `.${decimal}` : ""}`;
}

/** Nombre de chiffres (et séparateur décimal) avant la position `caret`. */
export function digitsBefore(text: string, caret: number): number {
  return text.slice(0, caret).replace(/[^\d.,]/g, "").length;
}

/** Position dans `formatted` après `count` chiffres/séparateur décimal. */
export function caretAfterDigits(formatted: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/[\d,]/.test(formatted[i])) seen += 1;
    if (seen === count) return i + 1;
  }
  return formatted.length;
}

/**
 * Séparateurs : avec « . » et « , » le dernier est décimal ; un même séparateur répété
 * (« 1.234.567 ») ou un « . » seul suivi de 3 chiffres (« 10.000 ») sépare les milliers ;
 * sinon il est décimal (« 12,5 », « 12.5 » au pavé numérique).
 */
function splitMoney(text: string): { integer: string; decimal: string | null } {
  const cleaned = text.trim().replace(/[^\d.,]/g, "");
  const dots = cleaned.split(".").length - 1;
  const commas = cleaned.split(",").length - 1;
  let decimalIndex = -1;
  if (dots > 0 && commas > 0) {
    decimalIndex = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  } else if (commas === 1) {
    decimalIndex = cleaned.indexOf(",");
  } else if (dots === 1 && !/^\d+\.\d{3}$/.test(cleaned)) {
    decimalIndex = cleaned.indexOf(".");
  }
  if (decimalIndex < 0) {
    return { integer: stripLeadingZeros(cleaned.replace(/[.,]/g, "")), decimal: null };
  }
  const integer = cleaned.slice(0, decimalIndex).replace(/[.,]/g, "");
  const decimal = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, "").slice(0, 2);
  return { integer: stripLeadingZeros(integer), decimal };
}

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+(?=\d)/, "");
}
