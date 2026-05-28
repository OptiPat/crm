/**
 * Parse une date depuis Excel (serial), ISO ou format francais (JJ/MM/AAAA).
 * Retourne une chaine ISO UTC pour le backend Tauri.
 */
export function parseImportDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;

  const dateStr = String(value).trim();
  if (!dateStr) return undefined;

  const excelDate = parseFloat(dateStr.replace(",", "."));
  if (!isNaN(excelDate) && excelDate > 1 && excelDate < 100000) {
    const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
    if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1900 && jsDate.getFullYear() < 2100) {
      return jsDate.toISOString();
    }
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const fr = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    const day = parseInt(fr[1], 10);
    const month = parseInt(fr[2], 10);
    const year = parseInt(fr[3], 10);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    if (d.getFullYear() > 1900 && d.getFullYear() < 2100) return d.toISOString();
  }

  return undefined;
}
