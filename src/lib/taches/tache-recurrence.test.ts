import { describe, expect, it } from "vitest";
import {
  nextTacheOccurrence,
  alignEcheanceToRecurrence,
  detectRecurrenceEcheanceMismatch,
  type TacheRecurrence,
} from "@/lib/taches/tache-recurrence";

function ts(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
}

describe("nextTacheOccurrence", () => {
  it("mensuelle le 2 avance au mois suivant", () => {
    const rec: TacheRecurrence = {
      freq: "monthly",
      interval: 1,
      day_of_month: 2,
    };
    expect(nextTacheOccurrence(ts(2026, 3, 2), rec)).toBe(ts(2026, 4, 2));
  });

  it("jour 31 réduit en février", () => {
    const rec: TacheRecurrence = {
      freq: "monthly",
      interval: 1,
      day_of_month: 31,
    };
    expect(nextTacheOccurrence(ts(2026, 1, 31), rec)).toBe(ts(2026, 2, 28));
  });

  it("hebdo lun/ven", () => {
    const rec: TacheRecurrence = {
      freq: "weekly",
      interval: 1,
      weekdays: [1, 5],
    };
    expect(nextTacheOccurrence(ts(2026, 6, 1), rec)).toBe(ts(2026, 6, 5));
  });
});

describe("alignEcheanceToRecurrence", () => {
  it("mensuelle le 1 depuis le 23 juin → 1er juillet", () => {
    const rec: TacheRecurrence = { freq: "monthly", interval: 1, day_of_month: 1 };
    expect(alignEcheanceToRecurrence("2026-06-23", rec)).toBe("2026-07-01");
  });

  it("mensuelle le 1 depuis le 1er juin → inchangé", () => {
    const rec: TacheRecurrence = { freq: "monthly", interval: 1, day_of_month: 1 };
    expect(alignEcheanceToRecurrence("2026-06-01", rec)).toBe("2026-06-01");
  });
});

describe("detectRecurrenceEcheanceMismatch", () => {
  it("signale écart jour du mois", () => {
    const rec: TacheRecurrence = { freq: "monthly", interval: 1, day_of_month: 1 };
    const mismatch = detectRecurrenceEcheanceMismatch("2026-06-23", rec, true);
    expect(mismatch).not.toBeNull();
    expect(mismatch?.alignedDate).toBe("2026-07-01");
  });

  it("rien si déjà aligné", () => {
    const rec: TacheRecurrence = { freq: "monthly", interval: 1, day_of_month: 1 };
    expect(detectRecurrenceEcheanceMismatch("2026-07-01", rec, true)).toBeNull();
  });
});
