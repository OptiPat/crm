import { describe, expect, it } from "vitest";
import { PLACEMENT_COMMANDES_SAMPLE_ROWS } from "./__fixtures__/placement-commandes-fixture";
import {
  buildPlacementCommandesImportPreview,
  cleanPlacementLibelleProduit,
  findExistingPlacementInvestissement,
  mapPlacementTypeProduit,
  mergePlacementScpiByInvestorProduct,
  mergePlacementVpByContract,
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

  it("findExistingPlacementInvestissement par numero contrat", () => {
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
      { contactId: 99 }
    );
    expect(match?.id).toBe(1);
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
});
