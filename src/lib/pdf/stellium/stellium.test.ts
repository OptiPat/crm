import { describe, expect, it } from "vitest";
import {
  detectStelliumDocument,
  isStelliumQpi,
  isStelliumRio,
  mapProfilToSri,
  parseStelliumQpi,
  parseStelliumRio,
  parseRioObjectifsSection,
  findRioObjectifsTableBlock,
} from "./index";
import { parseAuto } from "../parse-auto";
import legrandFixture from "./fixtures/rio-solo-legrand-2026.txt?raw";
import rousseauFixture from "./fixtures/rio-couple-rousseau-2026.txt?raw";
import durandMoreauFixture from "./fixtures/rio-couple-durand-moreau-2026.txt?raw";
import qpiDupontFixture from "./fixtures/qpi-solo-dupont-2026.txt?raw";

describe("Stellium — détection document", () => {
  it("détecte le RIO Legrand solo", () => {
    expect(isStelliumRio(legrandFixture)).toBe(true);
    expect(isStelliumQpi(legrandFixture)).toBe(false);
    expect(detectStelliumDocument(legrandFixture)).toBe("RIO");
  });

  it("détecte le QPI Dupont sans faux positif RIO", () => {
    expect(isStelliumQpi(qpiDupontFixture)).toBe(true);
    expect(isStelliumRio(qpiDupontFixture)).toBe(false);
    expect(isStelliumRio(qpiDupontFixture)).toBe(false);
    expect(detectStelliumDocument(qpiDupontFixture)).toBe("QPI");
  });
});

