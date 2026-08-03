import {
  detectCristallianceSupportsSheetLayout,
  type CristallianceSupportsSheetLayout,
} from "./cristalliance-supports-layout";

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
  vol_5ans: number | null;
  vol_3ans: number | null;
  vol_1an: number | null;
  sharpe_ratio: number | null;
  perf_annual: Record<string, number> | null;
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

function cellValue(row: unknown[], index: number | null | undefined): unknown {
  if (index == null || index < 0) return null;
  return row[index];
}

/** Export Cristalliance : performances / volatilités en décimal (0,0943 = 9,43 %). */
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

function parseAnnualPerformances(
  row: unknown[],
  layout: CristallianceSupportsSheetLayout
): Record<string, number> | null {
  const annual: Record<string, number> = {};
  for (const { year, index } of layout.annualYearColumns) {
    const value = normalizeCristalliancePerfPercent(cellValue(row, index));
    if (value != null) annual[year] = value;
  }
  return Object.keys(annual).length > 0 ? annual : null;
}

function parseRowWithLayout(
  row: unknown[],
  layout: CristallianceSupportsSheetLayout
): CristallianceSupportsImportRow | null {
  const isin = String(row[0] ?? "")
    .trim()
    .toUpperCase();
  if (!ISIN_RE.test(isin)) return null;

  const nom = String(row[1] ?? "").trim();
  if (!nom) return null;

  return {
    isin,
    nom,
    categorie: optionalString(row[6]),
    notation_morningstar: optionalInt(row[7]),
    sri: optionalInt(row[8]),
    vl_previous: optionalNumber(cellValue(row, layout.vlPreviousIndex)),
    vl_recent: optionalNumber(cellValue(row, layout.vlRecentIndex)),
    vl_date: excelSerialToUnixSeconds(cellValue(row, layout.vlDateIndex)),
    perf_5ans: normalizeCristalliancePerfPercent(cellValue(row, layout.perf5ansIndex)),
    perf_3ans: normalizeCristalliancePerfPercent(cellValue(row, layout.perf3ansIndex)),
    perf_1an: normalizeCristalliancePerfPercent(cellValue(row, layout.perf1anIndex)),
    perf_ytd: normalizeCristalliancePerfPercent(cellValue(row, layout.perfYtdIndex)),
    perf_3mois: normalizeCristalliancePerfPercent(cellValue(row, layout.perf3moisIndex)),
    perf_1mois: normalizeCristalliancePerfPercent(cellValue(row, layout.perf1moisIndex)),
    perf_1semaine: normalizeCristalliancePerfPercent(cellValue(row, layout.perf1semaineIndex)),
    vol_5ans: normalizeCristalliancePerfPercent(cellValue(row, layout.vol5ansIndex)),
    vol_3ans: normalizeCristalliancePerfPercent(cellValue(row, layout.vol3ansIndex)),
    vol_1an: normalizeCristalliancePerfPercent(cellValue(row, layout.vol1anIndex)),
    sharpe_ratio: optionalNumber(cellValue(row, layout.sharpeIndex)),
    perf_annual: parseAnnualPerformances(row, layout),
    frais_gestion: optionalNumber(cellValue(row, layout.fraisGestionIndex)),
    sfdr: optionalString(cellValue(row, layout.sfdrIndex)),
  };
}

/**
 * Parse la feuille « Supports » d'un export Cristalliance / contrat AV.
 * Ligne 1 = en-têtes, ligne 2 = sous-en-têtes perf, données à partir de la ligne 3.
 * Les colonnes annuelles (2019, 2020, …) sont détectées dynamiquement.
 */
export function parseCristallianceSupportsSheetRows(
  rawRows: unknown[][]
): CristallianceSupportsImportRow[] {
  const headerRow = rawRows[0] ?? [];
  const subHeaderRow = rawRows[1] ?? [];
  const layout = detectCristallianceSupportsSheetLayout(headerRow, subHeaderRow);
  const out: CristallianceSupportsImportRow[] = [];

  for (const row of rawRows.slice(2)) {
    const parsed = parseRowWithLayout(row, layout);
    if (parsed) out.push(parsed);
  }

  return out;
}

export function summarizeCristallianceSupportsImport(
  rows: CristallianceSupportsImportRow[]
): {
  total: number;
  withVl: number;
  withPerfYtd: number;
  withSharpe: number;
  annualYears: string[];
} {
  const annualYears = new Set<string>();
  for (const row of rows) {
    if (row.perf_annual) {
      for (const year of Object.keys(row.perf_annual)) annualYears.add(year);
    }
  }
  return {
    total: rows.length,
    withVl: rows.filter((r) => r.vl_recent != null).length,
    withPerfYtd: rows.filter((r) => r.perf_ytd != null).length,
    withSharpe: rows.filter((r) => r.sharpe_ratio != null).length,
    annualYears: [...annualYears].sort((a, b) => Number(b) - Number(a)),
  };
}
