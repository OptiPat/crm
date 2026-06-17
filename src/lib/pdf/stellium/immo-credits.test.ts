import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "./rio-parser";
import dupontFixture from "./fixtures/rio-solo-dupont-2026.txt?raw";
import {
  enrichBiensImmobiliersWithCredits,
  parseStelliumPassifsMortgageCredits,
} from "./immo-credits";
import type { BienImmobilier } from "../types";

describe("immo-credits — Dupont solo 2026", () => {
  const data = parseStelliumRio(dupontFixture);

  it("associe mensualité et CRD aux biens immobiliers", () => {
    const rp = data.biensImmobiliers?.find((b) => b.nom === "Primo MTP");
    const loc = data.biensImmobiliers?.find((b) => b.nom === "Sete AIRBNB");

    expect(rp).toMatchObject({
      valeur: 310000,
      mensualiteCredit: 1500,
      creditCRD: 210000,
      dateFinCredit: "15/06/2045",
    });
    expect(loc).toMatchObject({
      valeur: 72500,
      mensualiteCredit: 500,
      creditCRD: 70000,
      dateFinCredit: "01/01/2040",
    });
  });

  it("associe crédits avec colonnes tabulées (extraction PDF spatiale)", () => {
    const tabbed = dupontFixture.replace(/ {2,}/g, "\t");
    const tabbedData = parseStelliumRio(tabbed);
    const rp = tabbedData.biensImmobiliers?.find((b) => b.nom === "Primo MTP");
    expect(rp?.creditCRD).toBe(210000);
    expect(rp?.mensualiteCredit).toBe(1500);
  });

  it("associe le crédit RP même si le nom du bien est générique", () => {
    const biens: BienImmobilier[] = [
      {
        id: "rp",
        type: "RESIDENCE_PRINCIPALE",
        nom: "Résidence Principale",
        valeur: 310000,
      },
      {
        id: "loc",
        type: "LOCATIF",
        nom: "Sete AIRBNB",
        valeur: 72500,
      },
    ];
    enrichBiensImmobiliersWithCredits(dupontFixture, biens);
    expect(biens[0]).toMatchObject({
      creditCRD: 210000,
      mensualiteCredit: 1500,
      dateFinCredit: "15/06/2045",
    });
    expect(biens[1]).toMatchObject({
      creditCRD: 70000,
      mensualiteCredit: 500,
    });
  });

  it("parse les lignes crédit Stellium Passifs", () => {
    const credits = parseStelliumPassifsMortgageCredits(dupontFixture);
    expect(credits).toHaveLength(2);
    expect(credits.find((c) => c.productType.toUpperCase() === "RP")).toMatchObject({
      echeanceAnnuelle: 18000,
      crd: 210000,
      dateFinCredit: "15/06/2045",
    });
  });
});
