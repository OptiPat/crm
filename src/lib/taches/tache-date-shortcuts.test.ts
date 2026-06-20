import { describe, expect, it } from "vitest";
import {
  dateInputAddMonth,
  dateInputEndOfWeek,
  defaultCreateDateEcheance,
  prioriteForEcheanceDate,
  dateInputToday,
} from "@/lib/taches/tache-date-shortcuts";

const WED = Date.parse("2026-06-03T10:00:00Z"); // mercredi

describe("tache-date-shortcuts extended", () => {
  it("vendredi = prochain vendredi", () => {
    expect(dateInputEndOfWeek(WED)).toBe("2026-06-05");
  });

  it("défaut création = demain", () => {
    expect(defaultCreateDateEcheance(undefined, WED)).toBe("2026-06-04");
  });

  it("priorité haute si échéance aujourd'hui", () => {
    const today = dateInputToday(WED);
    expect(prioriteForEcheanceDate(today, "NORMALE", WED)).toBe("HAUTE");
    expect(prioriteForEcheanceDate("2026-06-04", "NORMALE", WED)).toBe("NORMALE");
  });

  it("+1 mois", () => {
    expect(dateInputAddMonth(WED)).toBe("2026-07-03");
  });
});
