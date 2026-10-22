export const AGENDA_WEEK_SECONDS = 7 * 86_400;
export const AGENDA_DAY_SECONDS = 86_400;
export const AGENDA_GRID_START_HOUR = 7;
export const AGENDA_GRID_END_HOUR = 22;
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

/** Lundi 00:00 local décalé de `delta` semaines (une semaine de changement d'heure ne dure pas 7 × 24 h). */
export function addWeeks(weekStartAt: number, delta: number): number {
  const d = new Date(weekStartAt * 1000);
  d.setDate(d.getDate() + delta * 7);
  return weekStartUnix(d);
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

/** Plage horaire affichée (heures locales, fin exclue). Par défaut 7h–22h, élargie si des RDV débordent. */
export interface AgendaGridRange {
  startHour: number;
  endHour: number;
}

export const DEFAULT_AGENDA_GRID_RANGE: AgendaGridRange = {
  startHour: AGENDA_GRID_START_HOUR,
  endHour: AGENDA_GRID_END_HOUR,
};

export const AGENDA_GRID_HOUR_COUNT = AGENDA_GRID_END_HOUR - AGENDA_GRID_START_HOUR;

export function agendaGridHourCount(range: AgendaGridRange = DEFAULT_AGENDA_GRID_RANGE): number {
  return range.endHour - range.startHour;
}

export function hourLabels(range: AgendaGridRange = DEFAULT_AGENDA_GRID_RANGE): string[] {
  const labels: string[] = [];
  for (let h = range.startHour; h < range.endHour; h++) {
    labels.push(`${String(h).padStart(2, "0")}:00`);
  }
  return labels;
}

/** Position Y (px) d'une ligne horaire : index 0 = début de grille. */
export function agendaHourLineTopPx(lineIndex: number): number {
  return lineIndex * AGENDA_HOUR_HEIGHT_PX;
}

export function eventDayIndex(startAt: number, weekStartAt: number): number {
  const idx = Math.floor((startAt - weekStartAt) / AGENDA_DAY_SECONDS);
  return Math.max(0, Math.min(6, idx));
}

function localDayStart(weekStartAt: number, dayIndex: number): Date {
  const d = new Date(weekStartAt * 1000);
  d.setDate(d.getDate() + dayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Minutes depuis minuit local du jour `dayIndex` (heure murale, robuste au changement d'heure). */
function minutesFromLocalDayStart(unix: number, weekStartAt: number, dayIndex: number): number {
  const day = localDayStart(weekStartAt, dayIndex);
  const d = new Date(unix * 1000);
  if (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  ) {
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }
  return (unix * 1000 - day.getTime()) / 60_000;
}

/**
 * Plage horaire couvrant les RDV de la semaine : 7h–22h, élargie à l'heure pleine
 * pour un RDV commençant plus tôt ou finissant plus tard (bornée à 0h–24h).
 */
export function agendaGridRangeForEvents(
  weekStartAt: number,
  events: readonly { start_at: number; end_at: number }[]
): AgendaGridRange {
  let startHour = AGENDA_GRID_START_HOUR;
  let endHour = AGENDA_GRID_END_HOUR;
  for (const ev of events) {
    const dayIndex = eventDayIndex(ev.start_at, weekStartAt);
    const startMin = minutesFromLocalDayStart(ev.start_at, weekStartAt, dayIndex);
    if (startMin < 0 || startMin >= 24 * 60) continue;
    const endMin = Math.min(
      24 * 60,
      Math.max(startMin, minutesFromLocalDayStart(ev.end_at, weekStartAt, dayIndex))
    );
    startHour = Math.min(startHour, Math.floor(startMin / 60));
    endHour = Math.max(endHour, Math.ceil(endMin / 60));
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) };
}

export function eventLayoutTopPx(
  startAt: number,
  weekStartAt: number,
  dayIndex: number,
  range: AgendaGridRange = DEFAULT_AGENDA_GRID_RANGE
): number {
  const minutesFromGridStart =
    minutesFromLocalDayStart(startAt, weekStartAt, dayIndex) - range.startHour * 60;
  const clampedMinutes = Math.max(
    0,
    Math.min(agendaGridHourCount(range) * 60, minutesFromGridStart)
  );
  return (clampedMinutes / 60) * AGENDA_HOUR_HEIGHT_PX;
}

export const AGENDA_EVENT_MIN_HEIGHT_PX = 18;

export function eventLayoutHeightPx(startAt: number, endAt: number): number {
  const minutes = Math.max(15, (endAt - startAt) / 60);
  return Math.max(AGENDA_EVENT_MIN_HEIGHT_PX, (minutes / 60) * AGENDA_HOUR_HEIGHT_PX);
}

export function agendaGridHeightPx(range: AgendaGridRange = DEFAULT_AGENDA_GRID_RANGE): number {
  return agendaGridHourCount(range) * AGENDA_HOUR_HEIGHT_PX;
}

export interface AgendaEventColumnLayout {
  /** Colonne (0 = gauche) dans le groupe de RDV qui se chevauchent. */
  column: number;
  /** Nombre de colonnes du groupe. */
  columnCount: number;
}

/**
 * Place côte à côte les RDV d'un même jour qui se chevauchent à l'écran
 * (durée affichée minimale incluse). Renvoie une entrée par RDV, dans l'ordre reçu.
 */
export function layoutOverlappingEvents(
  events: readonly { start_at: number; end_at: number }[]
): AgendaEventColumnLayout[] {
  const minVisibleSec = Math.ceil((AGENDA_EVENT_MIN_HEIGHT_PX / AGENDA_HOUR_HEIGHT_PX) * 3600);
  const visualEnd = (ev: { start_at: number; end_at: number }) =>
    Math.max(ev.end_at, ev.start_at + Math.max(15 * 60, minVisibleSec));
  const order = events
    .map((ev, index) => ({ index, start: ev.start_at, end: visualEnd(ev) }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index);

  const result: AgendaEventColumnLayout[] = events.map(() => ({ column: 0, columnCount: 1 }));
  let cluster: number[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const index of cluster) result[index].columnCount = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };

  for (const item of order) {
    if (item.start >= clusterEnd) closeCluster();
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column < 0) {
      column = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[column] = item.end;
    }
    result[item.index].column = column;
    cluster.push(item.index);
    clusterEnd = cluster.length === 1 ? item.end : Math.max(clusterEnd, item.end);
  }
  closeCluster();
  return result;
}

export const AGENDA_SLOT_SNAP_MINUTES = 30;

/** Convertit un clic vertical dans la colonne jour en horodatage unix (créneau 30 min). */
export function agendaSlotStartUnixFromClick(
  weekStartAt: number,
  dayIndex: number,
  offsetYPx: number,
  gridHeightPx: number,
  snapMinutes = AGENDA_SLOT_SNAP_MINUTES,
  range: AgendaGridRange = DEFAULT_AGENDA_GRID_RANGE
): number {
  const totalGridMinutes = agendaGridHourCount(range) * 60;
  const rawMinutes = (offsetYPx / gridHeightPx) * totalGridMinutes;
  const snapped = Math.round(rawMinutes / snapMinutes) * snapMinutes;
  const clamped = Math.max(0, Math.min(totalGridMinutes - snapMinutes, snapped));
  const slot = localDayStart(weekStartAt, dayIndex);
  slot.setHours(range.startHour, clamped, 0, 0);
  return Math.floor(slot.getTime() / 1000);
}

/** Prochaine heure pleine (ex. 14h20 → 15h00), en unix. */
export function nextFullHourUnix(now: Date = new Date()): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return Math.floor(d.getTime() / 1000);
}
