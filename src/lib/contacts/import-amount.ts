/**
 * Montant d'un fichier importé → texte lisible par parseFloat (« 1234.56 »).
 * Accepte « 10 000,50 », « 10.000,50 », « 1,234.56 », « 1 234 € », « -500 » et les nombres Excel.
 * Un seul séparateur « . » ou « , » est lu comme décimal (comportement historique de l'import).
 */
export function normalizeImportAmount(raw: unknown): string {
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : "";
  const text = String(raw ?? "").trim();
  const negative = /^-|^\(.*\)$/.test(text);
  let digits = text.replace(/[^\d.,]/g, "");
  const lastDot = digits.lastIndexOf(".");
  const lastComma = digits.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Les deux : le dernier est la décimale, l'autre sépare les milliers.
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    digits = digits.split(thousands).join("").replace(decimal, ".");
  } else {
    const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
    if (sep) {
      const parts = digits.split(sep);
      // Plusieurs fois le même séparateur : milliers (« 1.234.567 », « 1,234,567 »).
      digits = parts.length > 2 ? parts.join("") : parts.join(".");
    }
  }
  if (!digits || digits === ".") return "";
  return negative ? `-${digits}` : digits;
}
