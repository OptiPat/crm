import { describe, expect, it } from "vitest";
import { computeRemunerationCentimes } from "@/lib/pipe/remuneration-calc";
import { defaultPvForTypeProduit } from "@/lib/pipe/remuneration-pv";

describe("remuneration-pv", () => {
  it("SCPI : 0,4 sans CIF, 0,5 avec CIF", () => {
    expect(defaultPvForTypeProduit("SCPI")).toBe(0.4);
    expect(defaultPvForTypeProduit("SCPI", { cifEnabled: true })).toBe(0.5);
  });

  it("AV et G3F", () => {
    expect(defaultPvForTypeProduit("ASSURANCE_VIE")).toBe(0.4);
    expect(defaultPvForTypeProduit("G3F")).toBe(0.27);
  });

  it("immo : pas de PV auto", () => {
    expect(defaultPvForTypeProduit("PINEL")).toBeNull();
  });
});

describe("remuneration-calc", () => {
  it("calcule montant × PV × TPC", () => {
    // 50 000 € × 0,4 × 7 % = 1 400 €
    expect(
      computeRemunerationCentimes({
        montantCentimes: 5_000_000,
        typeProduit: "PER",
        tpcPercent: 7,
        cifEnabled: false,
      })
    ).toBe(140_000);
  });

  it("AV / PER / capitalisation : montant × 0,4 × TPC, même en CIF", () => {
    // 70 000 € × 0,4 × 7 % = 1 960 €
    expect(
      computeRemunerationCentimes({
        montantCentimes: 7_000_000,
        typeProduit: "ASSURANCE_VIE",
        tpcPercent: 7,
        cifEnabled: true,
        productLabel: "Cristalliance Avenir",
      })
    ).toBe(196_000);
  });

  it("SCPI en CIF : (montant − frais de la fiche) × 0,5 × TPC", () => {
    // Comète, 10 % : (50 000 − 5 000) × 0,5 × 7 % = 1 575 €
    expect(
      computeRemunerationCentimes({
        montantCentimes: 5_000_000,
        typeProduit: "SCPI",
        tpcPercent: 7,
        cifEnabled: true,
        productLabel: "Comète",
      })
    ).toBe(157_500);
    // Osmo Energie, 12 % : 44 000 × 0,5 × 7 % = 1 540 €
    expect(
      computeRemunerationCentimes({
        montantCentimes: 5_000_000,
        typeProduit: "SCPI",
        tpcPercent: 7,
        cifEnabled: true,
        productLabel: "Osmo Energie",
      })
    ).toBe(154_000);
  });

  it("SCPI hors CIF : (montant − frais de la fiche) × 0,4 × TPC", () => {
    // Osmo Energie, 12 % : 44 000 × 0,4 × 7 % = 1 232 €
    expect(
      computeRemunerationCentimes({
        montantCentimes: 5_000_000,
        typeProduit: "SCPI",
        tpcPercent: 7,
        cifEnabled: false,
        productLabel: "Osmo Energie",
      })
    ).toBe(123_200);
  });

  it("utilise le PV manuel immo", () => {
    expect(
      computeRemunerationCentimes({
        montantCentimes: 1_000_000,
        typeProduit: "PINEL",
        tpcPercent: 7,
        cifEnabled: false,
        pvManual: 0.3,
      })
    ).toBe(21_000);
  });
});
