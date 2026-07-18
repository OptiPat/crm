import { describe, expect, it } from "vitest";
import {
  formatPipeRdvCalendarContactLabel,
  formatPipeRdvGoogleCalendarTitle,
  formatPipeRdvGoogleCalendarTitleFromPlanOption,
  isPipeRdvCalendarSyncEligible,
  pipeRdvCalendarEndAt,
  pipeRdvCalendarEndAtForPlanOption,
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

describe("formatPipeRdvGoogleCalendarTitleFromPlanOption", () => {
  it("formate les préconisations R2", () => {
    expect(formatPipeRdvGoogleCalendarTitleFromPlanOption("R2_PLACEMENT", "TEST test")).toBe(
      "Présentation préconisations - TEST test"
    );
    expect(formatPipeRdvGoogleCalendarTitleFromPlanOption("R2_IMMO", "TEST test")).toBe(
      "Présentation préconisations - TEST test"
    );
  });

  it("formate les concrétisations R3", () => {
    expect(formatPipeRdvGoogleCalendarTitleFromPlanOption("R3_PLACEMENT", "TEST test")).toBe(
      "Concrétisation placements - TEST test"
    );
    expect(formatPipeRdvGoogleCalendarTitleFromPlanOption("R3_IMMO", "TEST test")).toBe(
      "Concrétisation immo - TEST test"
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

describe("pipeRdvCalendarEndAtForPlanOption", () => {
  it("ajoute 90 min pour R3 Immo", () => {
    expect(pipeRdvCalendarEndAtForPlanOption(1_700_000_000, "R3_IMMO")).toBe(
      1_700_000_000 + 90 * 60
    );
  });

  it("ajoute 60 min pour R3 Placements", () => {
    expect(pipeRdvCalendarEndAtForPlanOption(1_700_000_000, "R3_PLACEMENT")).toBe(
      1_700_000_000 + 60 * 60
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