describe("Stellium — RIO solo Legrand 2026", () => {
  const data = parseStelliumRio(legrandFixture);

  it("extrait l'identité et les coordonnées", () => {
    expect(data.civilite).toBe("M");
    expect(data.nom).toBe("LEGRAND");
    expect(data.prenom).toBe("Paul");
    expect(data.nomNaissance).toBe("LEGRAND");
    expect(data.dateNaissance).toBe("25/10/1975");
    expect(data.lieuNaissance).toMatch(/Saint flour/i);
    expect(data.nationalite).toBe("Française");
    expect(data.email).toBe("paul.legrand@example.com");
    expect(data.telephone).toBe("+33600000001");
    expect(data.adresse).toBe("12 Rue des Acacias");
    expect(data.codePostal).toBe("75001");
    expect(data.ville).toBe("Paris");
  });

  it("extrait la situation familiale et les enfants", () => {
    expect(data.situationFamiliale).toBe("CELIBATAIRE");
    expect(data.nombreEnfants).toBe(2);
    expect(data.enfants).toHaveLength(2);
    expect(data.enfants?.[0]).toMatchObject({
      prenom: "Lisa",
      nom: "LEGRAND",
      dateNaissance: "19/02/2009",
    });
    expect(data.enfants?.[1]).toMatchObject({
      prenom: "Julie",
      dateNaissance: "28/09/2012",
    });
    expect(data.nombrePersonnesCharge).toBe(0);
  });

  it("extrait la situation professionnelle", () => {
    expect(data.profession).toBe("Directeur Commercial");
    expect(data.employeur).toBe("AGILITEAM");
  });

  it("extrait le patrimoine", () => {
    expect(data.patrimoineTotal).toBe(295268);
    expect(data.compteCourant).toBe(135000);
    expect(data.assuranceVie).toBe(50268);
    expect(data.residenceSecondaire?.valeur).toBe(110000);
    expect(data.biensImmobiliers).toHaveLength(1);
    expect(data.biensImmobiliers?.[0]).toMatchObject({
      type: "RESIDENCE_SECONDAIRE",
      nom: "Maison Espagne",
      valeur: 110000,
    });
    expect(data.epargneTotal).toBe(185268);
  });

  it("extrait revenus et charges", () => {
    expect(data.revenusSalaires).toBe(80923);
    expect(data.revenusTotal).toBe(80923);
    expect(data.chargesPensionsAlimentaires).toBe(14400);
    expect(data.chargesEmprunts).toBe(2400);
    expect(data.chargesTotal).toBe(32520);
    expect(data.chargesAutres).toBe(15720);
  });

  it("extrait la fiscalité foyer (revenu brut global)", () => {
    expect(data.revenuBrutGlobal).toBe(72_026);
    expect(data.trancheImposition).toBeUndefined();
  });

  it("extrait les objectifs et métadonnées", () => {
    expect(data.dateEntreeRelation).toBe("27/02/2026");
    expect(data.dateDocument).toBe("15/06/2026");
    expect(data.dateSignature).toBe("15/06/2026");
    expect(data.objectifsPrincipaux).toEqual([
      "Accompagner vos enfants",
      "Préparer votre retraite",
      "Disposer de revenus ponctuellement (en cas de besoin)",
      "Optimiser la rentabilité de vos placements financiers",
    ]);
    expect(data.typeDocument).toBe("RIO");
    expect(data.confidence).toBeGreaterThanOrEqual(75);
  });

  it("extrait les objectifs solo (libellé + assignation + priorité)", () => {
    const section =
      "Objectifs  Objectif(s)   Attribué à   Priorité   Horizon  " +
      "Optimiser la rentabilité de vos placements financiers   Nicolas PLAZA   1   -  " +
      "Préparer votre retraite   Nicolas PLAZA   2   -  " +
      "Se constituer un patrimoine immobilier   Nicolas PLAZA   3   -  " +
      "Epargne de précaution souhaitée   20   000   €";
    expect(parseRioObjectifsSection(section)).toEqual([
      "Optimiser la rentabilité de vos placements financiers",
      "Préparer votre retraite",
      "Se constituer un patrimoine immobilier",
    ]);
  });

  it("extrait les objectifs avec espaces simples (PDF.js)", () => {
    const section =
      "Objectif(s) Attribué à Priorité Horizon " +
      "Optimiser la rentabilité de vos placements financiers Nicolas PLAZA 1 - " +
      "Préparer votre retraite Nicolas PLAZA 2 - " +
      "Se constituer un patrimoine immobilier Nicolas PLAZA 3 - " +
      "Epargne de précaution souhaitée 20 000 €";
    expect(parseRioObjectifsSection(section)).toEqual([
      "Optimiser la rentabilité de vos placements financiers",
      "Préparer votre retraite",
      "Se constituer un patrimoine immobilier",
    ]);
  });

  it("recolle une cellule objectif coupée sur deux lignes PDF", () => {
    const section =
      "Objectif(s) Attribué à Priorité Horizon " +
      "Optimiser la rentabilité de vos Nicolas PLAZA 1 - placements financiers " +
      "Préparer votre retraite Nicolas PLAZA 2 - " +
      "Se constituer un patrimoine immobilier Nicolas PLAZA 3 - " +
      "Epargne de précaution souhaitée 20 000 €";
    expect(parseRioObjectifsSection(section)).toEqual([
      "Optimiser la rentabilité de vos placements financiers",
      "Préparer votre retraite",
      "Se constituer un patrimoine immobilier",
    ]);
  });

  it("recolle les objectifs sur deux lignes comme dans les fixtures Stellium", () => {
    const section =
      "Objectif(s) Attribué à Priorité Horizon " +
      "Optimiser la rentabilité de vos  placements financiers Marc ROUSSEAU & Anne ROUSSEAU 1 - " +
      "Préparer votre retraite Marc ROUSSEAU & Anne ROUSSEAU 2 - Epargne de précaution 15 000 €";
    expect(parseRioObjectifsSection(section)).toEqual([
      "Optimiser la rentabilité de vos placements financiers",
      "Préparer votre retraite",
    ]);
  });

  it("recolle les libellés coupés quand priorité/horizon est sur une ligne séparée (layout réel Stellium)", () => {
    const section = [
      "Objectif(s)\tAttribué à\tPriorité\tHorizon",
      "Accompagner vos enfants\tJean DUPONT\t1\t-",
      "Préparer votre retraite\tJean DUPONT\t2\t-",
      "Disposer de revenus ponctuellement (en\tJean DUPONT",
      "3\t-",
      "cas de besoin)",
      "Optimiser la rentabilité de vos\tJean DUPONT",
      "4\t-",
      "placements financiers",
      "Epargne de précaution souhaitée\t20000 €",
    ].join("\n");
    expect(parseRioObjectifsSection(section)).toEqual([
      "Accompagner vos enfants",
      "Préparer votre retraite",
      "Disposer de revenus ponctuellement (en cas de besoin)",
      "Optimiser la rentabilité de vos placements financiers",
    ]);
  });

  it("nettoie les noms assignataires sur un objectif couple coupé (layout PDF réel)", () => {
    const section =
      "Objectif(s) Attribué à Priorité Horizon " +
      "Préparer votre retraite Paul BERNARD & Luc LEGRAND 1 - " +
      "Optimiser la fiscalité de vos revenus Paul BERNARD 2 - " +
      "Optimiser la rentabilité de vos Paul BERNARD 3 - " +
      "placements financiers Paul BERNARD Luc LEGRAND " +
      "Epargne de précaution souhaitée 10000 €";
    expect(parseRioObjectifsSection(section)).toEqual([
      "Préparer votre retraite",
      "Optimiser la fiscalité de vos revenus",
      "Optimiser la rentabilité de vos placements financiers",
    ]);
  });

  it("retrouve la table Objectifs après une coupure de page", () => {
    const text =
      "Fiscalité IR net à payer 1000 € Objectifs Recueil d'informations - Nicolas PLAZA - 15/06/2026 3/6 " +
      "Objectif(s) Attribué à Priorité Horizon Optimiser la rentabilité de vos placements financiers Nicolas PLAZA 1 - " +
      "Préparer votre retraite Nicolas PLAZA 2 - Epargne de précaution souhaitée 20 000 € MENTIONS RESERVEES";
    const block = findRioObjectifsTableBlock(text);
    expect(block).toBeTruthy();
    expect(parseRioObjectifsSection(block!)).toEqual([
      "Optimiser la rentabilité de vos placements financiers",
      "Préparer votre retraite",
    ]);
    expect(parseStelliumRio(text).objectifsPrincipaux).toEqual([
      "Optimiser la rentabilité de vos placements financiers",
      "Préparer votre retraite",
    ]);
  });

  it("parseAuto route vers le parser Stellium", () => {
    const auto = parseAuto(legrandFixture);
    expect(auto.nom).toBe("LEGRAND");
    expect(auto.patrimoineTotal).toBe(295268);
  });
});

