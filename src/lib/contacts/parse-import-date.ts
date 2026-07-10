/**
 * Parse une date depuis Excel (serial), ISO ou format francais (JJ/MM/AAAA).
 * Retourne une chaine ISO UTC pour le backend Tauri.
 */

function expandTwoDigitYear(year: number): number {
  if (year >= 100) return year;
  return year >= 50 ? 1900 + year : 2000 + year;
}

/** JJ/MM vs MM/JJ : défaut France (JJ/MM), bascule US si un segment > 12. */
function resolveSlashDateParts(
  first: number,
  second: number
): { day: number; month: number } | undefined {
  if (first > 12 && second <= 12) return { day: first, month: second };
  if (second > 12 && first <= 12) return { day: second, month: first };
  if (first > 12 && second > 12) return undefined;
  return { day: first, month: second };
}

function utcIsoFromCalendarParts(
  year: number,
  month: number,
  day: number
): string | undefined {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return undefined;
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return undefined;
  }
  return d.toISOString();
}

function parseSlashDateString(dateStr: string): string | undefined {
  const match = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s.*)?$/);
  if (!match) return undefined;
  const first = parseInt(match[1]!, 10);
  const second = parseInt(match[2]!, 10);
  const year = expandTwoDigitYear(parseInt(match[3]!, 10));
  const parts = resolveSlashDateParts(first, second);
  if (!parts) return undefined;
  return utcIsoFromCalendarParts(year, parts.month, parts.day);
}

function parseExcelSerialToIso(serial: number): string | undefined {
  const jsDate = new Date((serial - 25569) * 86400 * 1000);
  if (Number.isNaN(jsDate.getTime())) return undefined;
  const year = jsDate.getUTCFullYear();
  if (year <= 1900 || year >= 2100) return undefined;
  return utcIsoFromCalendarParts(year, jsDate.getUTCMonth() + 1, jsDate.getUTCDate());
}

export function parseImportDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return utcIsoFromCalendarParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const serial = Math.floor(value);
    if (serial > 1 && serial < 100000) {
      return parseExcelSerialToIso(serial);
    }
  }

  const dateStr = String(value).trim();
  if (!dateStr) return undefined;

  const isoDateOnly = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    return utcIsoFromCalendarParts(
      parseInt(isoDateOnly[1]!, 10),
      parseInt(isoDateOnly[2]!, 10),
      parseInt(isoDateOnly[3]!, 10)
    );
  }

  const isoDateTime = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (isoDateTime) {
    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
      return utcIsoFromCalendarParts(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth() + 1,
        parsed.getUTCDate()
      );
    }
  }

  const slashIso = parseSlashDateString(dateStr);
  if (slashIso) return slashIso;

  const excelDate = parseFloat(dateStr.replace(",", "."));
  if (
    !dateStr.includes("-") &&
    !dateStr.includes("/") &&
    !Number.isNaN(excelDate) &&
    excelDate > 1 &&
    excelDate < 100000
  ) {
    return parseExcelSerialToIso(Math.floor(excelDate));
  }

  return undefined;
}

/** Affiche une ISO backend dans un `<input type="date">` (jour calendaire UTC). */
export function isoToDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `<input type="date">` → ISO UTC (minuit calendaire). */
export function dateInputToIso(dateInput: string): string | undefined {
  const trimmed = dateInput.trim();
  if (!trimmed) return undefined;
  return parseImportDate(trimmed);
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
