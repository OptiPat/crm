// Fuseau fixé avant tout calcul de date : les tests de changement d'heure en dépendent.
process.env.TZ = "Europe/Paris";

import { describe, expect, it } from "vitest";
import {
  addWeeks,
  agendaGridHeightPx,
  agendaHourLineTopPx,
  agendaGridRangeForEvents,
  agendaSlotStartUnixFromClick,
  AGENDA_WEEK_SECONDS,
  AGENDA_HOUR_HEIGHT_PX,
  eventDayIndex,
  eventLayoutTopPx,
  layoutOverlappingEvents,
  nextFullHourUnix,
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

describe("agenda-week plage horaire", () => {
  const weekStart = weekStartUnix(new Date(2026, 6, 13));
  const at = (day: number, h: number, m = 0) =>
    Math.floor(new Date(2026, 6, 13 + day, h, m).getTime() / 1000);

  it("garde 7h–22h sans RDV hors plage", () => {
    expect(agendaGridRangeForEvents(weekStart, [])).toEqual({ startHour: 7, endHour: 22 });
    expect(
      agendaGridRangeForEvents(weekStart, [{ start_at: at(1, 9), end_at: at(1, 10) }])
    ).toEqual({ startHour: 7, endHour: 22 });
  });

  it("élargit pour un RDV tôt ou tard", () => {
    const range = agendaGridRangeForEvents(weekStart, [
      { start_at: at(0, 6, 30), end_at: at(0, 7, 30) },
      { start_at: at(3, 22, 15), end_at: at(3, 23, 10) },
    ]);
    expect(range).toEqual({ startHour: 6, endHour: 24 });
  });

  it("place un RDV de 6h30 à sa vraie heure dans une grille élargie", () => {
    const range = { startHour: 6, endHour: 22 };
    expect(eventLayoutTopPx(at(0, 6, 30), weekStart, 0, range)).toBe(
      AGENDA_HOUR_HEIGHT_PX / 2
    );
    const clickAt = agendaSlotStartUnixFromClick(
      weekStart,
      0,
      0,
      agendaGridHeightPx(range),
      30,
      range
    );
    expect(new Date(clickAt * 1000).getHours()).toBe(6);
  });

  it("prochaine heure pleine", () => {
    const next = new Date(nextFullHourUnix(new Date(2026, 6, 13, 14, 20)) * 1000);
    expect(next.getHours()).toBe(15);
    expect(next.getMinutes()).toBe(0);
  });
});

describe("agenda-week chevauchements", () => {
  const h = (hours: number) => hours * 3600;

  it("RDV sans chevauchement : une colonne chacun", () => {
    expect(
      layoutOverlappingEvents([
        { start_at: h(9), end_at: h(10) },
        { start_at: h(10), end_at: h(11) },
      ])
    ).toEqual([
      { column: 0, columnCount: 1 },
      { column: 0, columnCount: 1 },
    ]);
  });

  it("deux RDV au même horaire côte à côte", () => {
    expect(
      layoutOverlappingEvents([
        { start_at: h(9), end_at: h(10) },
        { start_at: h(9), end_at: h(10) },
      ])
    ).toEqual([
      { column: 0, columnCount: 2 },
      { column: 1, columnCount: 2 },
    ]);
  });

  it("réutilise une colonne libérée dans le même groupe", () => {
    // A 9–11, B 9h30–10, C 10h–10h30 : C reprend la colonne de B.
    const layout = layoutOverlappingEvents([
      { start_at: h(9), end_at: h(11) },
      { start_at: h(9.5), end_at: h(10) },
      { start_at: h(10), end_at: h(10.5) },
    ]);
    expect(layout.map((l) => l.column)).toEqual([0, 1, 1]);
    expect(layout.every((l) => l.columnCount === 2)).toBe(true);
  });

  it("un RDV très court occupe sa hauteur minimale à l'écran", () => {
    const layout = layoutOverlappingEvents([
      { start_at: h(9), end_at: h(9) + 300 },
      { start_at: h(9) + 600, end_at: h(10) },
    ]);
    expect(layout[1]).toEqual({ column: 1, columnCount: 2 });
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

describe("semaines de changement d'heure (Europe/Paris)", () => {
  it("fuseau effectivement fixé", () => {
    // 1er juillet : UTC+2 ; 1er janvier : UTC+1.
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-60);
  });

  it.each([
    ["fin octobre (passage à l'heure d'hiver)", new Date(2026, 9, 21), 26],
    ["fin mars (passage à l'heure d'été)", new Date(2026, 2, 25), 30],
  ])("%s : la semaine suivante commence le lundi 00:00", (_label, day, nextMondayDate) => {
    const w = weekStartUnix(day);
    const next = new Date(addWeeks(w, 1) * 1000);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(nextMondayDate);
    expect(next.getHours()).toBe(0);
    expect(addWeeks(addWeeks(w, 1), -1)).toBe(w);
  });

  it("fin octobre : un RDV du dimanche 14h est indexé sur dimanche", () => {
    const w = weekStartUnix(new Date(2026, 9, 21));
    const sunday14h = Math.floor(new Date(2026, 9, 25, 14).getTime() / 1000);
    expect(eventDayIndex(sunday14h, w)).toBe(6);
  });
});