describe("Stellium — RIO couple ROUSSEAU 2026", () => {
  const data = parseStelliumRio(rousseauFixture);

  it("détecte le couple et extrait les deux identités", () => {
    expect(data.isCouple).toBe(true);
    expect(data.civilite).toBe("M");
    expect(data.nom).toBe("ROUSSEAU");
    expect(data.prenom).toBe("Marc");
    expect(data.email).toBe("marc.rousseau@example.com");
    expect(data.telephone).toBe("+33600000002");
    expect(data.dateNaissance).toBe("22/10/1987");
    expect(data.profession).toBe("Chef de projet");
    expect(data.employeur).toBe("AIRBUS");

    expect(data.conjoint).toMatchObject({
      civilite: "MME",
      nom: "ROUSSEAU",
      prenom: "Anne",
      nomNaissance: "PETIT",
      email: "anne.petit@example.com",
      telephone: "+33600000003",
      dateNaissance: "27/09/1985",
      profession: "Coordinatrice logistique",
      employeur: "IDP ARCHITECTE",
    });
  });

  it("extrait situation, enfants et adresse commune", () => {
    expect(data.situationFamiliale).toBe("MARIE");
    expect(data.regimeMatrimonial).toBe("Communauté réduite aux acquets");
    expect(data.adresse).toBe("3 Allée des Ormes");
    expect(data.codePostal).toBe("33000");
    expect(data.ville).toBe("Bordeaux");
    expect(data.nombreEnfants).toBe(2);
    expect(data.enfants).toEqual([
      { prenom: "Elena", nom: "ROUSSEAU", dateNaissance: "09/11/2019" },
      { prenom: "Noémie", nom: "ROUSSEAU", dateNaissance: "23/03/2021" },
    ]);
  });

  it("extrait le patrimoine foyer (colonnes Commun/Total)", () => {
    expect(data.patrimoineTotal).toBe(1398802);
    expect(data.residencePrincipale?.valeur).toBe(420000);
    expect(data.immobilierLocatif?.valeur).toBe(796000);
    expect(data.scpi).toBe(40600);
    expect(data.assuranceVie).toBe(65902);
    expect(data.livretA).toBe(36300);
    expect(data.conjoint?.patrimoineTotal).toBe(10880);
    expect(data.biensImmobiliers?.length).toBeGreaterThanOrEqual(4);
  });

  it("extrait revenus et charges agrégés", () => {
    expect(data.revenusTotal).toBe(178300);
    expect(data.revenusSalaires).toBe(52300);
    expect(data.revenusFonciers).toBe(108000);
    expect(data.conjoint?.revenusTotal).toBe(18000);
    expect(data.chargesTotal).toBe(73252);
  });

  it("extrait métadonnées et objectifs", () => {
    expect(data.dateEntreeRelation).toBe("16/09/2021");
    expect(data.dateDocument).toBe("15/06/2026");
    expect(data.dateSignature).toBe("15/06/2026");
    expect(data.trancheImposition).toBe("11%");
    expect(data.revenuBrutGlobal).toBe(126528);
    expect(data.objectifsPrincipaux?.length).toBeGreaterThanOrEqual(4);
    expect(data.confidence).toBeGreaterThanOrEqual(75);
  });
});

