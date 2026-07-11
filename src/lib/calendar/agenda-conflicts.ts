import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";

export function eventsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA;
}

export function findAgendaConflicts(
  events: GoogleCalendarWeekEvent[],
  slotStart: number,
  slotEnd: number
): GoogleCalendarWeekEvent[] {
  return events.filter((ev) => eventsOverlap(ev.start_at, ev.end_at, slotStart, slotEnd));
}

export function formatConflictTime(unix: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unix * 1000));
}
