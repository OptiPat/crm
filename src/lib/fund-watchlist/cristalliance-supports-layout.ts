const YEAR_HEADER_RE = /^(19|20)\d{2}$/;

export interface CristallianceAnnualYearColumn {
  year: string;
  index: number;
}

export interface CristallianceSupportsSheetLayout {
  annualYearColumns: CristallianceAnnualYearColumn[];
  perf5ansIndex: number | null;
  perf3ansIndex: number | null;
  perf1anIndex: number | null;
  perfYtdIndex: number | null;
  perf3moisIndex: number | null;
  perf1moisIndex: number | null;
  perf1semaineIndex: number | null;
  vol5ansIndex: number | null;
  vol3ansIndex: number | null;
  vol1anIndex: number | null;
  sharpeIndex: number | null;
  vlPreviousIndex: number | null;
  vlRecentIndex: number | null;
  vlDateIndex: number | null;
  fraisGestionIndex: number | null;
  sfdrIndex: number | null;
}

function headerCellText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeHeaderLabel(value: unknown): string {
  return headerCellText(value).toLowerCase();
}

function findHeaderGroupStart(headerRow: unknown[], label: string): number | null {
  const target = label.toLowerCase();
  const index = headerRow.findIndex((cell) => normalizeHeaderLabel(cell) === target);
  return index >= 0 ? index : null;
}

function findSubHeaderIndexFrom(
  subHeaderRow: unknown[],
  label: string,
  fromIndex = 0
): number | null {
  const target = label.toLowerCase();
  for (let index = fromIndex; index < subHeaderRow.length; index++) {
    if (normalizeHeaderLabel(subHeaderRow[index]) === target) {
      return index;
    }
  }
  return null;
}

/** Colonnes annuelles : suite de libellés AAAA dans la ligne 2 (s'adapte si 2026 remplace 2019). */
export function detectCristallianceAnnualYearColumns(
  subHeaderRow: unknown[]
): CristallianceAnnualYearColumn[] {
  const years: CristallianceAnnualYearColumn[] = [];
  for (let index = 0; index < subHeaderRow.length; index++) {
    const cell = headerCellText(subHeaderRow[index]);
    if (YEAR_HEADER_RE.test(cell)) {
      years.push({ year: cell, index });
      continue;
    }
    if (years.length > 0) {
      break;
    }
  }
  return years;
}

export function detectCristallianceSupportsSheetLayout(
  headerRow: unknown[],
  subHeaderRow: unknown[]
): CristallianceSupportsSheetLayout {
  const glidingStart = findHeaderGroupStart(headerRow, "Performances glissantes");
  const volatilityStart = findHeaderGroupStart(headerRow, "Volatilités");
  const vlStart = findHeaderGroupStart(headerRow, "Dernière VL 2025") ??
    findHeaderGroupStart(headerRow, "Dernière VL 2026") ??
    headerRow.findIndex((cell) => normalizeHeaderLabel(cell).startsWith("dernière vl"));

  return {
    annualYearColumns: detectCristallianceAnnualYearColumns(subHeaderRow),
    perf5ansIndex:
      glidingStart != null ? findSubHeaderIndexFrom(subHeaderRow, "5 ans", glidingStart) : null,
    perf3ansIndex:
      glidingStart != null ? findSubHeaderIndexFrom(subHeaderRow, "3 ans", glidingStart) : null,
    perf1anIndex:
      glidingStart != null ? findSubHeaderIndexFrom(subHeaderRow, "1 an", glidingStart) : null,
    perfYtdIndex:
      glidingStart != null
        ? findSubHeaderIndexFrom(subHeaderRow, "Depuis début année", glidingStart)
        : null,
    perf3moisIndex:
      glidingStart != null ? findSubHeaderIndexFrom(subHeaderRow, "3 mois", glidingStart) : null,
    perf1moisIndex:
      glidingStart != null ? findSubHeaderIndexFrom(subHeaderRow, "1 mois", glidingStart) : null,
    perf1semaineIndex:
      glidingStart != null ? findSubHeaderIndexFrom(subHeaderRow, "1 semaine", glidingStart) : null,
    vol5ansIndex:
      volatilityStart != null
        ? findSubHeaderIndexFrom(subHeaderRow, "5 ans", volatilityStart)
        : null,
    vol3ansIndex:
      volatilityStart != null
        ? findSubHeaderIndexFrom(subHeaderRow, "3 ans", volatilityStart)
        : null,
    vol1anIndex:
      volatilityStart != null
        ? findSubHeaderIndexFrom(subHeaderRow, "1 an", volatilityStart)
        : null,
    sharpeIndex: findHeaderGroupStart(headerRow, "Ratio de Sharpe"),
    vlPreviousIndex: vlStart >= 0 ? vlStart : null,
    vlRecentIndex: vlStart >= 0 ? vlStart + 1 : null,
    vlDateIndex: vlStart >= 0 ? vlStart + 2 : null,
    fraisGestionIndex: findHeaderGroupStart(headerRow, "Frais de gestion"),
    sfdrIndex: findHeaderGroupStart(headerRow, "Classification SFDR"),
  };
}

export function collectCristallianceAnnualYears(
  rows: { perf_annual?: Record<string, number> | null }[]
): string[] {
  const years = new Set<string>();
  for (const row of rows) {
    if (!row.perf_annual) continue;
    for (const year of Object.keys(row.perf_annual)) {
      if (YEAR_HEADER_RE.test(year)) years.add(year);
    }
  }
  return [...years].sort((a, b) => Number(b) - Number(a));
}
