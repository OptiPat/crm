import { describe, expect, it } from "vitest";
import { stelliumJournalTitre } from "@/lib/placement/stellium-journal-titre";

const normalizeSpaces = (s: string) => s.replace(/[  ]/g, " ");

describe("titre de journal à la confirmation d'envoi Stellium", () => {
  it("souscription : ajoute le montant pour distinguer deux souscriptions identiques", () => {
    const titre = (montantCentimes: number) =>
      normalizeSpaces(
        stelliumJournalTitre({
          label: "Souscription",
          product: "Cristalliance Avenir",
          versementComplementaire: false,
          operationType: "SOUSCRIPTION",
          montantCentimes,
        })
      );
    expect(titre(7_000_000)).toBe("Souscription — Cristalliance Avenir — 70 000 €");
    expect(titre(5_000)).toBe("Souscription — Cristalliance Avenir — 50 €");
  });

  it("autres actes : titre inchangé", () => {
    expect(
      stelliumJournalTitre({
        label: "Arbitrage libre",
        product: "Cristalliance Evoluvie",
        versementComplementaire: false,
        operationType: "ARBITRAGE",
        montantCentimes: 1_000_000,
      })
    ).toBe("Arbitrage libre — Cristalliance Evoluvie");
    expect(
      stelliumJournalTitre({
        label: "Versement complémentaire",
        product: "",
        versementComplementaire: true,
        operationType: "VERSEMENT",
        montantCentimes: 1_000_000,
      })
    ).toBe("Versement complémentaire");
  });

  it("souscription sans montant : titre sans montant", () => {
    expect(
      stelliumJournalTitre({
        label: "Souscription",
        product: "Comète",
        versementComplementaire: false,
        operationType: "SOUSCRIPTION",
        montantCentimes: null,
      })
    ).toBe("Souscription — Comète");
  });
});
