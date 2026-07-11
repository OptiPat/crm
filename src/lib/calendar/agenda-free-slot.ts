import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import { listGoogleCalendarWeek } from "@/lib/api/tauri-calendar";
import { eventsOverlap } from "@/lib/calendar/agenda-conflicts";
import { AGENDA_DAY_SECONDS, AGENDA_WEEK_SECONDS, weekStartUnix } from "@/lib/calendar/agenda-week";

export interface FreeSlotResult {
  startAt: number;
  endAt: number;
}

function localDayStartUnix(unix: number): number {
  const d = new Date(unix * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function slotIsFree(
  events: GoogleCalendarWeekEvent[],
  startAt: number,
  endAt: number
): boolean {
  return !events.some((ev) => eventsOverlap(ev.start_at, ev.end_at, startAt, endAt));
}

/** Prochain créneau libre (jours ouvrés 9h–18h par défaut). */
export function findNextFreeSlot(
  events: GoogleCalendarWeekEvent[],
  options: {
    durationSec: number;
    fromUnix?: number;
    horizonDays?: number;
    workStartHour?: number;
    workEndHour?: number;
  }
): FreeSlotResult | null {
  const durationSec = options.durationSec;
  const fromUnix = options.fromUnix ?? Math.floor(Date.now() / 1000);
  const horizonDays = options.horizonDays ?? 5;
  const workStartHour = options.workStartHour ?? 9;
  const workEndHour = options.workEndHour ?? 18;

  let cursor = fromUnix;
  const horizonEnd = fromUnix + horizonDays * AGENDA_DAY_SECONDS;

  while (cursor < horizonEnd) {
    const d = new Date(cursor * 1000);
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      const dayStart = localDayStartUnix(cursor);
      for (let hour = workStartHour; hour < workEndHour; hour++) {
        const startAt = dayStart + hour * 3600;
        const endAt = startAt + durationSec;
        if (startAt < fromUnix) continue;
        if (endAt > dayStart + workEndHour * 3600) continue;
        if (slotIsFree(events, startAt, endAt)) {
          return { startAt, endAt };
        }
      }
    }
    cursor = localDayStartUnix(cursor) + AGENDA_DAY_SECONDS;
  }

  return null;
}

function weekStartsCoveringHorizon(fromUnix: number, horizonDays: number): number[] {
  const horizonEnd = fromUnix + horizonDays * AGENDA_DAY_SECONDS;
  const starts = new Set<number>();
  let cursor = weekStartUnix(new Date(fromUnix * 1000));
  while (cursor <= horizonEnd) {
    starts.add(cursor);
    cursor += AGENDA_WEEK_SECONDS;
  }
  starts.add(weekStartUnix(new Date(horizonEnd * 1000)));
  return [...starts];
}

/** Charge les événements Google sur toutes les semaines couvertes par l'horizon. */
export async function loadGoogleEventsForHorizon(
  fromUnix: number,
  horizonDays: number
): Promise<GoogleCalendarWeekEvent[]> {
  const weekStarts = weekStartsCoveringHorizon(fromUnix, horizonDays);
  const results = await Promise.all(
    weekStarts.map((weekStart) =>
      listGoogleCalendarWeek(weekStart, { syncPipe: false }).then((result) => result.events)
    )
  );
  const byId = new Map<string, GoogleCalendarWeekEvent>();
  for (const event of results.flat()) {
    byId.set(event.google_event_id, event);
  }
  return [...byId.values()];
}
