import { describe, expect, it } from "vitest";
import {
  computeVersementsProgrammesAnnuelStats,
  isVersementComplementaireEligible,
  versementProgrammeAnnuelCentimes,
} from "./investissement-versements";

describe("investissement-versements", () => {
  it("autorise AV, PER et contrat de capitalisation", () => {
    expect(isVersementComplementaireEligible("ASSURANCE_VIE")).toBe(true);
    expect(isVersementComplementaireEligible("PER")).toBe(true);
    expect(isVersementComplementaireEligible("CONTRAT_CAPITALISATION")).toBe(true);
    expect(isVersementComplementaireEligible("SCPI")).toBe(false);
  });

  it("convertit la fréquence en montant annuel", () => {
    expect(versementProgrammeAnnuelCentimes(10_000, "MENSUEL")).toBe(120_000);
    expect(versementProgrammeAnnuelCentimes(10_000, "TRIMESTRIEL")).toBe(40_000);
    expect(versementProgrammeAnnuelCentimes(10_000, "ANNUEL")).toBe(10_000);
  });

  it("agrège les VP avec moi (hors à côté)", () => {
    const stats = computeVersementsProgrammesAnnuelStats([
      {
        id: 1,
        origine: "MON_CONSEIL",
        versement_programme: true,
        montant_versement_programme: 10_000,
        frequence_versement: "MENSUEL",
      },
      {
        id: 2,
        origine: "EXISTANT_CLIENT",
        versement_programme: true,
        montant_versement_programme: 50_000,
        frequence_versement: "MENSUEL",
      },
    ]);
    expect(stats.annuelCentimes).toBe(120_000);
    expect(stats.count).toBe(1);
  });
});
