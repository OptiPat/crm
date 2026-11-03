import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { PLACEMENT_COMMANDES_SAMPLE_ROWS } from "./__fixtures__/placement-commandes-fixture";
import {
  buildPlacementCommandesImportPreview,
  cleanPlacementLibelleProduit,
  findExistingPlacementInvestissement,
  getPlacementCrmDiffFieldHighlights,
  mapPlacementTypeProduit,
  mergePlacementScpiByInvestorProduct,
  mergePlacementVpByContract,
  placementNomProduitMatches,
  parsePlacementEuroFieldCentimes,
  resolvePlacementScpiRowAmounts,
  isScpiLikelyDividendReinvestmentCentimes,
  isPlacementContratVpMerge,
  isPlacementPreviewViVpEditable,
  isPlacementSansContratObligatoire,
  parsePlacementCommandeRows,
  parsePlacementEtatCommande,
  parsePlacementInvestorName,
  resolvePlacementDateEffetIso,
  pickPlacementCommandesSheetName,
  stripPlacementNamePrefix,
  syncPlacementVpFields,
  isPlacementImportLineSelectable,
  defaultSelectedPlacementLineKeys,
  type PlacementImportPreviewLine,
  patchPlacementPreviewLines,
} from "./placement-commandes-import";

describe("placement-commandes-import", () => {
  it("stripPlacementNamePrefix retire le 10", () => {
    expect(stripPlacementNamePrefix("10 ALEGRE Magali")).toBe("ALEGRE Magali");
    expect(parsePlacementInvestorName("10 BARAZZUTTI Julie")).toEqual({
      nom: "BARAZZUTTI",
      prenom: "Julie",
    });
  });

  it("cleanPlacementLibelleProduit retire ALPSI et CIF", () => {
    expect(cleanPlacementLibelleProduit("Comète CIF")).toBe("Comète");
    expect(cleanPlacementLibelleProduit("Transitions Europe (ALPSI)")).toBe(
      "Transitions Europe"
    );
    expect(cleanPlacementLibelleProduit("Epargne Pierre Europe ALPSI")).toBe(
      "Epargne Pierre Europe"
    );
  });

  it("mapPlacementTypeProduit", () => {
    expect(mapPlacementTypeProduit("Assurance Vie")).toBe("ASSURANCE_VIE");
    expect(mapPlacementTypeProduit("SCPI rendement")).toBe("SCPI");
    expect(mapPlacementTypeProduit("Epargne retraite")).toBe("PER");
    expect(mapPlacementTypeProduit("Capital investissement")).toBe("FIP_FCPI");
    expect(mapPlacementTypeProduit("Contrat de capitalisation")).toBe("CONTRAT_CAPITALISATION");
    expect(mapPlacementTypeProduit("G3F")).toBe("G3F");
    expect(mapPlacementTypeProduit("Girardin Industriel", "G3F")).toBe("G3F");
    expect(mapPlacementTypeProduit("SCPI fiscale")).toBe("SCPI_FISCALE");
  });

  it("mapPlacementTypeProduit — « Non défini » classé par libellé", () => {
    expect(mapPlacementTypeProduit("Non défini", "FIP Energies Nouvelles II")).toBe("FIP_FCPI");
    expect(mapPlacementTypeProduit("Non défini", "FCPI Développement 2007")).toBe("FIP_FCPI");
    expect(mapPlacementTypeProduit("Non défini", "Ficoma")).toBe("SCPI");
    expect(mapPlacementTypeProduit("Non défini", "Cifocoma 4")).toBe("SCPI");
    expect(mapPlacementTypeProduit("Non défini", "Crédit Mutuel Pierre 1")).toBe("SCPI_FISCALE");
    expect(mapPlacementTypeProduit("Non défini", "Primo 1")).toBe("SCPI_FISCALE");
    expect(mapPlacementTypeProduit("Non défini", "Corum Patrimoine Résidentiel 1")).toBe("SCPI_FISCALE");
    expect(mapPlacementTypeProduit("Non défini", "Pierre Investissement 7")).toBe("SCPI_FISCALE");
    expect(mapPlacementTypeProduit("Non défini", "UFFI Habitat BBC")).toBe("SCPI_FISCALE");
    expect(mapPlacementTypeProduit("Non défini", "Multihabitation 9")).toBe("SCPI_FISCALE");
    expect(mapPlacementTypeProduit("Non défini", "Produit inconnu")).toBe("AUTRE");
    expect(mapPlacementTypeProduit("Non défini", "FCPI10 Innovation")).toBe("FIP_FCPI");
    expect(mapPlacementTypeProduit("Non défini", "Primo 10")).toBe("AUTRE");
    expect(mapPlacementTypeProduit("Non défini", "Fipavie Premium")).toBe("AUTRE");
  });

  it("réimport : retrouve un placement importé avant le reclassement (AUTRE / SCPI)", () => {
    const owner = { contactId: 1 };
    const inv = (id: number, type_produit: string, nom_produit: string) =>
      ({
        id,
        contact_id: 1,
        type_produit,
        nom_produit,
        montant_initial: 10_000_00,
        versement_programme: false,
        reinvestissement_dividendes: false,
        origine: "MON_CONSEIL",
        created_at: 0,
        updated_at: 0,
      }) as Investissement;
    const row = (typeProduit: string, nomProduit: string) => ({
      typeProduit,
      nomProduit,
      montantCentimes: 10_000_00,
    });
    expect(
      findExistingPlacementInvestissement([inv(5, "AUTRE", "G3F")], row("G3F", "G3F"), owner).match?.id
    ).toBe(5);
    expect(
      findExistingPlacementInvestissement([inv(6, "SCPI", "Primo 1")], row("SCPI_FISCALE", "Primo 1"), owner)
        .match?.id
    ).toBe(6);
    expect(
      findExistingPlacementInvestissement([inv(7, "AUTRE", "G3F")], row("ASSURANCE_VIE", "G3F"), owner).match
    ).toBeUndefined();
  });

  it("SCPI fiscale : même fusion que les SCPI (souscriptions cumulées)", () => {
    const row = (date: string) => ({
      "Nom complet Investisseur": "DUPONT Jean",
      "Type Produit": "Non défini",
      "Libellé Produit": "Primo 1",
      "Date Effet": "",
      "Date du dernier Mouvement VC": date,
      "Type du dernier Mouvement VC": "Versement initial",
      "Montant du dernier Mouvement VC": 5000,
      "Montant Versement VC cumulé de la commande": 5000,
      "Etat Commande": "En-cours",
    });
    const rows = parsePlacementCommandeRows([row("10/01/2000"), row("10/01/2001")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.typeProduit).toBe("SCPI_FISCALE");
    expect(rows[0]!.montantCentimes).toBe(10_000_00);
    expect(rows[0]!.dateEffetIso?.slice(0, 10)).toBe("2000-01-10");
  });

  it("isPlacementContratVpMerge inclut capitalisation", () => {
    expect(isPlacementContratVpMerge("CONTRAT_CAPITALISATION")).toBe(true);
    expect(isPlacementSansContratObligatoire("SCPI")).toBe(true);
    expect(isPlacementPreviewViVpEditable("G3F")).toBe(true);
  });

  it("SCPI — VI si dernier mouvement = cumul VC période", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/03/2023",
        "Etat Commande": "En-cours",
        "Type du dernier Mouvement VC": "Versement initial",
        "Montant du dernier Mouvement VC": 10000,
        "Montant Versement VC cumulé sur la période": 10000,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.montantCentimes).toBe(1000000);
    expect(rows[0]?.versementProgramme).toBe(false);
  });

  it("SCPI — VP si dernier mouvement < cumul VC (fusion par investisseur + SCPI)", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/03/2023",
        "Etat Commande": "En-cours",
        "Type du dernier Mouvement VC": "Versement initial",
        "Montant du dernier Mouvement VC": 10000,
        "Montant Versement VC cumulé sur la période": 10000,
      },
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/04/2023",
        "Etat Commande": "En-cours",
        "Type du dernier Mouvement VC": "Versement initial",
        "Montant du dernier Mouvement VC": 50,
        "Montant Versement VC cumulé sur la période": 10050,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nomProduit).toBe("Comète");
    expect(rows[0]?.montantCentimes).toBe(1000000);
    expect(rows[0]?.montantVpCentimes).toBe(5000);
    expect(rows[0]?.frequenceVp).toBe("MENSUEL");
    expect(rows[0]?.versementProgramme).toBe(true);
  });

  it("SCPI — cumul « de la commande » (export réel)", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/03/2023",
        "Etat Commande": "En-cours",
        "Type du dernier Mouvement VC": "Versement initial",
        "Montant du dernier Mouvement VC": 10000,
        "Montant Versement VC cumulé de la commande": 10000,
      },
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/04/2023",
        "Etat Commande": "En-cours",
        "Type du dernier Mouvement VC": "Versement initial",
        "Montant du dernier Mouvement VC": 50,
        "Montant Versement VC cumulé de la commande": 10050,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.montantCentimes).toBe(1000000);
    expect(rows[0]?.montantVpCentimes).toBe(5000);
    expect(rows[0]?.versementProgramme).toBe(true);
  });

  it("isScpiLikelyDividendReinvestmentCentimes — centimes = réinv., entiers = VP", () => {
    expect(isScpiLikelyDividendReinvestmentCentimes(4402)).toBe(true);
    expect(isScpiLikelyDividendReinvestmentCentimes(9054)).toBe(true);
    expect(isScpiLikelyDividendReinvestmentCentimes(5000)).toBe(false);
    expect(isScpiLikelyDividendReinvestmentCentimes(20800)).toBe(false);
    expect(isScpiLikelyDividendReinvestmentCentimes(20000)).toBe(false);
  });

  it("SCPI — 44 € sous cumul = réinv. 100 %, pas VP (type Alexandre)", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "SAUZEAU Alexandre",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/01/2020",
        "Etat Commande": "En-cours",
        "Montant du dernier Mouvement VC": 10000,
        "Montant Versement VC cumulé de la commande": 10000,
      },
      {
        "Nom complet Investisseur": "SAUZEAU Alexandre",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/06/2025",
        "Etat Commande": "En-cours",
        "Montant du dernier Mouvement VC": 44.02,
        "Montant Versement VC cumulé de la commande": 10044.02,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.montantCentimes).toBe(1000000);
    expect(rows[0]?.versementProgramme).toBe(false);
    expect(rows[0]?.reinvestissementDividendes).toBe(true);
    expect(rows[0]?.pourcentageReinvestissement).toBe(100);
  });

  it("SCPI Close ignoré à l'extraction (Close réservé AV/PER)", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/01/2020",
        "Date de Sortie": "01/06/2024",
        "Etat Commande": "Close",
        "Montant du dernier Mouvement VC": 10000,
        "Montant Versement VC cumulé de la commande": 10000,
      },
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/03/2024",
        "Etat Commande": "En-cours",
        "Montant du dernier Mouvement VC": 50,
        "Montant Versement VC cumulé de la commande": 10050,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.montantVpCentimes).toBe(5000);
    expect(rows[0]?.etatCommande).toBe("EN_COURS");
  });

  it("SCPI — VP 50 € + réinv. sur même SCPI (2 lignes)", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/03/2023",
        "Etat Commande": "En-cours",
        "Montant du dernier Mouvement VC": 10000,
        "Montant Versement VC cumulé de la commande": 10000,
      },
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/04/2023",
        "Etat Commande": "En-cours",
        "Montant du dernier Mouvement VC": 50,
        "Montant Versement VC cumulé de la commande": 10050,
      },
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/05/2023",
        "Etat Commande": "En-cours",
        "Montant du dernier Mouvement VC": 44.02,
        "Montant Versement VC cumulé de la commande": 10094.02,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.montantVpCentimes).toBe(5000);
    expect(rows[0]?.versementProgramme).toBe(true);
    expect(rows[0]?.reinvestissementDividendes).toBe(true);
  });

  it("SCPI — VP entier 208 €/mois (pas réinv.)", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/03/2023",
        "Etat Commande": "En-cours",
        "Montant du dernier Mouvement VC": 10000,
        "Montant Versement VC cumulé de la commande": 10000,
      },
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/04/2023",
        "Etat Commande": "En-cours",
        "Montant du dernier Mouvement VC": 208,
        "Montant Versement VC cumulé de la commande": 10208,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.montantVpCentimes).toBe(20800);
    expect(rows[0]?.reinvestissementDividendes).toBe(false);
  });

  it("resolvePlacementScpiRowAmounts — règle cumul", () => {
    expect(
      resolvePlacementScpiRowAmounts(
        {
          "Montant du dernier Mouvement VC": 50,
          "Montant Versement VC cumulé sur la période": 10050,
        },
        {
          montantDernierMv: "Montant du dernier Mouvement VC",
          vcCumulPeriode: "Montant Versement VC cumulé sur la période",
        }
      ).isVpOnlyRow
    ).toBe(true);
    expect(
      resolvePlacementScpiRowAmounts(
        {
          "Montant du dernier Mouvement VC": 10000,
          "Montant Versement VC cumulé sur la période": 10000,
        },
        {
          montantDernierMv: "Montant du dernier Mouvement VC",
          vcCumulPeriode: "Montant Versement VC cumulé sur la période",
        }
      ).montantCentimes
    ).toBe(1000000);
  });

  it("parsePlacementEtatCommande", () => {
    expect(parsePlacementEtatCommande("En-cours")).toBe("EN_COURS");
    expect(parsePlacementEtatCommande("Close")).toBe("CLOSE");
    expect(parsePlacementEtatCommande("Non conforme")).toBe("NON_CONFORME");
  });

  it("parsePlacementCommandeRows extrait VI sans cumul VP", () => {
    const rows = parsePlacementCommandeRows(PLACEMENT_COMMANDES_SAMPLE_ROWS);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.montantCentimes).toBe(150000);
    expect(rows[0]?.nomProduit).toContain("Cristalliance");
    expect(rows[1]?.montantCentimes).toBe(1200000);
    expect(rows[1]?.nomProduit).toBe("Comète");
    expect(rows[1]?.dateEffetIso).toBeTruthy();
    expect(rows[2]?.etatCommande).toBe("CLOSE");
    expect(rows[2]?.dateSortieIso).toBeTruthy();
  });

  it("resolvePlacementDateEffetIso — Date Effet JJ/MM/AA", () => {
    expect(
      resolvePlacementDateEffetIso(
        { "Date Effet": "18/11/24" },
        { dateEffet: "Date Effet" }
      )
    ).toBe("2024-11-18T00:00:00.000Z");
  });

  it("resolvePlacementDateEffetIso — Date Effet uniquement", () => {
    expect(
      resolvePlacementDateEffetIso(
        { "Date Effet": "15/06/2024" },
        { dateEffet: "Date Effet" }
      )
    ).toBe("2024-06-15T00:00:00.000Z");
    expect(
      resolvePlacementDateEffetIso(
        {
          "Date Effet": "",
          "Date du dernier Mouvement VC": "15/06/2024",
        },
        { dateEffet: "Date Effet" }
      )
    ).toBeUndefined();
  });

  it("resolvePlacementDateEffetIso — repli sur la date du versement initial", () => {
    const keys = {
      dateEffet: "Date Effet",
      typeDernierMv: "Type du dernier Mouvement VC",
      dateDernierMv: "Date du dernier Mouvement VC",
    };
    expect(
      resolvePlacementDateEffetIso(
        {
          "Date Effet": "",
          "Type du dernier Mouvement VC": "Versement initial",
          "Date du dernier Mouvement VC": "18/12/2024",
        },
        keys
      )
    ).toBe("2024-12-18T00:00:00.000Z");
    expect(
      resolvePlacementDateEffetIso(
        {
          "Date Effet": "",
          "Type du dernier Mouvement VC": "Versement complémentaire",
          "Date du dernier Mouvement VC": "18/12/2024",
        },
        keys
      )
    ).toBeUndefined();
    expect(
      resolvePlacementDateEffetIso(
        {
          "Date Effet": "15/06/2024",
          "Type du dernier Mouvement VC": "Versement initial",
          "Date du dernier Mouvement VC": "18/12/2024",
        },
        keys
      )
    ).toBe("2024-06-15T00:00:00.000Z");
  });

  it("mergePlacementVpByContract — VP sur ligne VI même contrat", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "Assurance Vie",
        "Libellé Produit": "Cristalliance Avenir Placement Multi-supports",
        "Numéro de Contrat": "9E 273412199",
        "Date Effet": "01/01/2024",
        "Etat Commande": "En-cours",
        "dont Versement Initial En-Cours": 12000,
        "Programmation de Versements?\r\nFréquence?": "Aucune",
      },
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "Assurance Vie",
        "Libellé Produit": "Cristalliance Avenir Placement Multi-supports",
        "Numéro de Contrat": "9E 273412199",
        "Etat Commande": "En-cours",
        "Type du dernier Mouvement VC": "Versement programmé - Mensuel",
        "Montant du dernier Mouvement VC": 200,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.montantCentimes).toBe(1200000);
    expect(rows[0]?.versementProgramme).toBe(true);
    expect(rows[0]?.montantVpCentimes).toBe(20000);
    expect(rows[0]?.frequenceVp).toBe("MENSUEL");
  });

  it("AV/PER — VI 150 € (Aucune) + VP 50 €/mois (Mensuel) même contrat", () => {
    const rows = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "Assurance Vie",
        "Libellé Produit": "Cristalliance Avenir",
        "Numéro de Contrat": "9E 273412199",
        "Date Effet": "01/01/2024",
        "Etat Commande": "En-cours",
        "dont Versement Initial En-Cours": 150,
        "Programmation de Versements?\r\nFréquence?": "Aucune",
      },
      {
        "Nom complet Investisseur": "DUPONT Jean",
        "Type Produit": "Assurance Vie",
        "Libellé Produit": "Cristalliance Avenir",
        "Numéro de Contrat": "9E 273412199",
        "Etat Commande": "En-cours",
        "dont Versement Initial En-Cours": 150,
        "Programmation de Versements?\r\nFréquence?": "Mensuel",
        "Programmation Montant Versement": 50,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.montantCentimes).toBe(15000);
    expect(rows[0]?.dateEffetIso).toBeDefined();
    expect(rows[0]?.versementProgramme).toBe(true);
    expect(rows[0]?.montantVpCentimes).toBe(5000);
    expect(rows[0]?.frequenceVp).toBe("MENSUEL");
  });

  it("mergePlacementVpByContract — unitaire", () => {
    const merged = mergePlacementVpByContract([
      {
        rowIndex: 2,
        investorNom: "DUPONT",
        investorPrenom: "Jean",
        investorEmail: "",
        typeProduit: "ASSURANCE_VIE",
        partenaireNom: "",
        nomProduit: "Test",
        numeroContrat: "9E 111",
        montantCentimes: 100000,
        dateEffetIso: "2024-01-01T00:00:00.000Z",
        etatCommande: "EN_COURS",
        versementProgramme: false,
      },
      {
        rowIndex: 3,
        investorNom: "DUPONT",
        investorPrenom: "Jean",
        investorEmail: "",
        typeProduit: "ASSURANCE_VIE",
        partenaireNom: "",
        nomProduit: "Test",
        numeroContrat: "9E 111",
        montantCentimes: null,
        etatCommande: "EN_COURS",
        versementProgramme: true,
        montantVpCentimes: 5000,
        frequenceVp: "MENSUEL",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.versementProgramme).toBe(true);
    expect(merged[0]?.montantVpCentimes).toBe(5000);
  });

  it("findExistingPlacementInvestissement par numero contrat filtre par propriétaire", () => {
    const { match: wrongOwner } = findExistingPlacementInvestissement(
      [
        {
          id: 1,
          type_produit: "ASSURANCE_VIE",
          nom_produit: "Test",
          numero_contrat: "9E 271740658",
          montant_initial: 150000,
          contact_id: 5,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
      ],
      {
        numeroContrat: "9E 271740658",
        typeProduit: "ASSURANCE_VIE",
        nomProduit: "Autre libellé",
        montantCentimes: 999,
      },
      { contactId: 99 }
    );
    expect(wrongOwner).toBeUndefined();

    const { match } = findExistingPlacementInvestissement(
      [
        {
          id: 1,
          type_produit: "ASSURANCE_VIE",
          nom_produit: "Test",
          numero_contrat: "9E 271740658",
          montant_initial: 150000,
          contact_id: 5,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
      ],
      {
        numeroContrat: "9E 271740658",
        typeProduit: "ASSURANCE_VIE",
        nomProduit: "Autre libellé",
        montantCentimes: 999,
      },
      { contactId: 5 }
    );
    expect(match?.id).toBe(1);
  });

  it("placementNomProduitMatches tolère ALPSI/CIF", () => {
    expect(placementNomProduitMatches("Comète CIF", "Comète")).toBe(true);
    expect(placementNomProduitMatches("Transitions Europe (ALPSI)", "Transitions Europe")).toBe(
      true
    );
  });

  it("placementNomProduitMatches rejette le rapprochement sur mots génériques seuls", () => {
    expect(
      placementNomProduitMatches("Transitions Europe (ALPSI)", "Epargne Pierre Europe ALPSI")
    ).toBe(false);
    expect(placementNomProduitMatches("Europe Premium", "Transitions Europe")).toBe(false);
  });

  it("findExistingPlacementInvestissement ne matche pas sur le montant seul", () => {
    const result = findExistingPlacementInvestissement(
      [
        {
          id: 1,
          type_produit: "SCPI",
          nom_produit: "Comète",
          numero_contrat: undefined,
          montant_initial: 1200000,
          contact_id: 5,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
      ],
      {
        numeroContrat: "",
        typeProduit: "SCPI",
        nomProduit: "Autre SCPI",
        montantCentimes: 1200000,
      },
      { contactId: 5 }
    );
    expect(result.match).toBeUndefined();
    expect(result.ambiguous).toBeUndefined();
  });

  it("findExistingPlacementInvestissement signale ambiguous si plusieurs noms correspondent", () => {
    const invs = [
      {
        id: 1,
        type_produit: "SCPI" as const,
        nom_produit: "Comète CIF",
        numero_contrat: undefined,
        montant_initial: 1000000,
        contact_id: 5,
        versement_programme: false,
        reinvestissement_dividendes: false,
        origine: "MON_CONSEIL" as const,
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 2,
        type_produit: "SCPI" as const,
        nom_produit: "Comète",
        numero_contrat: undefined,
        montant_initial: 2000000,
        contact_id: 5,
        versement_programme: false,
        reinvestissement_dividendes: false,
        origine: "MON_CONSEIL" as const,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const { ambiguous, match } = findExistingPlacementInvestissement(
      invs,
      {
        numeroContrat: "",
        typeProduit: "SCPI",
        nomProduit: "Comète CIF",
        montantCentimes: 1500000,
      },
      { contactId: 5 }
    );
    expect(ambiguous).toBe(true);
    expect(match).toBeUndefined();
  });

  it("findExistingPlacementInvestissement départage par montant si plusieurs noms correspondent", () => {
    const invs = [
      {
        id: 1,
        type_produit: "SCPI" as const,
        nom_produit: "Comète CIF",
        numero_contrat: undefined,
        montant_initial: 1000000,
        contact_id: 5,
        versement_programme: false,
        reinvestissement_dividendes: false,
        origine: "MON_CONSEIL" as const,
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 2,
        type_produit: "SCPI" as const,
        nom_produit: "Comète",
        numero_contrat: undefined,
        montant_initial: 2000000,
        contact_id: 5,
        versement_programme: false,
        reinvestissement_dividendes: false,
        origine: "MON_CONSEIL" as const,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const { match } = findExistingPlacementInvestissement(
      invs,
      {
        numeroContrat: "",
        typeProduit: "SCPI",
        nomProduit: "Comète CIF",
        montantCentimes: 2000000,
      },
      { contactId: 5 }
    );
    expect(match?.id).toBe(2);
  });

  it("parsePlacementEuroFieldCentimes — montants formatés Excel", () => {
    expect(parsePlacementEuroFieldCentimes("187 200")).toBe(18_720_000);
    expect(parsePlacementEuroFieldCentimes("283,792")).toBe(28_379_200);
  });

  it("buildPlacementCommandesImportPreview détecte duplicate_crm avec nom tolérant", () => {
    const parsed = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "LEGRAND Paul",
        "Type Produit": "SCPI rendement",
        "Libellé Produit": "Comète CIF",
        "Date Effet": "01/03/2023",
        "Type du dernier Mouvement VC": "Versement initial",
        "Montant du dernier Mouvement VC": 12000,
        "Etat Commande": "En-cours",
      },
    ]);
    const preview = buildPlacementCommandesImportPreview(
      parsed,
      [
        {
          id: 1,
          nom: "LEGRAND",
          prenom: "Paul",
          categorie: "CLIENT",
          statut_suivi: "ACTIF",
          created_at: 0,
          updated_at: 0,
        } as Contact,
      ],
      [
        {
          id: 10,
          contact_id: 1,
          type_produit: "SCPI",
          nom_produit: "Comète",
          montant_initial: 12_000_00,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
      ]
    );
    expect(preview[0]!.status).toBe("duplicate_crm");
    const highlights = getPlacementCrmDiffFieldHighlights(preview[0]!, {
      id: 10,
      contact_id: 1,
      type_produit: "SCPI",
      nom_produit: "Comète",
      montant_initial: 12_000_00,
      versement_programme: false,
      reinvestissement_dividendes: false,
      origine: "MON_CONSEIL",
      partenaire_id: 99,
      created_at: 0,
      updated_at: 0,
    });
    expect(highlights.nomProduit).toBeUndefined();
  });

  it("buildPlacementCommandesImportPreview — contact introuvable", () => {
    const parsed = parsePlacementCommandeRows([PLACEMENT_COMMANDES_SAMPLE_ROWS[0]!]);
    const lines = buildPlacementCommandesImportPreview(parsed, [], []);
    expect(lines[0]?.status).toBe("contact_not_found");
  });

  it("mergePlacementVpByContract — VP seule AV/PER → VI=0 importable", () => {
    const merged = mergePlacementVpByContract([
      {
        rowIndex: 125,
        investorNom: "CLEMENT",
        investorPrenom: "Maxime",
        investorEmail: "",
        typeProduit: "ASSURANCE_VIE",
        partenaireNom: "",
        nomProduit: "Cristalliance Avenir",
        numeroContrat: "9E 271815775",
        montantCentimes: null,
        dateEffetIso: "2024-11-25T00:00:00.000Z",
        etatCommande: "EN_COURS",
        versementProgramme: true,
        montantVpCentimes: 20000,
        frequenceVp: "MENSUEL",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.montantCentimes).toBe(0);
    expect(merged[0]?.montantVpCentimes).toBe(20000);
    expect(merged[0]?.frequenceVp).toBe("MENSUEL");
  });

  it("buildPlacementCommandesImportPreview — VP seule AV → review", () => {
    const parsed = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "CLEMENT Maxime",
        "Type Produit": "Assurance Vie",
        "Libellé Produit": "Cristalliance Avenir",
        "Numéro de Contrat": "9E 271815775",
        "Date Effet": "25/11/2024",
        "Etat Commande": "En-cours",
        "dont Versement Initial En-Cours": 0,
        "Programmation de Versements?\r\nFréquence?": "Mensuel",
        "Programmation Montant Versement": 200,
        "Type du dernier Mouvement VC": "Versement programmé - Mensuel",
        "Montant du dernier Mouvement VC": 200,
      },
    ]);
    const lines = buildPlacementCommandesImportPreview(
      parsed,
      [
        {
          id: 1,
          nom: "CLEMENT",
          prenom: "Maxime",
          email: "maxime@example.com",
          categorie: "CLIENT",
          statut_suivi: "ACTIF",
          created_at: 0,
          updated_at: 0,
        },
      ],
      []
    );
    expect(lines[0]?.status).toBe("review");
    expect(lines[0]?.montantCentimes).toBe(0);
    expect(lines[0]?.montantVpCentimes).toBe(20000);
  });

  it("buildPlacementCommandesImportPreview — Close exige date de sortie", () => {
    const parsed = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "BERNARD Luc",
        "Type Produit": "Assurance Vie",
        "Libellé Produit": "Test",
        "Numéro de Contrat": "4055352",
        "Date Effet": "16/07/2020",
        "Etat Commande": "Close",
        "dont Versement Initial En-Cours": 9000,
      },
    ]);
    const invalid = buildPlacementCommandesImportPreview(
      parsed,
      [{ id: 1, nom: "BERNARD", prenom: "Luc", categorie: "CLIENT", statut_suivi: "ACTIF", created_at: 0, updated_at: 0 }],
      []
    );
    expect(invalid[0]?.status).toBe("invalid");

    const withDate = parsePlacementCommandeRows([
      {
        "Nom complet Investisseur": "BERNARD Luc",
        "Type Produit": "Assurance Vie",
        "Libellé Produit": "Test",
        "Numéro de Contrat": "4055352",
        "Date Effet": "16/07/2020",
        "Date de Sortie": "24/02/2025",
        "Etat Commande": "Close",
        "dont Versement Initial En-Cours": 9000,
      },
    ]);
    const ready = buildPlacementCommandesImportPreview(
      withDate,
      [{ id: 1, nom: "BERNARD", prenom: "Luc", categorie: "CLIENT", statut_suivi: "ACTIF", created_at: 0, updated_at: 0 }],
      []
    );
    expect(ready[0]?.status).toBe("ready");
    expect(ready[0]?.etatCommande).toBe("CLOSE");
    expect(ready[0]?.dateSortieIso).toBeTruthy();
  });

  it("mergePlacementScpiByInvestorProduct — VP seul + réinv. sans VI", () => {
    const merged = mergePlacementScpiByInvestorProduct([
      {
        rowIndex: 2,
        investorNom: "DUPONT",
        investorPrenom: "Jean",
        investorEmail: "",
        typeProduit: "SCPI",
        partenaireNom: "",
        nomProduit: "Comète",
        etatCommande: "EN_COURS",
        montantCentimes: null,
        versementProgramme: true,
        montantVpCentimes: 5000,
        frequenceVp: "MENSUEL",
        reinvestissementDividendes: false,
      },
      {
        rowIndex: 3,
        investorNom: "DUPONT",
        investorPrenom: "Jean",
        investorEmail: "",
        typeProduit: "SCPI",
        partenaireNom: "",
        nomProduit: "Comète",
        etatCommande: "EN_COURS",
        montantCentimes: null,
        versementProgramme: false,
        reinvestissementDividendes: true,
        pourcentageReinvestissement: 100,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.versementProgramme).toBe(true);
    expect(merged[0]!.montantVpCentimes).toBe(5000);
    expect(merged[0]!.reinvestissementDividendes).toBe(true);
    expect(merged[0]!.pourcentageReinvestissement).toBe(100);
  });

  it("pickPlacementCommandesSheetName", () => {
    expect(
      pickPlacementCommandesSheetName(["Autre", "Investissement Placement"])
    ).toBe("Investissement Placement");
  });

  it("syncPlacementVpFields conserve la fréquence sans montant VP", () => {
    expect(syncPlacementVpFields(undefined, "MENSUEL")).toEqual({
      versementProgramme: false,
      montantVpCentimes: undefined,
      frequenceVp: "MENSUEL",
    });
  });

  it("syncPlacementVpFields active le VP quand montant et fréquence", () => {
    expect(syncPlacementVpFields(5000, "TRIMESTRIEL")).toEqual({
      versementProgramme: true,
      montantVpCentimes: 5000,
      frequenceVp: "TRIMESTRIEL",
    });
  });

  it("isPlacementImportLineSelectable accepte ready, review et duplicate_crm", () => {
    const ready = { status: "ready", lineKey: "r1" } as PlacementImportPreviewLine;
    const review = { status: "review", lineKey: "v1" } as PlacementImportPreviewLine;
    const dup = {
      status: "duplicate_crm",
      investissementId: 3,
      lineKey: "d1",
    } as PlacementImportPreviewLine;
    const ambiguous = { status: "duplicate_crm", lineKey: "d2" } as PlacementImportPreviewLine;
    expect(isPlacementImportLineSelectable(ready)).toBe(true);
    expect(isPlacementImportLineSelectable(review)).toBe(true);
    expect(isPlacementImportLineSelectable(dup)).toBe(true);
    expect(isPlacementImportLineSelectable(ambiguous)).toBe(false);
    expect(defaultSelectedPlacementLineKeys([ready, review, dup, ambiguous]).size).toBe(3);
  });

  it("patchPlacementPreviewLines — correction date seule garde le contact des autres lignes", () => {
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Jean",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
      {
        id: 2,
        nom: "MARTIN",
        prenom: "Paul",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    const line1 = {
      lineKey: "row-1",
      rowIndex: 1,
      status: "ready",
      contactId: 1,
      contactLabel: "Jean DUPONT",
      investorNom: "DUPONT",
      investorPrenom: "Jean",
      typeProduit: "SCPI",
      nomProduit: "Comète",
      montantCentimes: 10_000_00,
      dateEffetIso: "2024-01-15T00:00:00.000Z",
      etatCommande: "EN_COURS",
      versementProgramme: false,
      partenaireNom: "",
    } as PlacementImportPreviewLine;
    const line2 = {
      ...line1,
      lineKey: "row-2",
      rowIndex: 2,
      contactId: 2,
      contactLabel: "Paul MARTIN",
      investorNom: "MARTIN",
      investorPrenom: "Paul",
      nomProduit: "Corum",
    } as PlacementImportPreviewLine;

    const updated = patchPlacementPreviewLines(
      [line1, line2],
      line1.lineKey,
      { dateEffetIso: "2024-02-01T00:00:00.000Z" },
      contacts,
      [],
      { reassessAll: false }
    );
    expect(updated[0]!.dateEffetIso).toBe("2024-02-01T00:00:00.000Z");
    expect(updated[0]!.contactId).toBe(1);
    expect(updated[1]!.contactId).toBe(2);
    expect(updated[1]!.contactLabel).toBe("Paul MARTIN");
  });

  it("patchPlacementPreviewLines — choix manuel du contact CRM", () => {
    const contacts: Contact[] = [
      {
        id: 5,
        nom: "BERNARD",
        prenom: "Luc",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    const line = {
      lineKey: "row-1",
      rowIndex: 1,
      status: "contact_not_found",
      investorNom: "INCONNU",
      investorPrenom: "X",
      typeProduit: "SCPI",
      nomProduit: "Comète",
      montantCentimes: 10_000_00,
      dateEffetIso: "2024-01-15T00:00:00.000Z",
      etatCommande: "EN_COURS",
      versementProgramme: false,
      partenaireNom: "",
      contactLabel: "X INCONNU",
    } as PlacementImportPreviewLine;

    const updated = patchPlacementPreviewLines(
      [line],
      line.lineKey,
      { contactId: 5 },
      contacts,
      []
    );
    expect(updated[0]!.status).toBe("ready");
    expect(updated[0]!.contactId).toBe(5);
    expect(updated[0]!.contactLabel).toBe("Luc BERNARD");
  });

  it("patchPlacementPreviewLines — correction libellé produit", () => {
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Jean",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    const line = {
      lineKey: "row-1",
      rowIndex: 1,
      status: "ready",
      contactId: 1,
      contactLabel: "Jean DUPONT",
      investorNom: "DUPONT",
      investorPrenom: "Jean",
      typeProduit: "SCPI",
      nomProduit: "Comète ALPSI",
      montantCentimes: 10_000_00,
      dateEffetIso: "2024-01-15T00:00:00.000Z",
      etatCommande: "EN_COURS",
      versementProgramme: false,
      partenaireNom: "",
    } as PlacementImportPreviewLine;

    const updated = patchPlacementPreviewLines(
      [line],
      line.lineKey,
      { nomProduit: "Corum Origine" },
      contacts,
      []
    );
    expect(updated[0]!.nomProduit).toBe("Corum Origine");
    expect(updated[0]!.status).toBe("ready");
  });

  it("souscriptions annuelles même montant (Girardin, sans Date Effet) ≠ doublons fichier", () => {
    const row = (date: string) => ({
      "Nom complet Investisseur": "LEGRAND Christian",
      "Type Produit": "Girardin Industriel",
      "Libellé Produit": "G3F",
      "Date Effet": "",
      "Date du dernier Mouvement VC": date,
      "Type du dernier Mouvement VC": "Versement initial",
      "Montant du dernier Mouvement VC": 10000,
      "Etat Commande": "En-cours",
    });
    const parsed = parsePlacementCommandeRows([row("31/01/2023"), row("30/06/2023"), row("30/06/2023")]);
    const lines = buildPlacementCommandesImportPreview(
      parsed,
      [
        {
          id: 1,
          nom: "LEGRAND",
          prenom: "Christian",
          categorie: "CLIENT",
          statut_suivi: "ACTIF",
          created_at: 0,
          updated_at: 0,
        } as Contact,
      ],
      []
    );
    expect(lines.map((l) => l.status)).toEqual(["ready", "ready", "duplicate_csv"]);
    expect(lines[0]!.dateEffetIso?.slice(0, 10)).toBe("2023-01-31");

    // Correction de la date du doublon dans l'aperçu : il redevient importable.
    const fixed = patchPlacementPreviewLines(
      lines,
      lines[2]!.lineKey,
      { dateEffetIso: "2024-06-30T00:00:00.000Z" },
      [{ id: 1, nom: "LEGRAND", prenom: "Christian", categorie: "CLIENT", statut_suivi: "ACTIF", created_at: 0, updated_at: 0 } as Contact],
      [],
      { reassessAll: false }
    );
    expect(fixed.map((l) => l.status)).toEqual(["ready", "ready", "ready"]);

    // Inverse : aligner la date sur une autre ligne la repasse en doublon, l'autre reste prête.
    const dup = patchPlacementPreviewLines(
      fixed,
      fixed[0]!.lineKey,
      { dateEffetIso: "2023-06-30T00:00:00.000Z" },
      [{ id: 1, nom: "LEGRAND", prenom: "Christian", categorie: "CLIENT", statut_suivi: "ACTIF", created_at: 0, updated_at: 0 } as Contact],
      [],
      { reassessAll: false }
    );
    expect(dup.map((l) => l.status).filter((s) => s === "duplicate_csv")).toHaveLength(1);
  });

  it("SCPI : souscriptions multiples cumulées, date = première ; VP seul sans repli de date", () => {
    const vi = (date: string, montant: number) => ({
      "Nom complet Investisseur": "DUPONT Jean",
      "Type Produit": "SCPI rendement",
      "Libellé Produit": "Comète",
      "Date Effet": "",
      "Date du dernier Mouvement VC": date,
      "Type du dernier Mouvement VC": "Versement initial",
      "Montant du dernier Mouvement VC": montant,
      "Montant Versement VC cumulé de la commande": montant,
      "Etat Commande": "En-cours",
    });
    const rows = parsePlacementCommandeRows([vi("15/03/2025", 15000), vi("22/07/2026", 15000)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.montantCentimes).toBe(30_000_00);
    expect(rows[0]!.dateEffetIso?.slice(0, 10)).toBe("2025-03-15");

    const vpOnly = parsePlacementCommandeRows([
      { ...vi("30/10/2026", 200), "Montant Versement VC cumulé de la commande": 4800 },
    ]);
    expect(vpOnly).toHaveLength(1);
    expect(vpOnly[0]!.versementProgramme).toBe(true);
    expect(vpOnly[0]!.dateEffetIso).toBeUndefined();
  });
});
