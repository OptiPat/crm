const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export interface CristallianceSupportsImportRow {
  isin: string;
  nom: string;
  categorie: string | null;
  notation_morningstar: number | null;
  sri: number | null;
  vl_previous: number | null;
  vl_recent: number | null;
  vl_date: number | null;
  perf_ytd: number | null;
  perf_1semaine: number | null;
  perf_1mois: number | null;
  perf_3mois: number | null;
  perf_1an: number | null;
  perf_3ans: number | null;
  perf_5ans: number | null;
  frais_gestion: number | null;
  sfdr: string | null;
}

function optionalString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function optionalInt(value: unknown): number | null {
  const n = optionalNumber(value);
  if (n == null) return null;
  const rounded = Math.round(n);
  return Number.isFinite(rounded) ? rounded : null;
}

/** Export Cristalliance : performances en décimal (0,0943 = 9,43 %). */
export function normalizeCristalliancePerfPercent(value: unknown): number | null {
  const n = optionalNumber(value);
  if (n == null) return null;
  return n * 100;
}

/** Date série Excel (1900) → timestamp Unix (secondes, UTC). */
export function excelSerialToUnixSeconds(serial: unknown): number | null {
  const n = optionalNumber(serial);
  if (n == null || n <= 0) return null;
  const utcDays = Math.floor(n - 25569);
  return utcDays * 86_400;
}

/**
 * Parse la feuille « Supports » d'un export Cristalliance / contrat AV.
 * Ligne 1 = en-têtes, ligne 2 = sous-en-têtes perf, données à partir de la ligne 3.
 */
export function parseCristallianceSupportsSheetRows(
  rawRows: unknown[][]
): CristallianceSupportsImportRow[] {
  const out: CristallianceSupportsImportRow[] = [];

  for (const row of rawRows.slice(2)) {
    const isin = String(row[0] ?? "")
      .trim()
      .toUpperCase();
    if (!ISIN_RE.test(isin)) continue;

    const nom = String(row[1] ?? "").trim();
    if (!nom) continue;

    out.push({
      isin,
      nom,
      categorie: optionalString(row[6]),
      notation_morningstar: optionalInt(row[7]),
      sri: optionalInt(row[8]),
      vl_previous: optionalNumber(row[30]),
      vl_recent: optionalNumber(row[31]),
      vl_date: excelSerialToUnixSeconds(row[32]),
      perf_5ans: normalizeCristalliancePerfPercent(row[23]),
      perf_3ans: normalizeCristalliancePerfPercent(row[24]),
      perf_1an: normalizeCristalliancePerfPercent(row[25]),
      perf_ytd: normalizeCristalliancePerfPercent(row[26]),
      perf_3mois: normalizeCristalliancePerfPercent(row[27]),
      perf_1mois: normalizeCristalliancePerfPercent(row[28]),
      perf_1semaine: normalizeCristalliancePerfPercent(row[29]),
      frais_gestion: optionalNumber(row[38]),
      sfdr: optionalString(row[60]),
    });
  }

  return out;
}

export function summarizeCristallianceSupportsImport(
  rows: CristallianceSupportsImportRow[]
): { total: number; withVl: number; withPerfYtd: number } {
  return {
    total: rows.length,
    withVl: rows.filter((r) => r.vl_recent != null).length,
    withPerfYtd: rows.filter((r) => r.perf_ytd != null).length,
  };
}
