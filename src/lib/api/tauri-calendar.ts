import { invoke } from "@tauri-apps/api/core";

export interface CalendarEventEntry {
  id: number;
  contact_id: number;
  alerte_id: number | null;
  tache_id: number | null;
  pipe_timeline_entry_id: number | null;
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
  visio_link?: string | null;
  event_location?: string | null;
}

export interface CalendarRdvSyncDetails {
  visio_link?: string | null;
  event_location?: string | null;
}

export interface CalendarSyncResult {
  checked: number;
  accepted: number;
  declined: number;
  cancelled: number;
  errors: string[];
}

export interface GoogleCalendarWeekEvent {
  google_event_id: string;
  title: string;
  start_at: number;
  end_at: number;
  all_day: boolean;
  html_link?: string | null;
  pipe_timeline_entry_id?: number | null;
  pipe_id?: number | null;
}

export interface AgendaGooglePipeSyncResult {
  rescheduled: number;
  cancelled: number;
  /** Entrées timeline RDV reportées côté Google (replanification des rappels email). */
  rescheduled_timeline_entry_ids?: number[];
}

export interface AgendaWeekListResult {
  events: GoogleCalendarWeekEvent[];
  sync: AgendaGooglePipeSyncResult;
}

export async function createCalendarRdv(input: {
  contactId: number;
  alerteId?: number | null;
  tacheId?: number | null;
  pipeTimelineEntryId?: number | null;
  title: string;
  startAt: number;
  endAt: number;
  addGoogleMeet?: boolean;
  visioLink?: string | null;
  eventLocation?: string | null;
  additionalAttendeeContactIds?: number[];
}): Promise<CalendarEventEntry> {
  return invoke<CalendarEventEntry>("create_calendar_rdv", {
    contactId: input.contactId,
    alerteId: input.alerteId ?? null,
    tacheId: input.tacheId ?? null,
    pipeTimelineEntryId: input.pipeTimelineEntryId ?? null,
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    addGoogleMeet: input.addGoogleMeet ?? false,
    visioLink: input.visioLink ?? null,
    eventLocation: input.eventLocation ?? null,
    additionalAttendeeContactIds: input.additionalAttendeeContactIds ?? [],
  });
}

export async function updateCalendarRdv(input: {
  googleEventId: string;
  title: string;
  startAt: number;
  endAt: number;
  addGoogleMeet?: boolean;
  visioLink?: string | null;
  eventLocation?: string | null;
  preserveVisio?: boolean;
  clearVisio?: boolean;
  additionalAttendeeContactIds?: number[];
}): Promise<CalendarRdvSyncDetails> {
  return invoke<CalendarRdvSyncDetails>("update_calendar_rdv", {
    googleEventId: input.googleEventId,
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    addGoogleMeet: input.addGoogleMeet ?? false,
    visioLink: input.visioLink ?? null,
    eventLocation: input.eventLocation ?? null,
    preserveVisio: input.preserveVisio ?? false,
    clearVisio: input.clearVisio ?? false,
    additionalAttendeeContactIds: input.additionalAttendeeContactIds ?? [],
  });
}

export async function cancelCalendarRdv(googleEventId: string): Promise<void> {
  return invoke<void>("cancel_calendar_rdv", { googleEventId });
}

export async function syncCalendarRdv(): Promise<CalendarSyncResult> {
  return invoke<CalendarSyncResult>("sync_calendar_rdv");
}

export async function getCalendarEventsToday(): Promise<CalendarEventEntry[]> {
  return invoke<CalendarEventEntry[]>("get_calendar_events_today");
}

export async function listGoogleCalendarWeek(
  weekStartAt: number,
  options?: { syncPipe?: boolean }
): Promise<AgendaWeekListResult> {
  return invoke<AgendaWeekListResult>("list_google_calendar_week", {
    weekStartAt,
    syncPipe: options?.syncPipe ?? true,
  });
}

export async function syncPipeGoogleRdvs(): Promise<AgendaGooglePipeSyncResult> {
  return invoke<AgendaGooglePipeSyncResult>("sync_pipe_google_rdvs");
}

export async function getPipeRdvCalendarEventForTimeline(
  timelineEntryId: number
): Promise<Pick<CalendarEventEntry, "start_at" | "end_at"> | null> {
  const row = await invoke<CalendarEventEntry | null>(
    "get_pipe_rdv_calendar_event_for_timeline",
    { timelineEntryId }
  );
  if (!row) return null;
  return { start_at: row.start_at, end_at: row.end_at };
}

export async function resolvePipeRdvGoogleEventId(
  timelineEntryId: number
): Promise<string | null> {
  return invoke<string | null>("resolve_pipe_rdv_google_event_id", {
    timelineEntryId,
  });
}

export async function markPipeRdvCalendarCancelled(
  timelineEntryId: number
): Promise<void> {
  return invoke<void>("mark_pipe_rdv_calendar_cancelled", { timelineEntryId });
}

export async function markCalendarRdvEffectue(
  eventId: number,
  contactId: number
): Promise<void> {
  return invoke<void>("mark_calendar_rdv_effectue", { eventId, contactId });
}
