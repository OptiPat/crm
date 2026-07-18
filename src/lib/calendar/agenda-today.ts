import type { CalendarEventEntry, GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import { listGoogleCalendarWeek } from "@/lib/api/tauri-calendar";
import { AGENDA_DAY_SECONDS, weekStartUnix } from "@/lib/calendar/agenda-week";
import { excludeAgendaBirthdayEvents } from "@/lib/calendar/agenda-event-filters";

export type AgendaTodayRow =
  | {
      kind: "google";
      key: string;
      sort_at: number;
      google: GoogleCalendarWeekEvent;
      crm?: CalendarEventEntry;
    }
  | {
      kind: "crm_only";
      key: string;
      sort_at: number;
      crm: CalendarEventEntry;
    };

export function buildAgendaTodayRows(
  agendaEvents: GoogleCalendarWeekEvent[],
  crmEvents: CalendarEventEntry[]
): AgendaTodayRow[] {
  const crmByGoogleId = new Map<string, CalendarEventEntry>();
  for (const ev of crmEvents) {
    if (ev.google_event_id) crmByGoogleId.set(ev.google_event_id, ev);
  }

  const googleIds = new Set(agendaEvents.map((e) => e.google_event_id));
  const rows: AgendaTodayRow[] = [];

  for (const google of agendaEvents) {
    const crm = crmByGoogleId.get(google.google_event_id);
    if (crm?.rdv_effectue) continue;
    rows.push({
      kind: "google",
      key: `google-${google.google_event_id}`,
      sort_at: google.start_at,
      google,
      crm,
    });
  }

  for (const crm of crmEvents) {
    if (crm.rdv_effectue) continue;
    if (crm.google_event_id && googleIds.has(crm.google_event_id)) continue;
    rows.push({
      kind: "crm_only",
      key: `crm-${crm.id}`,
      sort_at: crm.start_at,
      crm,
    });
  }

  return rows.sort((a, b) => a.sort_at - b.sort_at);
}

export function todayDayBoundsUnix(now = new Date()): { start: number; end: number } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const start = Math.floor(d.getTime() / 1000);
  return { start, end: start + AGENDA_DAY_SECONDS };
}

export function isAgendaEventOnToday(
  ev: GoogleCalendarWeekEvent,
  now = new Date()
): boolean {
  const { start, end } = todayDayBoundsUnix(now);
  return ev.start_at < end && ev.end_at > start;
}

export function filterAgendaEventsForToday(
  events: GoogleCalendarWeekEvent[],
  now = new Date()
): GoogleCalendarWeekEvent[] {
  return excludeAgendaBirthdayEvents(events.filter((ev) => isAgendaEventOnToday(ev, now))).sort(
    (a, b) => a.start_at - b.start_at || a.title.localeCompare(b.title, "fr")
  );
}

export async function loadAgendaEventsToday(): Promise<GoogleCalendarWeekEvent[]> {
  const weekStart = weekStartUnix();
  const { events } = await listGoogleCalendarWeek(weekStart, { syncPipe: false });
  return filterAgendaEventsForToday(events);
}
