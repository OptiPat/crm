import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";

/** Anniversaires Google Contacts (eventType birthday ou libellé journée entière). */
export function isGoogleCalendarBirthdayEvent(ev: GoogleCalendarWeekEvent): boolean {
  if (ev.event_type === "birthday") return true;
  if (!ev.all_day) return false;
  const title = ev.title.trim().toLowerCase();
  return (
    title.startsWith("anniversaire") ||
    title.endsWith(" birthday") ||
    title.includes("'s birthday")
  );
}

export function excludeAgendaBirthdayEvents(
  events: GoogleCalendarWeekEvent[]
): GoogleCalendarWeekEvent[] {
  return events.filter((ev) => !isGoogleCalendarBirthdayEvent(ev));
}