describe("Stellium — RIO couple DURAND/MOREAU 2026", () => {
  const data = parseStelliumRio(durandMoreauFixture);

  it("détecte le couple et extrait les deux identités", () => {
    expect(data.isCouple).toBe(true);
    expect(data.nom).toBe("DURAND");
    expect(data.prenom).toBe("Claire");
    expect(data.email).toBe("claire.durand@example.com");
    expect(data.profession).toBe("Kinésithérapeute");

    expect(data.conjoint).toMatchObject({
      nom: "MOREAU",
      prenom: "Guillaume",
      email: "guillaume.moreau@example.com",
      telephone: "+33600000005",
      dateNaissance: "12/07/1996",
      profession: "Kinésithérapeute",
    });
  });

  it("extrait situation et adresse", () => {
    expect(data.situationFamiliale).toBe("UNION_LIBRE");
    expect(data.ville).toBe("Lyon");
    expect(data.nombreEnfants).toBeUndefined();
  });

  it("extrait le patrimoine foyer (colonnes Total)", () => {
    expect(data.patrimoineTotal).toBe(745440);
    expect(data.residencePrincipale?.valeur).toBe(496800);
    expect(data.assuranceVie).toBe(25123);
    expect(data.per).toBe(5317);
    expect(data.livretA).toBe(18200);
    expect(data.conjoint?.patrimoineTotal).toBe(363721);
    expect(data.biensImmobiliers?.some((b) => b.nom === "Malraux" && b.valeur === 200000)).toBe(
      true
    );
  });

  it("extrait revenus et charges", () => {
    expect(data.revenusTotal).toBe(74000);
    expect(data.revenusSalaires).toBe(37000);
    expect(data.conjoint?.revenusTotal).toBe(37000);
    expect(data.chargesTotal).toBe(30515);
  });

  it("extrait métadonnées", () => {
    expect(data.dateEntreeRelation).toBe("29/07/2025");
    expect(data.dateDocument).toBe("15/06/2026");
    expect(data.dateSignature).toBe("15/06/2026");
    expect(data.revenuBrutGlobal).toBe(37_289 + 34_958);
    expect(data.confidence).toBeGreaterThanOrEqual(75);
  });
});

describe("Stellium — QPI solo Dupont 2026", () => {
  const data = parseStelliumQpi(qpiDupontFixture);

  it("extrait l'identité", () => {
    expect(data.nom).toBe("DUPONT");
    expect(data.prenom).toBe("Jean");
    expect(data.dateDocument).toBe("15/06/2026");
    expect(data.dateSignature).toBe("15/06/2026");
    expect(data.typeDocument).toBe("QPI");
  });

  it("extrait l'investisseur même si le nom contient « Le » (CLEVELAND, CLEMENT…)", () => {
    const text =
      "Profil investisseur Consultant : DUPONT Jean Investisseur : CLEVELAND Paul Le 15/06/2026 Conformément aux exigences";
    const parsed = parseStelliumQpi(text);
    expect(parsed.nom).toBe("CLEVELAND");
    expect(parsed.prenom).toBe("Paul");
  });

  it("mappe le profil de risque vers l'échelle CRM 1–5", () => {
    expect(mapProfilToSri("Dynamique")).toBe(4);
    expect(mapProfilToSri("Offensif")).toBe(5);
    expect(data.profilRisque).toBe(4);
    expect(data.aversionRisque).toBe("Dynamique");
  });

  it("extrait le niveau d'expérience (Novice, Informé ou Expérimenté)", () => {
    expect(data.experienceInvestissement).toBe("Expérimenté");
    expect(data.sensibiliteExtraFinanciere).toBe(
      "Vous ne souhaitez pas préciser vos préférences en matière de durabilité"
    );
    expect(data.confidence).toBeGreaterThanOrEqual(70);
  });

  it("parseAuto route vers le parser QPI", () => {
    const auto = parseAuto(qpiDupontFixture);
    expect(auto.typeDocument).toBe("QPI");
    expect(auto.profilRisque).toBe(4);
    expect(auto.nom).toBe("DUPONT");
  });
});
