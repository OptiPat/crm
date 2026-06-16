import { describe, expect, it } from "vitest";
import {
  daysSinceUnix,
  formatCalendarDateFr,
  frenchDateToIso,
  JOURS_1_AN,
  unixToDateInput,
} from "./calendar-date";

describe("calendar-date", () => {
  it("formate un timestamp en JJ/MM/AAAA UTC", () => {
    const ts = Date.UTC(2024, 9, 10) / 1000;
    expect(formatCalendarDateFr(ts)).toBe("10/10/2024");
    expect(unixToDateInput(ts)).toBe("2024-10-10");
  });

  it("convertit DD/MM/YYYY en minuit UTC sans décalage", () => {
    expect(frenchDateToIso("09/09/1993")).toBe("1993-09-09T00:00:00.000Z");
    const ts = Date.parse("1993-09-09T00:00:00.000Z") / 1000;
    expect(formatCalendarDateFr(ts)).toBe("09/09/1993");
  });

  it("calcule les jours écoulés", () => {
    const now = Date.UTC(2026, 2, 1);
    const ts = Date.UTC(2025, 2, 1) / 1000;
    expect(daysSinceUnix(ts, now)).toBe(JOURS_1_AN);
  });
});
