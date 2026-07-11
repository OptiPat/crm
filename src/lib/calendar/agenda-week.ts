export const AGENDA_WEEK_SECONDS = 7 * 86_400;
export const AGENDA_DAY_SECONDS = 86_400;
export const AGENDA_GRID_START_HOUR = 7;
export const AGENDA_GRID_END_HOUR = 20;
export const AGENDA_HOUR_HEIGHT_PX = 44;

const WEEKDAY_LABELS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."] as const;

export function startOfWeekMonday(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekStartUnix(date: Date = new Date()): number {
  return Math.floor(startOfWeekMonday(date).getTime() / 1000);
}

export function weekKey(weekStartAt: number): string {
  return String(weekStartAt);
}

export function addWeeks(weekStartAt: number, delta: number): number {
  return weekStartAt + delta * AGENDA_WEEK_SECONDS;
}

export function isCurrentWeek(weekStartAt: number, now = new Date()): boolean {
  return weekStartAt === weekStartUnix(now);
}

export function formatAgendaWeekRange(weekStartAt: number): string {
  const start = new Date(weekStartAt * 1000);
  const end = new Date((weekStartAt + AGENDA_WEEK_SECONDS - AGENDA_DAY_SECONDS) * 1000);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
  });
  const endLabel = end.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

export function weekdayLabels(): readonly string[] {
  return WEEKDAY_LABELS;
}

export function dayDateForWeekIndex(weekStartAt: number, dayIndex: number): Date {
  return new Date((weekStartAt + dayIndex * AGENDA_DAY_SECONDS) * 1000);
}

export function formatWeekdayHeader(weekStartAt: number, dayIndex: number): string {
  const d = dayDateForWeekIndex(weekStartAt, dayIndex);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

export function isTodayInWeek(weekStartAt: number, dayIndex: number, now = new Date()): boolean {
  const d = dayDateForWeekIndex(weekStartAt, dayIndex);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function weekStartFromDatetimeLocal(value: string): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return weekStartUnix(date);
}

export function googleCalendarDayUrl(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `https://calendar.google.com/calendar/r/day/${y}/${m}/${d}`;
}

export function hourLabels(): string[] {
  const labels: string[] = [];
  for (let h = AGENDA_GRID_START_HOUR; h < AGENDA_GRID_END_HOUR; h++) {
    labels.push(`${String(h).padStart(2, "0")}:00`);
  }
  return labels;
}

export const AGENDA_GRID_HOUR_COUNT = AGENDA_GRID_END_HOUR - AGENDA_GRID_START_HOUR;

/** Position Y (px) d'une ligne horaire : index 0 = début 7h, index N = fin de grille (20h). */
export function agendaHourLineTopPx(lineIndex: number): number {
  return lineIndex * AGENDA_HOUR_HEIGHT_PX;
}

export function eventDayIndex(startAt: number, weekStartAt: number): number {
  const idx = Math.floor((startAt - weekStartAt) / AGENDA_DAY_SECONDS);
  return Math.max(0, Math.min(6, idx));
}

export function eventLayoutTopPx(startAt: number, weekStartAt: number, dayIndex: number): number {
  const dayStart = (weekStartAt + dayIndex * AGENDA_DAY_SECONDS) * 1000;
  const minutesFromMidnight = (startAt * 1000 - dayStart) / 60_000;
  const minutesFromGridStart = minutesFromMidnight - AGENDA_GRID_START_HOUR * 60;
  const clampedMinutes = Math.max(
    0,
    Math.min(AGENDA_GRID_HOUR_COUNT * 60, minutesFromGridStart)
  );
  return (clampedMinutes / 60) * AGENDA_HOUR_HEIGHT_PX;
}

export function eventLayoutHeightPx(startAt: number, endAt: number): number {
  const minutes = Math.max(15, (endAt - startAt) / 60);
  return Math.max(18, (minutes / 60) * AGENDA_HOUR_HEIGHT_PX);
}

export function agendaGridHeightPx(): number {
  return (AGENDA_GRID_END_HOUR - AGENDA_GRID_START_HOUR) * AGENDA_HOUR_HEIGHT_PX;
}

export const AGENDA_SLOT_SNAP_MINUTES = 30;

/** Convertit un clic vertical dans la colonne jour en horodatage unix (créneau 30 min). */
export function agendaSlotStartUnixFromClick(
  weekStartAt: number,
  dayIndex: number,
  offsetYPx: number,
  gridHeightPx: number,
  snapMinutes = AGENDA_SLOT_SNAP_MINUTES
): number {
  const totalGridMinutes = (AGENDA_GRID_END_HOUR - AGENDA_GRID_START_HOUR) * 60;
  const rawMinutes = (offsetYPx / gridHeightPx) * totalGridMinutes;
  const snapped = Math.round(rawMinutes / snapMinutes) * snapMinutes;
  const clamped = Math.max(0, Math.min(totalGridMinutes - snapMinutes, snapped));
  const dayStartUnix = weekStartAt + dayIndex * AGENDA_DAY_SECONDS;
  return dayStartUnix + AGENDA_GRID_START_HOUR * 3600 + clamped * 60;
}
