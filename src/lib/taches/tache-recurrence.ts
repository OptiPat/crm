import { dateInputToUnix, formatCalendarDateFr, unixToDateInput } from "@/lib/dates/calendar-date";

const DAY_SEC = 86400;

export type TacheRecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export interface TacheRecurrence {
  freq: TacheRecurrenceFreq;
  /** Tous les N jours / semaines / mois / ans (défaut 1). */
  interval?: number;
  /** Mensuel / annuel : jour du mois (1–31). */
  day_of_month?: number;
  /** Annuel : mois (1–12). */
  month?: number;
  /** Hebdomadaire : 1=lundi … 7=dimanche. */
  weekdays?: number[];
  /** Fin optionnelle (timestamp Unix minuit UTC). */
  until?: number | null;
}

export const TACHE_RECURRENCE_FREQ_OPTIONS: {
  value: TacheRecurrenceFreq;
  label: string;
  intervalUnit: string;
}[] = [
  { value: "daily", label: "Quotidienne", intervalUnit: "jour(s)" },
  { value: "weekly", label: "Hebdomadaire", intervalUnit: "semaine(s)" },
  { value: "monthly", label: "Mensuelle", intervalUnit: "mois" },
  { value: "yearly", label: "Annuelle", intervalUnit: "an(s)" },
];

export const TACHE_WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 7, label: "Dim" },
];

export const TACHE_MONTH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Janvier" },
  { value: 2, label: "Février" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Avril" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juin" },
  { value: 7, label: "Juillet" },
  { value: 8, label: "Août" },
  { value: 9, label: "Septembre" },
  { value: 10, label: "Octobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Décembre" },
];

export function isActiveRecurrence(
  rec: TacheRecurrence | null | undefined
): rec is TacheRecurrence {
  return rec != null && rec.freq != null && rec.freq.length > 0;
}

function utcNaiveDate(ts: number): { y: number; m: number; d: number } {
  const date = new Date(ts * 1000);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
}

function unixFromUtc(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
}

function isoWeekday(ts: number): number {
  const date = new Date(ts * 1000);
  const js = date.getUTCDay(); // 0=dim
  return js === 0 ? 7 : js;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDayInMonth(year: number, month: number, day: number): number {
  return Math.min(Math.max(day, 1), daysInMonth(year, month));
}

function addMonths(year: number, month: number, delta: number): { y: number; m: number } {
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m };
}

function nextDaily(fromTs: number, interval: number): number {
  return fromTs + interval * DAY_SEC;
}

function nextWeekly(
  fromTs: number,
  interval: number,
  weekdays?: number[]
): number | null {
  const step = Math.max(interval, 1);
  if (!weekdays?.length) {
    return fromTs + 7 * step * DAY_SEC;
  }
  if (weekdays.length === 1) {
    const target = Math.min(Math.max(weekdays[0], 1), 7);
    if (isoWeekday(fromTs) === target) {
      return fromTs + 7 * step * DAY_SEC;
    }
    for (let offset = 1; offset <= 370; offset++) {
      const candidate = fromTs + offset * DAY_SEC;
      if (isoWeekday(candidate) === target) return candidate;
    }
    return null;
  }
  const normalized = weekdays.map((d) => Math.min(Math.max(d, 1), 7));
  for (let offset = 1; offset <= 370; offset++) {
    const candidate = fromTs + offset * DAY_SEC;
    if (normalized.includes(isoWeekday(candidate))) return candidate;
  }
  return null;
}

function nextMonthly(fromTs: number, interval: number, dayOfMonth: number): number {
  const { y, m, d } = utcNaiveDate(fromTs);
  const { y: y2, m: m2 } = addMonths(y, m, Math.max(interval, 1));
  const day =
    dayOfMonth > 0 ? clampDayInMonth(y2, m2, dayOfMonth) : d;
  return unixFromUtc(y2, m2, day);
}

function nextYearly(
  fromTs: number,
  interval: number,
  month: number,
  dayOfMonth: number
): number {
  const { y, d } = utcNaiveDate(fromTs);
  const y2 = y + Math.max(interval, 1);
  const mo = Math.min(Math.max(month, 1), 12);
  const day = dayOfMonth > 0 ? clampDayInMonth(y2, mo, dayOfMonth) : d;
  return unixFromUtc(y2, mo, day);
}

