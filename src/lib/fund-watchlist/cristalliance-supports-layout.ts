const YEAR_HEADER_RE = /^(19|20)\d{2}$/;
const ANNUAL_PREFIX_RE = /^performances annuelles\s+((?:19|20)\d{2})$/;
const VL_YEAR_RE = /^dernière vl ((?:19|20)\d{2})$/;

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

function yearFromHeaderCell(value: unknown): string | null {
  const cell = headerCellText(value);
  if (YEAR_HEADER_RE.test(cell)) return cell;
  const prefixed = ANNUAL_PREFIX_RE.exec(normalizeHeaderLabel(cell));
  return prefixed?.[1] ?? null;
}

/** Colonnes annuelles : suite AAAA ou « Performances annuelles 2024 » (s'adapte si 2026 remplace 2019). */
export function detectCristallianceAnnualYearColumns(
  subHeaderRow: unknown[]
): CristallianceAnnualYearColumn[] {
  const years: CristallianceAnnualYearColumn[] = [];
  for (let index = 0; index < subHeaderRow.length; index++) {
    const year = yearFromHeaderCell(subHeaderRow[index]);
    if (year) {
      years.push({ year, index });
      continue;
    }
    if (years.length > 0) {
      break;
    }
  }
  return years;
}

/** Export plat : libellés complets (« Performances glissantes 5 ans ») sur une seule ligne. */
export function isCristallianceFlatHeaderRow(row: unknown[]): boolean {
  return row.some((cell) => {
    const label = normalizeHeaderLabel(cell);
    return (
      ANNUAL_PREFIX_RE.test(label) ||
      label.startsWith("performances glissantes ") ||
      /^volatilités \d/.test(label)
    );
  });
}

function detectCristallianceVlColumns(labelRow: unknown[]): {
  vlPreviousIndex: number | null;
  vlRecentIndex: number | null;
  vlDateIndex: number | null;
} {
  const vlYears: { year: number; index: number }[] = [];
  for (let index = 0; index < labelRow.length; index++) {
    const match = VL_YEAR_RE.exec(normalizeHeaderLabel(labelRow[index]));
    if (match) vlYears.push({ year: Number(match[1]), index });
  }
  vlYears.sort((a, b) => a.year - b.year);
  const dateIndex = labelRow.findIndex((cell) =>
    normalizeHeaderLabel(cell).startsWith("date dernière vl")
  );
  return {
    vlPreviousIndex: vlYears.length >= 2 ? (vlYears[0]?.index ?? null) : null,
    vlRecentIndex: vlYears.length > 0 ? (vlYears[vlYears.length - 1]?.index ?? null) : null,
    vlDateIndex: dateIndex >= 0 ? dateIndex : null,
  };
}

function detectCristallianceFlatSheetLayout(
  labelRow: unknown[]
): CristallianceSupportsSheetLayout {
  return {
    annualYearColumns: detectCristallianceAnnualYearColumns(labelRow),
    perf5ansIndex: findHeaderGroupStart(labelRow, "Performances glissantes 5 ans"),
    perf3ansIndex: findHeaderGroupStart(labelRow, "Performances glissantes 3 ans"),
    perf1anIndex: findHeaderGroupStart(labelRow, "Performances glissantes 1 an"),
    perfYtdIndex: findHeaderGroupStart(labelRow, "Performances glissantes Depuis début année"),
    perf3moisIndex: findHeaderGroupStart(labelRow, "Performances glissantes 3 mois"),
    perf1moisIndex: findHeaderGroupStart(labelRow, "Performances glissantes 1 mois"),
    perf1semaineIndex: findHeaderGroupStart(labelRow, "Performances glissantes 1 semaine"),
    vol5ansIndex: findHeaderGroupStart(labelRow, "Volatilités 5 ans"),
    vol3ansIndex: findHeaderGroupStart(labelRow, "Volatilités 3 ans"),
    vol1anIndex: findHeaderGroupStart(labelRow, "Volatilités 1 an"),
    sharpeIndex: findHeaderGroupStart(labelRow, "Ratio de Sharpe"),
    ...detectCristallianceVlColumns(labelRow),
    fraisGestionIndex: findHeaderGroupStart(labelRow, "Frais de gestion"),
    sfdrIndex: findHeaderGroupStart(labelRow, "Classification SFDR"),
  };
}

export function detectCristallianceSupportsSheetLayout(
  headerRow: unknown[],
  subHeaderRow: unknown[]
): CristallianceSupportsSheetLayout {
  if (isCristallianceFlatHeaderRow(subHeaderRow)) {
    return detectCristallianceFlatSheetLayout(subHeaderRow);
  }
  if (isCristallianceFlatHeaderRow(headerRow)) {
    return detectCristallianceFlatSheetLayout(headerRow);
  }

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

/** Feuille Supports (ancien) ou Catalogue (export plat 2026). */
export function pickCristallianceSupportsSheetName(names: string[]): string | undefined {
  const supports = names.find((name) => name.toLowerCase() === "supports");
  if (supports) return supports;
  const catalogue = names.find((name) => name.toLowerCase() === "catalogue");
  if (catalogue) return catalogue;
  return names[0];
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
