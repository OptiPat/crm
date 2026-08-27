import { describe, expect, it } from "vitest";
import { computeClientVpMoyenMensuelStats } from "./contact-client-vp-moyen-stats";

const base = {
  origine: "MON_CONSEIL" as const,
  statut: "ACTIF",
  versement_programme: true,
};

describe("computeClientVpMoyenMensuelStats", () => {
  it("sépare AV/PER et SCPI, ramenés au mois", () => {
    const stats = computeClientVpMoyenMensuelStats([
      {
        ...base,
        id: 1,
        type_produit: "ASSURANCE_VIE",
        montant_versement_programme: 100_00,
        frequence_versement: "MENSUEL",
        contact_id: 1,
      },
      {
        ...base,
        id: 2,
        type_produit: "PER",
        montant_versement_programme: 300_00,
        frequence_versement: "TRIMESTRIEL",
        contact_id: 2,
      },
      {
        ...base,
        id: 3,
        type_produit: "SCPI",
        montant_versement_programme: 1_200_00,
        frequence_versement: "ANNUEL",
        contact_id: 3,
      },
    ]);
    expect(stats.avPer.count).toBe(2);
    expect(stats.avPer.moyenMensuelEuros).toBe(100);
    expect(stats.scpi.count).toBe(1);
    expect(stats.scpi.moyenMensuelEuros).toBe(100);
  });

  it("traite une fréquence absente comme mensuelle", () => {
    const stats = computeClientVpMoyenMensuelStats([
      {
        ...base,
        id: 1,
        type_produit: "ASSURANCE_VIE",
        montant_versement_programme: 150_00,
        frequence_versement: null,
        contact_id: 1,
      },
    ]);
    expect(stats.avPer.count).toBe(1);
    expect(stats.avPer.moyenMensuelEuros).toBe(150);
  });

  it("exclut capi, épargne salariale et SCPI hors pleine propriété", () => {
    const stats = computeClientVpMoyenMensuelStats([
      {
        ...base,
        id: 1,
        type_produit: "CONTRAT_CAPITALISATION",
        montant_versement_programme: 500_00,
        frequence_versement: "MENSUEL",
        contact_id: 1,
      },
      {
        ...base,
        id: 2,
        type_produit: "EPARGNE_SALARIALE",
        montant_versement_programme: 500_00,
        frequence_versement: "MENSUEL",
        contact_id: 2,
      },
      {
        ...base,
        id: 3,
        type_produit: "SCPI_FISCALE",
        montant_versement_programme: 500_00,
        frequence_versement: "MENSUEL",
        contact_id: 3,
      },
      {
        ...base,
        id: 4,
        type_produit: "SCPI_DEMEMBREMENT",
        montant_versement_programme: 500_00,
        frequence_versement: "MENSUEL",
        contact_id: 4,
      },
    ]);
    expect(stats.avPer.moyenMensuelEuros).toBeNull();
    expect(stats.scpi.moyenMensuelEuros).toBeNull();
  });

  it("exclut existant client, clôturé et VP inactif", () => {
    const stats = computeClientVpMoyenMensuelStats([
      {
        ...base,
        id: 1,
        origine: "EXISTANT_CLIENT",
        type_produit: "ASSURANCE_VIE",
        montant_versement_programme: 100_00,
        frequence_versement: "MENSUEL",
        contact_id: 1,
      },
      {
        ...base,
        id: 2,
        statut: "CLOTURE",
        type_produit: "PER",
        montant_versement_programme: 100_00,
        frequence_versement: "MENSUEL",
        contact_id: 2,
      },
      {
        ...base,
        id: 3,
        type_produit: "SCPI",
        versement_programme: false,
        montant_versement_programme: 100_00,
        contact_id: 3,
      },
    ]);
    expect(stats.avPer.count).toBe(0);
    expect(stats.scpi.count).toBe(0);
  });

  it("déduplique le même contrat", () => {
    const row = {
      ...base,
      id: 1,
      type_produit: "ASSURANCE_VIE",
      montant_versement_programme: 100_00,
      frequence_versement: "MENSUEL",
      contact_id: 1,
    };
    const stats = computeClientVpMoyenMensuelStats([row, row]);
    expect(stats.avPer.count).toBe(1);
    expect(stats.avPer.moyenMensuelEuros).toBe(100);
  });
});
