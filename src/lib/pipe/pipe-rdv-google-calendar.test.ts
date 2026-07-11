import { describe, expect, it } from "vitest";
import {
  formatPipeRdvGoogleCalendarTitle,
  isPipeRdvCalendarSyncEligible,
  pipeRdvCalendarEndAt,
  PIPE_RDV_CALENDAR_DURATION_SEC,
} from "@/lib/pipe/pipe-rdv-google-calendar";

describe("formatPipeRdvGoogleCalendarTitle", () => {
  it("formate titre RDV avec contact", () => {
    expect(formatPipeRdvGoogleCalendarTitle("R1", "Jean DUPONT")).toBe(
      "RDV R1 — Jean DUPONT"
    );
  });

  it("ajoute le titre de l'affaire entre parenthèses", () => {
    expect(formatPipeRdvGoogleCalendarTitle("R2", "Jean DUPONT", "Assurance vie")).toBe(
      "RDV R2 — Jean DUPONT (Assurance vie)"
    );
  });
});

describe("pipeRdvCalendarEndAt", () => {
  it("ajoute 1 h par défaut", () => {
    expect(pipeRdvCalendarEndAt(1_700_000_000)).toBe(
      1_700_000_000 + PIPE_RDV_CALENDAR_DURATION_SEC
    );
  });
});

describe("isPipeRdvCalendarSyncEligible", () => {
  it("accepte un RDV strictement dans le futur", () => {
    const now = 1_700_000_000_000;
    expect(isPipeRdvCalendarSyncEligible(1_700_000_001, now)).toBe(true);
  });

  it("refuse un RDV passé ou immédiat", () => {
    const now = 1_700_000_000_000;
    expect(isPipeRdvCalendarSyncEligible(1_700_000_000, now)).toBe(false);
    expect(isPipeRdvCalendarSyncEligible(1_699_999_999, now)).toBe(false);
  });
});
