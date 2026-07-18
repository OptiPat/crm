import { describe, expect, it } from "vitest";
import type { CalendarEventEntry, GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import {
  buildAgendaTodayRows,
  filterAgendaEventsForToday,
  isAgendaEventOnToday,
  todayDayBoundsUnix,
} from "@/lib/calendar/agenda-today";

function mkGoogle(partial: Partial<GoogleCalendarWeekEvent>): GoogleCalendarWeekEvent {
  return {
    google_event_id: "g1",
    title: "Événement",
    start_at: 0,
    end_at: 3600,
    all_day: false,
    ...partial,
  };
}

function mkCrm(partial: Partial<CalendarEventEntry>): CalendarEventEntry {
  return {
    id: 1,
    contact_id: 10,
    alerte_id: null,
    tache_id: null,
    pipe_timeline_entry_id: null,
    google_event_id: "g1",
    title: "RDV CRM",
    start_at: 0,
    end_at: 3600,
    attendee_email: null,
    attendee_status: null,
    event_status: "confirmed",
    rdv_effectue: false,
    created_at: 0,
    updated_at: 0,
    contact_prenom: "Jean",
    contact_nom: "DUPONT",
    ...partial,
  };
}

describe("agenda-today", () => {
  const ref = new Date(2026, 6, 18, 12, 0, 0);
  const { start, end } = todayDayBoundsUnix(ref);

  it("détecte un événement sur la journée", () => {
    expect(isAgendaEventOnToday(mkGoogle({ start_at: start + 3600, end_at: start + 7200 }), ref)).toBe(
      true
    );
    expect(isAgendaEventOnToday(mkGoogle({ start_at: end, end_at: end + 3600 }), ref)).toBe(false);
  });

  it("filtre aujourd'hui sans anniversaires", () => {
    const events = [
      mkGoogle({ google_event_id: "rdv", start_at: start + 10 * 3600, end_at: start + 11 * 3600 }),
      mkGoogle({
        google_event_id: "bday",
        all_day: true,
        title: "Anniversaire de Luc",
        start_at: start,
        end_at: start + 86_400,
      }),
      mkGoogle({
        google_event_id: "other",
        start_at: end + 3600,
        end_at: end + 7200,
      }),
    ];
    expect(filterAgendaEventsForToday(events, ref).map((e) => e.google_event_id)).toEqual(["rdv"]);
  });

  it("fusionne Google et RDV CRM orphelins", () => {
    const rows = buildAgendaTodayRows(
      [mkGoogle({ google_event_id: "g1", start_at: 100 })],
      [
        mkCrm({ id: 1, google_event_id: "g1", start_at: 100 }),
        mkCrm({ id: 2, google_event_id: "g-missing", start_at: 50, contact_prenom: "Luc" }),
      ]
    );
    expect(rows.map((r) => r.key)).toEqual(["crm-2", "google-g1"]);
    expect(rows[1].kind).toBe("google");
    if (rows[1].kind === "google") expect(rows[1].crm?.id).toBe(1);
  });

  it("affiche les RDV CRM seuls si Google vide", () => {
    const rows = buildAgendaTodayRows([], [mkCrm({ id: 3, google_event_id: "", start_at: 200 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("crm_only");
  });

  it("exclut les RDV marqués effectués", () => {
    const rows = buildAgendaTodayRows(
      [mkGoogle({ google_event_id: "g1" })],
      [mkCrm({ google_event_id: "g1", rdv_effectue: true })]
    );
    expect(rows).toHaveLength(0);
  });
});
