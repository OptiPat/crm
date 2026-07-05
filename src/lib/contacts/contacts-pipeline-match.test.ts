import { describe, expect, it } from "vitest";
import { contactMatchesPipelineStage } from "./contacts-pipeline-match";

describe("contactMatchesPipelineStage", () => {
  it("suspects — clients et filleuls", () => {
    expect(
      contactMatchesPipelineStage({ categorie: "SUSPECT_CLIENT", filleul_categorie: null }, "suspects")
    ).toBe(true);
    expect(
      contactMatchesPipelineStage(
        { categorie: "AUCUN", filleul_categorie: "SUSPECT_FILLEUL" },
        "suspects"
      )
    ).toBe(true);
    expect(
      contactMatchesPipelineStage({ categorie: "SUSPECT_FILLEUL", filleul_categorie: null }, "suspects")
    ).toBe(true);
    expect(
      contactMatchesPipelineStage({ categorie: "CLIENT", filleul_categorie: null }, "suspects")
    ).toBe(false);
  });

  it("prospects — clients et filleuls", () => {
    expect(
      contactMatchesPipelineStage({ categorie: "PROSPECT_CLIENT", filleul_categorie: null }, "prospects")
    ).toBe(true);
    expect(
      contactMatchesPipelineStage(
        { categorie: "AUCUN", filleul_categorie: "PROSPECT_FILLEUL" },
        "prospects"
      )
    ).toBe(true);
    expect(
      contactMatchesPipelineStage({ categorie: "PROSPECT_FILLEUL", filleul_categorie: null }, "prospects")
    ).toBe(true);
  });

  it("clients — categorie CLIENT hors ancien client (EN_PAUSE)", () => {
    expect(
      contactMatchesPipelineStage({ categorie: "CLIENT", filleul_categorie: "FILLEUL" }, "clients")
    ).toBe(true);
    expect(
      contactMatchesPipelineStage(
        { categorie: "CLIENT", filleul_categorie: null, statut_suivi: "EN_PAUSE" },
        "clients"
      )
    ).toBe(false);
    expect(
      contactMatchesPipelineStage({ categorie: "PROSPECT_CLIENT", filleul_categorie: null }, "clients")
    ).toBe(false);
  });
});