/** Prochaine échéance après l'ancre (aligné backend Rust). */
export function nextTacheOccurrence(
  fromTs: number,
  rec: TacheRecurrence
): number | null {
  if (!isActiveRecurrence(rec)) return null;
  const interval = Math.max(rec.interval ?? 1, 1);
  let next: number | null = null;
  switch (rec.freq) {
    case "daily":
      next = nextDaily(fromTs, interval);
      break;
    case "weekly":
      next = nextWeekly(fromTs, interval, rec.weekdays);
      break;
    case "monthly": {
      const anchor = utcNaiveDate(fromTs);
      const dom = rec.day_of_month ?? anchor.d;
      next = nextMonthly(fromTs, interval, dom);
      break;
    }
    case "yearly": {
      const anchor = utcNaiveDate(fromTs);
      const mo = rec.month ?? anchor.m;
      const dom = rec.day_of_month ?? anchor.d;
      next = nextYearly(fromTs, interval, mo, dom);
      break;
    }
    default:
      return null;
  }
  if (next == null) return null;
  if (rec.until != null && next > rec.until) return null;
  return next;
}

/** Règle par défaut à partir de la date d'échéance saisie. */
export function defaultRecurrenceFromEcheance(
  dateEcheance: string
): TacheRecurrence {
  const ts = dateInputToUnix(dateEcheance);
  const anchor = ts != null ? utcNaiveDate(ts) : utcNaiveDate(Math.floor(Date.now() / 1000));
  return {
    freq: "monthly",
    interval: 1,
    day_of_month: anchor.d,
  };
}

export function formatRecurrenceLabel(rec: TacheRecurrence): string {
  const interval = Math.max(rec.interval ?? 1, 1);
  const every =
    interval === 1 ? "" : `Tous les ${interval} `;
  switch (rec.freq) {
    case "daily":
      return interval === 1 ? "Quotidienne" : `${every}jours`;
    case "weekly": {
      const days =
        rec.weekdays?.length
          ? rec.weekdays
              .map((d) => TACHE_WEEKDAY_OPTIONS.find((o) => o.value === d)?.label ?? "?")
              .join(", ")
          : "semaine";
      return interval === 1
        ? `Hebdo · ${days}`
        : `${every}sem. · ${days}`;
    }
    case "monthly": {
      const dom = rec.day_of_month ?? 1;
      return interval === 1
        ? `Mensuelle · le ${dom}`
        : `${every}mois · le ${dom}`;
    }
    case "yearly": {
      const mo =
        TACHE_MONTH_OPTIONS.find((o) => o.value === rec.month)?.label ?? "?";
      const dom = rec.day_of_month ?? 1;
      return interval === 1
        ? `Annuelle · ${dom} ${mo}`
        : `${every}ans · ${dom} ${mo}`;
    }
    default:
      return "Récurrente";
  }
}

export function formatNextOccurrencePreview(
  dateEcheance: string,
  rec: TacheRecurrence | null
): string | null {
  if (!rec || !isActiveRecurrence(rec)) return null;
  const anchor = dateInputToUnix(dateEcheance);
  if (anchor == null) return null;
  const next = nextTacheOccurrence(anchor, rec);
  if (next == null) return "Fin de récurrence atteinte";
  return `Après validation : ${formatCalendarDateFr(next)}`;
}

export function isoWeekdayFromDateInput(dateInput: string): number {
  const ts = dateInputToUnix(dateInput);
  if (ts == null) return 1;
  return isoWeekday(ts);
}

export function dayOfMonthFromDateInput(dateInput: string): number | null {
  const ts = dateInputToUnix(dateInput);
  if (ts == null) return null;
  return utcNaiveDate(ts).d;
}

export interface RecurrenceEcheanceMismatch {
  message: string;
  alignedDate: string;
  alignedLabel: string;
}

