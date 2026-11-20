import { describe, expect, it } from "vitest";
import { SCPI_ANNEXE_PRODUCT_FICHES } from "@/lib/souscription-cif/scpi-annexe-catalog";
import { STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS } from "@/lib/placement/stellium-box-placement-products";
import {
  DEFAULT_SCPI_FRAIS_SOUSCRIPTION_PCT,
  parseScpiFraisSouscriptionPct,
  remunerationFraisDeduitsPct,
  scpiFraisSouscriptionPctForProduct,
} from "@/lib/pipe/remuneration-scpi-frais";

describe("frais de souscription SCPI (rémunération)", () => {
  it("chaque fiche du catalogue a un taux lisible", () => {
    for (const fiche of SCPI_ANNEXE_PRODUCT_FICHES) {
      expect(parseScpiFraisSouscriptionPct(fiche.description), fiche.label).not.toBeNull();
    }
  });

  it("lit les formats des fiches (HT, TTC, décimales)", () => {
    expect(parseScpiFraisSouscriptionPct("- Souscription : 10% HT")).toBe(10);
    expect(parseScpiFraisSouscriptionPct("- Souscription : 8,45%")).toBe(8.45);
    expect(parseScpiFraisSouscriptionPct("- Souscription : 11.964% TTC")).toBe(11.964);
    expect(parseScpiFraisSouscriptionPct("- Souscription : 12 % TTC")).toBe(12);
  });

  it("relie les produits du pipe aux fiches (accents, casse)", () => {
    expect(scpiFraisSouscriptionPctForProduct("Comète")).toBe(10);
    expect(scpiFraisSouscriptionPctForProduct("Epargne Pierre")).toBe(10);
    expect(scpiFraisSouscriptionPctForProduct("NCap Régions")).toBe(10);
    expect(scpiFraisSouscriptionPctForProduct("Alta Convictions")).toBe(8.45);
    expect(scpiFraisSouscriptionPctForProduct("Osmo Energie")).toBe(12);
    expect(scpiFraisSouscriptionPctForProduct("LF Avenir Santé")).toBe(9);
  });

  it("10 % par défaut pour une SCPI du pipe absente du catalogue", () => {
    expect(scpiFraisSouscriptionPctForProduct("Atream Hotels")).toBe(
      DEFAULT_SCPI_FRAIS_SOUSCRIPTION_PCT
    );
    expect(scpiFraisSouscriptionPctForProduct(null)).toBe(DEFAULT_SCPI_FRAIS_SOUSCRIPTION_PCT);
  });

  it("toutes les SCPI du pipe ont un taux", () => {
    const scpi = STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS.find((g) => g.id === "scpi");
    for (const product of scpi?.items ?? []) {
      expect(scpiFraisSouscriptionPctForProduct(product)).toBeGreaterThan(0);
    }
  });

  it("déduction pour toute SCPI, jamais pour AV / PER / capitalisation", () => {
    expect(remunerationFraisDeduitsPct({ typeProduit: "SCPI", productLabel: "Comète" })).toBe(10);
    expect(remunerationFraisDeduitsPct({ typeProduit: "ASSURANCE_VIE" })).toBeNull();
    expect(remunerationFraisDeduitsPct({ typeProduit: "CONTRAT_CAPITALISATION" })).toBeNull();
  });
});
