import { dateInputToUnix, unixToDateInput } from "@/lib/dates/calendar-date";

const DAY_SEC = 86400;

/** Début du jour UTC (secondes), aligné sur le stockage des échéances. */
export function startOfTodayUnix(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000
  );
}

/** Aujourd'hui en `YYYY-MM-DD` (UTC). */
export function dateInputToday(nowMs: number = Date.now()): string {
  return unixToDateInput(startOfTodayUnix(nowMs));
}

/** Ajoute des jours calendaires UTC à une date input (ou à aujourd'hui si vide). */
export function dateInputAddDays(
  fromInput: string | null | undefined,
  days: number,
  nowMs: number = Date.now()
): string {
  const base =
    fromInput && fromInput.trim()
      ? dateInputToUnix(fromInput)
      : startOfTodayUnix(nowMs);
  if (base == null) return dateInputToday(nowMs);
  return unixToDateInput(base + days * DAY_SEC);
}

export const TACHE_DATE_SHORTCUTS = [
  { id: "today", label: "Aujourd'hui", days: 0 },
  { id: "tomorrow", label: "Demain", days: 1 },
  { id: "week", label: "+7 j", days: 7 },
] as const;

export type TacheDateShortcut =
  | (typeof TACHE_DATE_SHORTCUTS)[number]
  | { id: "friday" | "month"; label: string; resolve: (nowMs?: number) => string };

/** Prochain vendredi (UTC calendaire), ou aujourd'hui si déjà vendredi. */
export function dateInputEndOfWeek(nowMs: number = Date.now()): string {
  const d = new Date(startOfTodayUnix(nowMs) * 1000);
  const dow = d.getUTCDay(); // 0=dim … 5=ven
  const daysUntilFriday = (5 - dow + 7) % 7;
  return dateInputAddDays(null, daysUntilFriday, nowMs);
}

/** +30 jours calendaires UTC. */
export function dateInputAddMonth(nowMs: number = Date.now()): string {
  return dateInputAddDays(null, 30, nowMs);
}

export const TACHE_DATE_SHORTCUTS_EXTENDED: TacheDateShortcut[] = [
  ...TACHE_DATE_SHORTCUTS,
  { id: "friday", label: "Vendredi", resolve: dateInputEndOfWeek },
  { id: "month", label: "+1 mois", resolve: dateInputAddMonth },
];

/** Échéance par défaut à la création (demain). */
export function defaultCreateDateEcheance(
  override?: string,
  nowMs: number = Date.now()
): string {
  if (override?.trim()) return override;
  return dateInputAddDays(null, 1, nowMs);
}

/** Priorité suggérée si l'échéance est aujourd'hui. */
export function prioriteForEcheanceDate(
  dateEcheance: string,
  current: "BASSE" | "NORMALE" | "HAUTE",
  nowMs: number = Date.now()
): "BASSE" | "NORMALE" | "HAUTE" {
  if (dateEcheance === dateInputToday(nowMs) && current === "NORMALE") {
    return "HAUTE";
  }
  return current;
}
