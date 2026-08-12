import { describe, expect, it } from "vitest";
import {
  defaultNextSaturdayDateInput,
  defaultParrainageCallSchedule,
  extractPlannedCallLabelFromTimeline,
  formatParrainageCallScheduleLabel,
  formatParrainageInvitationSummaryFromPipe,
  formatParrainagePresenceConfirmationTaskTitle,
  localDateTimeInputToUnix,
  parrainageInvitationDateToInput,
  parrainagePresenceConfirmationDueUnix,
} from "./parrainage-call-schedule";

describe("parrainage-call-schedule", () => {
  it("defaultParrainageCallSchedule propose demain 18h", () => {
    const { dateInput, timeInput } = defaultParrainageCallSchedule(
      Date.parse("2026-08-07T10:00:00+02:00")
    );
    expect(dateInput).toBe("2026-08-08");
    expect(timeInput).toBe("18:00");
  });

  it("localDateTimeInputToUnix convertit date et heure locales", () => {
    const ts = localDateTimeInputToUnix("2026-08-08", "18:00");
    expect(ts).not.toBeNull();
    const d = new Date((ts ?? 0) * 1000);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(0);
  });

  it("formatParrainageCallScheduleLabel formate en français", () => {
    const label = formatParrainageCallScheduleLabel("2026-08-08", "18:00");
    expect(label).toMatch(/8 août 2026/);
    expect(label).toMatch(/18:00/);
  });

  it("extractPlannedCallLabelFromTimeline lit la ligne Appel planifié", () => {
    const label = extractPlannedCallLabelFromTimeline([
      {
        id: 1,
        parrainage_pipe_id: 1,
        entry_type: "NOTE",
        contenu: "Relance...\n\nAppel planifié : 8 août 2026 à 18:00",
        occurred_at: 1,
        created_at: 1,
      },
    ]);
    expect(label).toBe("8 août 2026 à 18:00");
  });

  it("defaultNextSaturdayDateInput cible le prochain samedi", () => {
    expect(defaultNextSaturdayDateInput(Date.parse("2026-08-12T10:00:00+02:00"))).toBe(
      "2026-08-15"
    );
    expect(defaultNextSaturdayDateInput(Date.parse("2026-08-15T10:00:00+02:00"))).toBe(
      "2026-08-22"
    );
  });

  it("formatParrainageInvitationSummaryFromPipe combine type et date pipe", () => {
    const ts = localDateTimeInputToUnix("2026-08-15", "09:00");
    const summary = formatParrainageInvitationSummaryFromPipe("PO", ts);
    expect(summary).toMatch(/Présentation d'opportunité/);
    expect(summary).toMatch(/15 août 2026/);
  });

  it("parrainageInvitationDateToInput convertit un timestamp", () => {
    const ts = localDateTimeInputToUnix("2026-08-15", "09:00");
    expect(parrainageInvitationDateToInput(ts)).toBe("2026-08-15");
  });

  it("parrainagePresenceConfirmationDueUnix cible la veille à 9h", () => {
    const now = Date.parse("2026-08-12T10:00:00");
    const due = parrainagePresenceConfirmationDueUnix("2026-08-15", now);
    expect(due).not.toBeNull();
    const d = new Date((due ?? 0) * 1000);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(9);
  });

  it("parrainagePresenceConfirmationDueUnix est immédiat si J-1 déjà passé", () => {
    const now = Date.parse("2026-08-14T15:00:00");
    const due = parrainagePresenceConfirmationDueUnix("2026-08-15", now);
    expect(due).not.toBeNull();
    expect((due ?? 0) * 1000).toBeGreaterThan(now);
  });

  it("formatParrainagePresenceConfirmationTaskTitle inclut JD et contact", () => {
    const title = formatParrainagePresenceConfirmationTaskTitle(
      "Jean DUPONT",
      "JD",
      "2026-08-15"
    );
    expect(title).toMatch(/Confirmer la présence de Jean DUPONT/);
    expect(title).toMatch(/à la JD du/);
    expect(title).toMatch(/15 août 2026/);
  });
});
