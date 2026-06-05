import { describe, expect, it } from "vitest";
import { echeanceLabel, echeanceState } from "@/lib/taches/tache-display";
import { dateInputToUnix } from "@/lib/dates/calendar-date";

const NOW = Date.parse("2026-06-05T10:00:00Z");
const ts = (d: string) => dateInputToUnix(d)!;

describe("echeanceState", () => {
  it("retourne none sans date ou si la tâche est faite", () => {
    expect(echeanceState(null, "A_FAIRE", NOW)).toBe("none");
    expect(echeanceState(ts("2026-06-01"), "FAIT", NOW)).toBe("none");
  });

  it("détecte retard / aujourd'hui / demain / à venir", () => {
    expect(echeanceState(ts("2026-06-04"), "A_FAIRE", NOW)).toBe("overdue");
    expect(echeanceState(ts("2026-06-05"), "A_FAIRE", NOW)).toBe("today");
    expect(echeanceState(ts("2026-06-06"), "A_FAIRE", NOW)).toBe("tomorrow");
    expect(echeanceState(ts("2026-06-20"), "A_FAIRE", NOW)).toBe("upcoming");
  });
});

describe("echeanceLabel", () => {
  it("libellés humains", () => {
    expect(echeanceLabel(null, "A_FAIRE", NOW)).toBe("Sans date");
    expect(echeanceLabel(ts("2026-06-05"), "A_FAIRE", NOW)).toBe("Aujourd'hui");
    expect(echeanceLabel(ts("2026-06-06"), "A_FAIRE", NOW)).toBe("Demain");
    expect(echeanceLabel(ts("2026-06-04"), "A_FAIRE", NOW)).toContain("En retard");
  });
});
