import { invoke } from "@tauri-apps/api/core";

export interface CalendarEventEntry {
  id: number;
  contact_id: number;
  alerte_id: number | null;
  tache_id: number | null;
  google_event_id: string;
  title: string;
  start_at: number;
  end_at: number;
  attendee_email: string | null;
  attendee_status: string | null;
  event_status: string;
  rdv_effectue: boolean;
  created_at: number;
  updated_at: number;
  contact_prenom?: string;
  contact_nom?: string;
}

export interface CalendarSyncResult {
  checked: number;
  accepted: number;
  declined: number;
  cancelled: number;
  errors: string[];
}

export async function createCalendarRdv(input: {
  contactId: number;
  alerteId?: number | null;
  tacheId?: number | null;
  title: string;
  startAt: number;
  endAt: number;
}): Promise<CalendarEventEntry> {
  return invoke<CalendarEventEntry>("create_calendar_rdv", {
    contactId: input.contactId,
    alerteId: input.alerteId ?? null,
    tacheId: input.tacheId ?? null,
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
  });
}

export async function syncCalendarRdv(): Promise<CalendarSyncResult> {
  return invoke<CalendarSyncResult>("sync_calendar_rdv");
}

export async function getCalendarEventsToday(): Promise<CalendarEventEntry[]> {
  return invoke<CalendarEventEntry[]>("get_calendar_events_today");
}

export async function markCalendarRdvEffectue(
  eventId: number,
  contactId: number
): Promise<void> {
  return invoke<void>("mark_calendar_rdv_effectue", { eventId, contactId });
}
