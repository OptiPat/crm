import { describe, expect, it } from "vitest";
import {
  defaultParrainageCallSchedule,
  extractPlannedCallLabelFromTimeline,
  formatParrainageCallScheduleLabel,
  localDateTimeInputToUnix,
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
});
