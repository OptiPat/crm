import { describe, expect, it } from "vitest";
import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import {
  excludeAgendaBirthdayEvents,
  isGoogleCalendarBirthdayEvent,
} from "@/lib/calendar/agenda-event-filters";

function mk(partial: Partial<GoogleCalendarWeekEvent>): GoogleCalendarWeekEvent {
  return {
    google_event_id: "1",
    title: "Réunion",
    start_at: 0,
    end_at: 3600,
    all_day: false,
    ...partial,
  };
}

describe("agenda-event-filters", () => {
  it("détecte eventType birthday Google", () => {
    expect(isGoogleCalendarBirthdayEvent(mk({ event_type: "birthday", all_day: true }))).toBe(true);
  });

  it("détecte anniversaire all-day par libellé FR/EN", () => {
    expect(
      isGoogleCalendarBirthdayEvent(mk({ all_day: true, title: "Anniversaire de Jean DUPONT" }))
    ).toBe(true);
    expect(
      isGoogleCalendarBirthdayEvent(mk({ all_day: true, title: "Jean's birthday" }))
    ).toBe(true);
  });

  it("conserve les événements non anniversaire", () => {
    const events = [
      mk({ google_event_id: "a", title: "RDV client" }),
      mk({ google_event_id: "b", all_day: true, title: "Anniversaire de Paul" }),
      mk({ google_event_id: "c", all_day: true, title: "Congés" }),
    ];
    expect(excludeAgendaBirthdayEvents(events).map((e) => e.google_event_id)).toEqual(["a", "c"]);
  });
});
