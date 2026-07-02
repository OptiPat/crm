import { dateInputToUnix, formatCalendarDateFr } from "@/lib/dates/calendar-date";

/** Granularité des buckets du graphique activité (auto selon la plage). */
export type DashboardPeriodGranularity = "year" | "month" | "day";

export interface DashboardDateRangeFilter {
  /** Début inclusif YYYY-MM-DD. */
  from: string;
  /** Fin inclusive YYYY-MM-DD. */
  to: string;
}

export interface DashboardPeriodRange {
  start: number;
  end: number;
  label: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoToDayStart(iso: string): number {
  const start = dateInputToUnix(iso);
  if (start === null) throw new Error("Date invalide");
  return start;
}

function isoToDayEnd(iso: string): number {
  return isoToDayStart(iso) + 86399;
}

function formatIsoDateUtc(reference: Date): string {
  return `${reference.getUTCFullYear()}-${pad2(reference.getUTCMonth() + 1)}-${pad2(reference.getUTCDate())}`;
}

/** Début de journée UTC → unix (secondes), aligné sur `dateInputToUnix`. */
export function localDayStartUnix(year: number, month: number, day: number): number {
  return isoToDayStart(`${year}-${pad2(month)}-${pad2(day)}`);
}

/** Fin de journée UTC → unix (secondes). */
export function localDayEndUnix(year: number, month: number, day: number): number {
  return isoToDayEnd(`${year}-${pad2(month)}-${pad2(day)}`);
}

/** Plage par défaut : 6 ans glissants jusqu'à aujourd'hui. */
export function defaultDashboardDateRangeFilter(
  reference: Date = new Date()
): DashboardDateRangeFilter {
  const to = formatIsoDateUtc(reference);
  const fromDate = new Date(reference);
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 6);
  return { from: formatIsoDateUtc(fromDate), to };
}

export function normalizeDateRange(
  filter: DashboardDateRangeFilter,
  reference: Date = new Date()
): DashboardDateRangeFilter {
  const fallback = defaultDashboardDateRangeFilter(reference);
  const fromValid = /^\d{4}-\d{2}-\d{2}$/.test(filter.from);
  const toValid = /^\d{4}-\d{2}-\d{2}$/.test(filter.to);

  if (!fromValid && !toValid) return fallback;
  if (fromValid && !toValid) return { from: filter.from, to: filter.from };
  if (!fromValid && toValid) return { from: filter.to, to: filter.to };

  let from = filter.from;
  let to = filter.to;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export function formatDashboardPeriodLabel(from: string, to: string): string {
  const fromTs = dateInputToUnix(from);
  const toTs = dateInputToUnix(to);
  if (fromTs === null || toTs === null) return "Période";
  return `Vue du ${formatCalendarDateFr(fromTs)} au ${formatCalendarDateFr(toTs)}`;
}

export function resolveDashboardDateRange(
  filter: DashboardDateRangeFilter
): DashboardPeriodRange {
  const { from, to } = normalizeDateRange(filter);
  return {
    start: isoToDayStart(from),
    end: isoToDayEnd(to),
    label: formatDashboardPeriodLabel(from, to),
  };
}

/** Choix automatique du regroupement graphique selon la durée de la plage. */
export function activityBucketGranularity(
  from: string,
  to: string
): DashboardPeriodGranularity {
  const start = dateInputToUnix(from);
  const end = dateInputToUnix(to);
  if (start === null || end === null) return "month";
  const days = Math.floor((end - start) / 86400) + 1;
  if (days <= 45) return "day";
  if (days <= 400) return "month";
  return "year";
}

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Libellé lisible pour un bucket activité renvoyé par le backend. */
export function formatActivityBucketLabel(
  rawLabel: string,
  bucketGranularity: DashboardPeriodGranularity
): string {
  if (bucketGranularity === "year") return rawLabel;
  const monthMatch = rawLabel.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch && bucketGranularity === "month") {
    const year = monthMatch[1];
    const month = Number.parseInt(monthMatch[2], 10);
    const monthName = MONTH_NAMES[month - 1] ?? monthMatch[2];
    return `${monthName} ${year}`;
  }
  const dayMatch = rawLabel.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch && bucketGranularity === "day") {
    const year = dayMatch[1];
    const day = Number.parseInt(dayMatch[3], 10);
    const month = Number.parseInt(dayMatch[2], 10);
    const monthName = MONTH_NAMES[month - 1] ?? dayMatch[2];
    return `${day} ${monthName} ${year}`;
  }
  return rawLabel;
}

export function activityChartTitle(bucket: DashboardPeriodGranularity): string {
  if (bucket === "year") return "Activité par année";
  if (bucket === "month") return "Activité par mois";
  return "Activité par jour";
}

/** @deprecated Utiliser `DashboardDateRangeFilter`. */
export type DashboardPeriodFilter = DashboardDateRangeFilter;

/** @deprecated Utiliser `defaultDashboardDateRangeFilter`. */
export const defaultDashboardPeriodFilter = defaultDashboardDateRangeFilter;

/** @deprecated Utiliser `resolveDashboardDateRange`. */
export const resolveDashboardPeriodRange = resolveDashboardDateRange;
