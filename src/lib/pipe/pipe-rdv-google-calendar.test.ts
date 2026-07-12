import { describe, expect, it } from "vitest";
import {
  formatPipeRdvCalendarContactLabel,
  formatPipeRdvGoogleCalendarTitle,
  isPipeRdvCalendarSyncEligible,
  pipeRdvCalendarEndAt,
  PIPE_RDV_CALENDAR_DURATION_SEC,
} from "@/lib/pipe/pipe-rdv-google-calendar";

describe("formatPipeRdvCalendarContactLabel", () => {
  it("affiche nom puis prénom", () => {
    expect(
      formatPipeRdvCalendarContactLabel({
        contact_nom: "DUPONT",
        contact_prenom: "Jean",
      })
    ).toBe("DUPONT Jean");
  });

  it("affiche un couple", () => {
    expect(
      formatPipeRdvCalendarContactLabel({
        contact_nom: "DUPONT",
        contact_prenom: "Jean",
        secondary_contact_id: 2,
        secondary_contact_nom: "MARTIN",
        secondary_contact_prenom: "Marie",
      })
    ).toBe("DUPONT Jean & MARTIN Marie");
  });
});

describe("formatPipeRdvGoogleCalendarTitle", () => {
  it("formate R1 sans titre d'affaire", () => {
    expect(formatPipeRdvGoogleCalendarTitle("R1", "DUPONT Jean")).toBe(
      "Premier rendez-vous patrimonial - DUPONT Jean"
    );
  });

  it("formate R2 et R3 avec le même libellé métier", () => {
    expect(formatPipeRdvGoogleCalendarTitle("R2", "DUPONT Jean")).toBe(
      "Présentation des solutions patrimoniales - DUPONT Jean"
    );
    expect(formatPipeRdvGoogleCalendarTitle("R3", "DUPONT Jean")).toBe(
      "Présentation des solutions patrimoniales - DUPONT Jean"
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
