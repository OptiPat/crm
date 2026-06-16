import { describe, expect, it } from "vitest";
import {
  detectStelliumDocument,
  isStelliumQpi,
  isStelliumRio,
  mapProfilToSri,
  parseStelliumQpi,
  parseStelliumRio,
} from "./index";
import { parseAuto } from "../parse-auto";
import rioFixture from "./fixtures/rio-martinez-2026.txt?raw";
import debbaghiFixture from "./fixtures/rio-debbaghi-couple-2026.txt?raw";
import noyezFixture from "./fixtures/rio-noyez-gentil-couple-2026.txt?raw";
import qpiFixture from "./fixtures/qpi-plaza-2026.txt?raw";

describe("Stellium — détection document", () => {
  it("détecte le RIO Martinez", () => {
    expect(isStelliumRio(rioFixture)).toBe(true);
    expect(isStelliumQpi(rioFixture)).toBe(false);
    expect(detectStelliumDocument(rioFixture)).toBe("RIO");
  });

  it("détecte le QPI Plaza sans faux positif RIO", () => {
    expect(isStelliumQpi(qpiFixture)).toBe(true);
    expect(isStelliumRio(qpiFixture)).toBe(false);
    expect(isStelliumRio(qpiFixture)).toBe(false);
    expect(detectStelliumDocument(qpiFixture)).toBe("QPI");
  });
});

describe("Stellium — RIO Martinez 2026", () => {
  const data = parseStelliumRio(rioFixture);

  it("extrait l'identité et les coordonnées", () => {
    expect(data.civilite).toBe("M");
    expect(data.nom).toBe("MARTINEZ LOPEZ");
    expect(data.prenom).toBe("Franck");
    expect(data.nomNaissance).toBe("MARTINEZ LOPEZ");
    expect(data.dateNaissance).toBe("25/10/1975");
    expect(data.lieuNaissance).toMatch(/Saint flour/i);
    expect(data.nationalite).toBe("Française");
    expect(data.email).toBe("franck.martinez-lopez@outlook.fr");
    expect(data.telephone).toBe("+33647364854");
    expect(data.adresse).toBe("5 rue viguerie");
    expect(data.codePostal).toBe("31300");
    expect(data.ville).toBe("Toulouse");
  });

  it("extrait la situation familiale et les enfants", () => {
    expect(data.situationFamiliale).toBe("CELIBATAIRE");
    expect(data.nombreEnfants).toBe(2);
    expect(data.enfants).toHaveLength(2);
    expect(data.enfants?.[0]).toMatchObject({
      prenom: "Lisa",
      nom: "MARTINEZ LOPEZ",
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
    expect(data.objectifsPrincipaux).toEqual([
      "Accompagner vos enfants",
      "Préparer votre retraite",
      "Disposer de revenus ponctuellement (en cas de besoin)",
      "Optimiser la rentabilité de vos placements financiers",
    ]);
    expect(data.typeDocument).toBe("RIO");
    expect(data.confidence).toBeGreaterThanOrEqual(75);
  });

  it("parseAuto route vers le parser Stellium", () => {
    const auto = parseAuto(rioFixture);
    expect(auto.nom).toBe("MARTINEZ LOPEZ");
    expect(auto.patrimoineTotal).toBe(295268);
  });
});

describe("Stellium — RIO couple DEBBAGHI 2026", () => {
  const data = parseStelliumRio(debbaghiFixture);

  it("détecte le couple et extrait les deux identités", () => {
    expect(data.isCouple).toBe(true);
    expect(data.civilite).toBe("M");
    expect(data.nom).toBe("DEBBAGHI");
    expect(data.prenom).toBe("Mehdi");
    expect(data.email).toBe("sci.meta@yahoo.com");
    expect(data.telephone).toBe("+33651352058");
    expect(data.dateNaissance).toBe("22/10/1987");
    expect(data.profession).toBe("Chef de projet");
    expect(data.employeur).toBe("AIRBUS");

    expect(data.conjoint).toMatchObject({
      civilite: "MME",
      nom: "DEBBAGHI",
      prenom: "Aleksandra",
      nomNaissance: "SZYMANSKA",
      email: "contact.szymanska@gmail.com",
      telephone: "+33780032158",
      dateNaissance: "27/09/1985",
      profession: "Coordinatrice logistique",
      employeur: "IDP ARCHITECTE",
    });
  });

  it("extrait situation, enfants et adresse commune", () => {
    expect(data.situationFamiliale).toBe("MARIE");
    expect(data.regimeMatrimonial).toBe("Communauté réduite aux acquets");
    expect(data.adresse).toBe("49 rue de la savoie");
    expect(data.codePostal).toBe("31170");
    expect(data.ville).toBe("TOURNEFEUILLE");
    expect(data.nombreEnfants).toBe(2);
    expect(data.enfants).toEqual([
      { prenom: "Elena", nom: "DEBBAGHI", dateNaissance: "09/11/2019" },
      { prenom: "Noémie", nom: "DEBBAGHI", dateNaissance: "23/03/2021" },
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
    expect(data.trancheImposition).toBe("11%");
    expect(data.revenuBrutGlobal).toBe(126528);
    expect(data.objectifsPrincipaux?.length).toBeGreaterThanOrEqual(4);
    expect(data.confidence).toBeGreaterThanOrEqual(75);
  });
});

describe("Stellium — RIO couple NOYEZ/GENTIL 2026", () => {
  const data = parseStelliumRio(noyezFixture);

  it("détecte le couple et extrait les deux identités", () => {
    expect(data.isCouple).toBe(true);
    expect(data.nom).toBe("NOYEZ");
    expect(data.prenom).toBe("Laurene");
    expect(data.email).toBe("laurene.noyez@gmail.com");
    expect(data.profession).toBe("Kinésithérapeute");

    expect(data.conjoint).toMatchObject({
      nom: "GENTIL",
      prenom: "Gwendal",
      email: "gentilgwendal@gmail.com",
      telephone: "+33670527215",
      dateNaissance: "12/07/1996",
      profession: "Kinésithérapeute",
    });
  });

  it("extrait situation et adresse", () => {
    expect(data.situationFamiliale).toBe("UNION_LIBRE");
    expect(data.ville).toBe("Annecy");
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
    expect(data.revenuBrutGlobal).toBe(37_289 + 34_958);
    expect(data.confidence).toBeGreaterThanOrEqual(75);
  });
});

describe("Stellium — QPI Plaza 2026", () => {
  const data = parseStelliumQpi(qpiFixture);

  it("extrait l'identité", () => {
    expect(data.nom).toBe("PLAZA");
    expect(data.prenom).toBe("Nicolas");
    expect(data.dateDocument).toBe("15/06/2026");
    expect(data.typeDocument).toBe("QPI");
  });

  it("mappe le profil de risque vers le SRI CRM", () => {
    expect(mapProfilToSri("Dynamique")).toBe(4);
    expect(data.profilRisque).toBe(4);
    expect(data.aversionRisque).toBe("Dynamique");
  });

  it("extrait le niveau de connaissances", () => {
    expect(data.connaissancesFinancieres).toBe("Élevé");
    expect(data.experienceInvestissement).toBe("Expérimenté");
    expect(data.confidence).toBeGreaterThanOrEqual(70);
  });

  it("parseAuto route vers le parser QPI", () => {
    const auto = parseAuto(qpiFixture);
    expect(auto.typeDocument).toBe("QPI");
    expect(auto.profilRisque).toBe(4);
    expect(auto.nom).toBe("PLAZA");
  });
});
