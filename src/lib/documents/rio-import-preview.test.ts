import { describe, expect, it } from "vitest";
import {
  buildRioPreviewSummary,
  categorizePatrimoineType,
  hasStructuredRioPatrimoine,
  isGuidedStelliumPreview,
} from "./rio-import-preview";

describe("rio-import-preview", () => {
  it("catégorise immo, placements et épargne", () => {
    expect(categorizePatrimoineType("RP")).toBe("immobilier");
    expect(categorizePatrimoineType("RS")).toBe("immobilier");
    expect(categorizePatrimoineType("ASSURANCE_VIE")).toBe("placements");
    expect(categorizePatrimoineType("LIVRET_A")).toBe("epargne");
  });

  it("détecte le patrimoine structuré Stellium", () => {
    expect(hasStructuredRioPatrimoine({})).toBe(false);
    expect(
      hasStructuredRioPatrimoine({
        contratsFinanciers: [{ id: "av", type: "ASSURANCE_VIE", nom: "AV", montant: 10_000 }],
      })
    ).toBe(true);
  });

  it("active le mode guidé pour RIO et QPI", () => {
    expect(isGuidedStelliumPreview("RIO")).toBe(true);
    expect(isGuidedStelliumPreview("QPI")).toBe(true);
    expect(isGuidedStelliumPreview("FISCAL")).toBe(false);
  });

  it("résume contact, SRI et items à trier", () => {
    const summary = buildRioPreviewSummary({
      typeDocument: "RIO",
      prenom: "Jean",
      nom: "Dupont",
      profilRisque: 4,
      patrimoineTotal: 500_000,
      revenusTotal: 80_000,
      isCouple: true,
      contratsFinanciers: [
        { id: "av", type: "ASSURANCE_VIE", nom: "AV Generali", montant: 50_000 },
        { id: "liv", type: "LIVRET_A", nom: "Livret A", montant: 5_000, autoOrigine: "EXISTANT_CLIENT" },
      ],
      biensImmobiliers: [{ id: "rp", type: "RP", nom: "RP", valeur: 300_000 }],
    });

    expect(summary.contactLabel).toBe("Jean Dupont");
    expect(summary.sri).toBe(4);
    expect(summary.itemsToTri).toBe(2);
    expect(summary.itemsAutoCote).toBe(1);
    expect(summary.hasPatrimoineStep).toBe(true);
    expect(summary.isCouple).toBe(true);
  });
});
