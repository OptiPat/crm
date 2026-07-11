import { describe, expect, it } from "vitest";
import {
  addWeeks,
  agendaGridHeightPx,
  agendaHourLineTopPx,
  agendaSlotStartUnixFromClick,
  AGENDA_WEEK_SECONDS,
  AGENDA_HOUR_HEIGHT_PX,
  eventDayIndex,
  eventLayoutTopPx,
  startOfWeekMonday,
  weekStartUnix,
} from "@/lib/calendar/agenda-week";
import { eventsOverlap, findAgendaConflicts } from "@/lib/calendar/agenda-conflicts";
import { findNextFreeSlot } from "@/lib/calendar/agenda-free-slot";
import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";

describe("agenda-week", () => {
  it("calcule le lundi 00:00 local", () => {
    const monday = startOfWeekMonday(new Date(2026, 6, 11));
    expect(monday.getDay()).toBe(1);
    expect(monday.getHours()).toBe(0);
  });

  it("navigue entre semaines", () => {
    const w = weekStartUnix(new Date(2026, 6, 11));
    expect(addWeeks(w, 1)).toBe(w + AGENDA_WEEK_SECONDS);
  });

  it("indexe le jour dans la semaine", () => {
    const weekStart = weekStartUnix(new Date(2026, 6, 11));
    const wednesday = weekStart + 2 * 86_400 + 14 * 3600;
    expect(eventDayIndex(wednesday, weekStart)).toBe(2);
  });

  it("convertit un clic grille en créneau 30 min", () => {
    const weekStart = weekStartUnix(new Date(2026, 6, 13));
    const gridHeight = agendaGridHeightPx();
    const startAt = agendaSlotStartUnixFromClick(weekStart, 0, gridHeight / 4, gridHeight);
    const d = new Date(startAt * 1000);
    expect(d.getDay()).toBe(1);
    // 1/4 de la grille 7h–22h ≈ 10h45 → arrondi 30 min → 11h00
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBe(0);
  });

  it("aligne le top d'un événement sur la ligne horaire", () => {
    const weekStart = weekStartUnix(new Date(2026, 6, 6));
    const at11 = weekStart + 11 * 3600;
    expect(eventLayoutTopPx(at11, weekStart, 0)).toBe(agendaHourLineTopPx(4));
    expect(agendaHourLineTopPx(4)).toBe(4 * AGENDA_HOUR_HEIGHT_PX);
  });
});

describe("agenda-conflicts", () => {
  const mk = (start: number, end: number): GoogleCalendarWeekEvent => ({
    google_event_id: "1",
    title: "Réunion",
    start_at: start,
    end_at: end,
    all_day: false,
    html_link: null,
  });

  it("détecte un chevauchement", () => {
    expect(eventsOverlap(100, 200, 150, 250)).toBe(true);
    expect(eventsOverlap(100, 200, 200, 300)).toBe(false);
  });

  it("liste les conflits", () => {
    const conflicts = findAgendaConflicts([mk(100, 200)], 150, 250);
    expect(conflicts).toHaveLength(1);
  });
});

describe("agenda-free-slot", () => {
  it("trouve un créneau libre en journée ouvrée", () => {
    const monday9h = weekStartUnix(new Date(2026, 6, 13)) + 9 * 3600;
    const slot = findNextFreeSlot([], {
      durationSec: 3600,
      fromUnix: monday9h,
      horizonDays: 1,
    });
    expect(slot).not.toBeNull();
    expect(slot!.startAt).toBeGreaterThanOrEqual(monday9h);
    expect(slot!.endAt - slot!.startAt).toBe(3600);
  });
});
