import { describe, expect, it } from "vitest";
import {
  aggregateProductStatsByFamily,
  resolveDashboardProductFamily,
} from "./dashboard-product-families";

describe("resolveDashboardProductFamily", () => {
  it("regroupe toutes les SCPI", () => {
    expect(resolveDashboardProductFamily("SCPI")).toBe("SCPI");
    expect(resolveDashboardProductFamily("SCPI_DEMEMBREMENT")).toBe("SCPI");
    expect(resolveDashboardProductFamily("SCPI_FISCALE")).toBe("SCPI");
  });

  it("classe PER et capital invest", () => {
    expect(resolveDashboardProductFamily("PER")).toBe("PER");
    expect(resolveDashboardProductFamily("FIP_FCPI")).toBe("CAPITAL_INVEST");
    expect(resolveDashboardProductFamily("FCPR")).toBe("CAPITAL_INVEST");
    expect(resolveDashboardProductFamily("FPCI")).toBe("CAPITAL_INVEST");
    expect(resolveDashboardProductFamily("FPCR")).toBe("CAPITAL_INVEST");
  });

  it("classe immobilier, épargne financière et épargne salariale", () => {
    expect(resolveDashboardProductFamily("PINEL")).toBe("IMMOBILIER");
    expect(resolveDashboardProductFamily("MALRAUX")).toBe("IMMOBILIER");
    expect(resolveDashboardProductFamily("ASSURANCE_VIE")).toBe("EPARGNE_FINANCIERE");
    expect(resolveDashboardProductFamily("CONTRAT_CAPITALISATION")).toBe(
      "EPARGNE_FINANCIERE"
    );
    expect(resolveDashboardProductFamily("PREVOYANCE")).toBe("EPARGNE_FINANCIERE");
    expect(resolveDashboardProductFamily("EPARGNE_SALARIALE")).toBe("EPARGNE_SALARIALE");
    expect(resolveDashboardProductFamily("PEE")).toBe("EPARGNE_SALARIALE");
    expect(resolveDashboardProductFamily("PERCO")).toBe("EPARGNE_SALARIALE");
  });

  it("envoie le reste vers Autres", () => {
    expect(resolveDashboardProductFamily("LIVRET_A")).toBe("AUTRES");
  });
});

describe("aggregateProductStatsByFamily", () => {
  it("somme par famille et trie par montant décroissant", () => {
    const rows = aggregateProductStatsByFamily([
      { type_produit: "SCPI", montant: 100 },
      { type_produit: "SCPI_DEMEMBREMENT", montant: 50 },
      { type_produit: "ASSURANCE_VIE", montant: 200 },
      { type_produit: "PINEL", montant: 80 },
      { type_produit: "FIP_FCPI", montant: 30 },
      { type_produit: "G3F", montant: 10 },
      { type_produit: "PER", montant: 40 },
      { type_produit: "EPARGNE_SALARIALE", montant: 25 },
      { type_produit: "LIVRET_A", montant: 5 },
    ]);

    expect(rows.map((r) => r.id)).toEqual([
      "EPARGNE_FINANCIERE",
      "SCPI",
      "IMMOBILIER",
      "PER",
      "EPARGNE_SALARIALE",
      "CAPITAL_INVEST",
      "G3F",
      "AUTRES",
    ]);
    expect(rows.find((r) => r.id === "SCPI")?.montant).toBe(150);
    expect(rows.find((r) => r.id === "EPARGNE_SALARIALE")?.montant).toBe(25);
    expect(rows.find((r) => r.id === "AUTRES")?.montant).toBe(5);
  });
});
