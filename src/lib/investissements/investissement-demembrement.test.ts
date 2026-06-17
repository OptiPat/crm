import { describe, expect, it } from "vitest";
import {
  addYearsToDateInput,
  detectDemembrementKind,
  formatDemembrementDureeLabel,
  parseDemembrementDuree,
  parseModeDetention,
  stripDemembrementDureeFromNotes,
  stripStructuredDemembrementFromNotes,
  upsertDemembrementDureeInNotes,
  upsertModeDetentionInNotes,
  yearsBetweenDateInputs,
} from "./investissement-demembrement";

describe("investissement-demembrement", () => {
  it("parse viager et temporaire depuis les notes", () => {
    expect(parseDemembrementDuree("Mode: NP\nDurée: viager")).toEqual({
      kind: "VIAGER",
      annees: null,
    });
    expect(parseDemembrementDuree("Durée: 12 ans")).toEqual({
      kind: "TEMPORAIRE",
      annees: 12,
    });
  });

  it("détecte le kind à l'édition", () => {
    expect(
      detectDemembrementKind({
        typeProduit: "SCPI_DEMEMBREMENT",
        hasDateFin: false,
        notes: "Durée: viager",
      })
    ).toBe("VIAGER");
    expect(
      detectDemembrementKind({
        typeProduit: "SCPI_DEMEMBREMENT",
        hasDateFin: true,
        notes: "",
      })
    ).toBe("TEMPORAIRE");
  });

  it("met à jour la ligne Durée dans les notes", () => {
    expect(
      upsertDemembrementDureeInNotes("Mode: NP", "VIAGER")
    ).toBe("Mode: NP\nDurée: viager");
    expect(
      stripDemembrementDureeFromNotes("Mode: NP\nDurée: viager\nSuite")
    ).toBe("Mode: NP\nSuite");
    expect(
      upsertDemembrementDureeInNotes("Mode: NP", "TEMPORAIRE", 10)
    ).toBe("Mode: NP\nDurée: 10 ans");
  });

  it("calcule la date de fin depuis la souscription", () => {
    expect(addYearsToDateInput("2020-03-15", 10)).toBe("2030-03-15");
    expect(yearsBetweenDateInputs("2020-03-15", "2030-03-15")).toBe(10);
  });

  it("formate viager et temporaire pour synthèses", () => {
    expect(
      formatDemembrementDureeLabel({
        type_produit: "SCPI_DEMEMBREMENT",
        notes: "Durée: viager",
      })
    ).toBe("viager");
    expect(
      formatDemembrementDureeLabel({
        type_produit: "SCPI_DEMEMBREMENT",
        notes: "Durée: 8 ans",
      })
    ).toBe("temporaire 8 ans");
    expect(
      formatDemembrementDureeLabel({
        type_produit: "SCPI_DEMEMBREMENT",
        notes: "",
        date_souscription: Date.parse("2020-03-15T00:00:00Z") / 1000,
        date_fin_demembrement: Date.parse("2030-03-15T00:00:00Z") / 1000,
      })
    ).toBe("temporaire 10 ans");
    expect(
      formatDemembrementDureeLabel({
        type_produit: "SCPI",
        notes: "Durée: viager",
      })
    ).toBeNull();
  });

  it("parse et enregistre le mode de détention", () => {
    expect(parseModeDetention("Mode de détention: NP")).toBe("NUE_PROPRIETE");
    expect(parseModeDetention("Mode de détention: US")).toBe("USUFRUIT");
    expect(
      upsertModeDetentionInNotes("Notes libres", "USUFRUIT")
    ).toBe("Notes libres\nMode de détention: Usufruit");
    expect(
      stripStructuredDemembrementFromNotes(
        "Mode de détention: NP\nDurée: 8 ans\nCommentaire"
      )
    ).toBe("Commentaire");
  });
});
