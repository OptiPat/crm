/**
 * Parse une date depuis Excel (serial), ISO ou format francais (JJ/MM/AAAA).
 * Retourne une chaine ISO UTC pour le backend Tauri.
 */
export function parseImportDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
    );
    return d.toISOString();
  }

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

/** Objet Date pour calculs (démembrement, etc.). */
export function parseImportDateToDate(value: unknown): Date | undefined {
  const iso = parseImportDate(value);
  if (!iso) return undefined;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Format ISO midi UTC pour date_fin_pret (évite décalages fuseau). */
export function parseImportDateFinPret(value: unknown): string | null {
  const iso = parseImportDate(value);
  if (!iso) return null;
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  if (year <= 1950) return null;
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}T12:00:00.000Z`;
}
