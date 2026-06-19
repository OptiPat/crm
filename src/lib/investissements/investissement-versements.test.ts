import { describe, expect, it } from "vitest";
import {
  computeAvPerVersementProgrammeCoverageStats,
  computeVersementsProgrammesAnnuelStats,
  filterAvPerSansVersementProgramme,
  getMontantInvestiCentimes,
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

  it("cumule souscription et versements complémentaires", () => {
    expect(
      getMontantInvestiCentimes({
        montant_initial: 10_000_00,
        montant_investi_total: 12_500_00,
      })
    ).toBe(12_500_00);
    expect(getMontantInvestiCentimes({ montant_initial: 10_000_00 })).toBe(10_000_00);
  });

  it("calcule la couverture VP sur AV/PER avec moi", () => {
    const stats = computeAvPerVersementProgrammeCoverageStats([
      {
        id: 1,
        origine: "MON_CONSEIL",
        type_produit: "ASSURANCE_VIE",
        versement_programme: true,
        montant_versement_programme: 100_00,
      },
      {
        id: 2,
        origine: "MON_CONSEIL",
        type_produit: "PER",
        versement_programme: false,
      },
      {
        id: 3,
        origine: "MON_CONSEIL",
        type_produit: "SCPI",
        versement_programme: true,
        montant_versement_programme: 200_00,
      },
      {
        id: 4,
        origine: "EXISTANT_CLIENT",
        type_produit: "ASSURANCE_VIE",
        versement_programme: false,
      },
    ]);
    expect(stats.total).toBe(2);
    expect(stats.withVp).toBe(1);
    expect(stats.withoutVp).toBe(1);
    expect(stats.percentWithVp).toBe(50);
  });

  it("filtre les AV/PER avec moi sans VP actif", () => {
    const list = filterAvPerSansVersementProgramme([
      {
        id: 1,
        origine: "MON_CONSEIL",
        type_produit: "PER",
        versement_programme: false,
      },
      {
        id: 2,
        origine: "MON_CONSEIL",
        type_produit: "ASSURANCE_VIE",
        versement_programme: true,
        montant_versement_programme: 50_00,
      },
      {
        id: 3,
        origine: "MON_CONSEIL",
        type_produit: "ASSURANCE_VIE",
        versement_programme: true,
        montant_versement_programme: 0,
      },
    ]);
    expect(list.map((i) => i.id)).toEqual([1, 3]);
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