/** Première échéance incohérente avec la règle (ex. le 23 vs « le 1 du mois »). */
export function detectRecurrenceEcheanceMismatch(
  dateEcheance: string,
  rec: TacheRecurrence | null,
  recurrenceEnabled: boolean
): RecurrenceEcheanceMismatch | null {
  if (!recurrenceEnabled || !rec || !isActiveRecurrence(rec)) return null;
  const ts = dateInputToUnix(dateEcheance);
  if (ts == null) return null;

  const alignedDate = alignEcheanceToRecurrence(dateEcheance, rec);
  if (alignedDate === dateEcheance) return null;

  const alignedLabel = formatCalendarDateFr(dateInputToUnix(alignedDate)!);

  switch (rec.freq) {
    case "monthly": {
      const dom = rec.day_of_month ?? dayOfMonthFromDateInput(dateEcheance) ?? 1;
      const currentDom = dayOfMonthFromDateInput(dateEcheance);
      return {
        message: `La première échéance est le ${currentDom}, alors que la série est calée sur le ${dom} de chaque mois.`,
        alignedDate,
        alignedLabel,
      };
    }
    case "yearly": {
      const mo =
        TACHE_MONTH_OPTIONS.find((o) => o.value === rec.month)?.label ?? "?";
      const dom = rec.day_of_month ?? 1;
      return {
        message: `La première échéance ne correspond pas au ${dom} ${mo} de la série annuelle.`,
        alignedDate,
        alignedLabel,
      };
    }
    case "weekly": {
      if (!rec.weekdays?.length) return null;
      const labels = rec.weekdays
        .map((d) => TACHE_WEEKDAY_OPTIONS.find((o) => o.value === d)?.label ?? "?")
        .join(", ");
      return {
        message: `La première échéance n'est pas un ${labels}.`,
        alignedDate,
        alignedLabel,
      };
    }
    default:
      return null;
  }
}

/** Prochaine date calée sur la règle, à partir de la première échéance saisie. */
export function alignEcheanceToRecurrence(
  dateEcheance: string,
  rec: TacheRecurrence
): string {
  const fromTs = dateInputToUnix(dateEcheance);
  if (fromTs == null) return dateEcheance;

  switch (rec.freq) {
    case "monthly": {
      const dom = rec.day_of_month ?? utcNaiveDate(fromTs).d;
      return nextMonthlyDomOnOrAfter(dateEcheance, dom);
    }
    case "yearly": {
      const month = rec.month ?? utcNaiveDate(fromTs).m;
      const dom = rec.day_of_month ?? utcNaiveDate(fromTs).d;
      return nextYearlyOnOrAfter(dateEcheance, month, dom);
    }
    case "weekly": {
      const weekdays = rec.weekdays?.length
        ? rec.weekdays
        : [isoWeekday(fromTs)];
      return nextWeekdayOnOrAfter(dateEcheance, weekdays);
    }
    default:
      return dateEcheance;
  }
}

function monthlyDomTs(year: number, month: number, dayOfMonth: number): number {
  const d = clampDayInMonth(year, month, dayOfMonth);
  return unixFromUtc(year, month, d);
}

function nextMonthlyDomOnOrAfter(dateInput: string, dayOfMonth: number): string {
  const fromTs = dateInputToUnix(dateInput);
  if (fromTs == null) return dateInput;
  const anchor = utcNaiveDate(fromTs);
  let candidate = monthlyDomTs(anchor.y, anchor.m, dayOfMonth);
  if (candidate >= fromTs) return unixToDateInput(candidate);
  const { y, m } = addMonths(anchor.y, anchor.m, 1);
  return unixToDateInput(monthlyDomTs(y, m, dayOfMonth));
}

function nextYearlyOnOrAfter(
  dateInput: string,
  month: number,
  dayOfMonth: number
): string {
  const fromTs = dateInputToUnix(dateInput);
  if (fromTs == null) return dateInput;
  const anchor = utcNaiveDate(fromTs);
  const mo = Math.min(Math.max(month, 1), 12);
  let candidate = monthlyDomTs(anchor.y, mo, dayOfMonth);
  if (candidate >= fromTs) return unixToDateInput(candidate);
  return unixToDateInput(monthlyDomTs(anchor.y + 1, mo, dayOfMonth));
}

function nextWeekdayOnOrAfter(dateInput: string, weekdays: number[]): string {
  const fromTs = dateInputToUnix(dateInput);
  if (fromTs == null) return dateInput;
  const normalized = [...new Set(weekdays.map((d) => Math.min(Math.max(d, 1), 7)))].sort(
    (a, b) => a - b
  );
  if (normalized.includes(isoWeekday(fromTs))) return dateInput;
  for (let offset = 1; offset <= 370; offset++) {
    const candidate = fromTs + offset * DAY_SEC;
    if (normalized.includes(isoWeekday(candidate))) {
      return unixToDateInput(candidate);
    }
  }
  return dateInput;
}
