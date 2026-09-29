import { describe, expect, it } from "vitest";
import { hasPatrimoineToTri } from "@/lib/documents/rio-patrimoine-flow";
import { cleanStelliumActifLabel, mapActifCategoryToProductType } from "./financial-contracts";
import { parseStelliumRio } from "./rio-parser";

/** RIO solo anonymisé : fil d'Ariane 2026 + champs qui débordent sur la ligne suivante. */
const RIO_BREADCRUMB = `
Recueil d'informations
Consultant : Jean DUPONT
Investisseur : Marie DUPONT
Date d'entrée en relation : 11/09/2026
Identité
Civilité	Madame
Nom d'usage / prénom	DUPONT Marie
Nom de naissance	DUPONT
Né(e) le	24/11/1995 à Lyon () - France
Nationalité	Française
Coordonnées
Adresse e-mail	marie.dupont@example.com
Téléphone mobile	+33600000009
Téléphone secondaire	-
12 rue des Lilas
Adresse postale
69001 Lyon - France
Pays de résidence fiscale	France
Statut d'occupation du logement	Locataire
Relations
Situation matrimoniale	Union-libre
Régime	-
Avantage matrimonial
	Nombre d'enfants à charge : 0
Professionnel
Catégorie socio-professionnelle	Employés
Profession (ou dernière profession)	Chargée de patrimoine
Secteur d'activité	-
Nom de la société	-
Origine des revenus	-
Patrimoine
Actifs
Désignation	-
Financier	37500 €
Épargne bancaire	34000 €
Compte courant - Épargne bancaire - Compte courant	30000 €
Livret A - Épargne bancaire - Livret A	4000 €
Épargne retraite et salariale	3500 €
PEE - Épargne retraite et salariale - PEE	3500 €
TOTAL	37500 €
Passifs
Désignation	Emprunteur	Echéance par an	CRD   Date d'échéance
TOTAL	0 €	0 €
`.trim();

describe("RIO solo — fil d'Ariane actifs et champs bornés", () => {
  const data = parseStelliumRio(RIO_BREADCRUMB);

  it("ne déborde pas sur le libellé suivant", () => {
    expect(data.telephone).toBe("+33600000009");
    expect(data.profession).toBe("Chargée de patrimoine");
    expect(data.regimeMatrimonial).toBeUndefined();
    expect(data.lieuNaissance).toBe("Lyon");
  });

  it("lit le PEE et raccourcit les libellés d'épargne", () => {
    expect(data.contratsFinanciers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "EPARGNE_BANCAIRE",
          nom: "Compte courant",
          montant: 30000,
        }),
        expect.objectContaining({
          type: "LIVRET_A",
          nom: "Livret A",
          montant: 4000,
        }),
        expect.objectContaining({
          type: "EPARGNE_SALARIALE",
          nom: "PEE",
          montant: 3500,
        }),
      ])
    );
    expect(data.contratsFinanciers).toHaveLength(3);
    expect(hasPatrimoineToTri(data)).toBe(true);
  });
});

describe("cleanStelliumActifLabel — sigle répété", () => {
  it("garde le nom utile après AV ou PER", () => {
    expect(cleanStelliumActifLabel("Assurance vie", "AV - UFF")).toBe("UFF");
    expect(cleanStelliumActifLabel("Assurance vie", "AV - Carrefour")).toBe("Carrefour");
    expect(cleanStelliumActifLabel("Assurance vie", "Cristalliance Evoluvie")).toBe(
      "Cristalliance Evoluvie"
    );
    expect(cleanStelliumActifLabel("PER", "PER - Swisslife")).toBe("Swisslife");
    expect(cleanStelliumActifLabel("PER", "Pertinence Retraite")).toBe("Pertinence Retraite");
    expect(
      cleanStelliumActifLabel(
        "Résidence principale",
        "Immobilier de jouissance - Résidence principale"
      )
    ).toBe("Résidence principale");
  });
});

describe("mapActifCategoryToProductType — épargne salariale", () => {
  it("regroupe PEE, PERCOL, PEI, PEG, PERCO et PERO", () => {
    for (const sigle of ["PEE", "PERCOL", "PEI", "PEG", "PERCO", "PERO", "PERECO"]) {
      expect(mapActifCategoryToProductType(sigle)).toBe("EPARGNE_SALARIALE");
    }
    expect(mapActifCategoryToProductType("PER")).toBe("PER");
  });
});
