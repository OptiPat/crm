import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "./rio-parser";

/** Couple anonymisé : colonnes décalées, libellés coupés, colonne « - » vide. */
const RIO = `
Recueil d'informations
Consultant : Jean DUPONT
Investisseur : Lea BERNARD et Luc LEGRAND
Date d'entrée en relation : 08/09/2026
Identité
Lea BERNARD	Luc NOM2
Civilité	Madame	Monsieur
Nom d'usage / prénom	BERNARD Lea	LEGRAND Luc
Nom de naissance	BERNARD	LEGRAND
12/03/1992 à Lyon () -
Né(e) le	04/08/1994 à Nantes () - France
France
Nationalité	Française	Française
Coordonnées
Lea BERNARD	Luc NOM2
Adresse e-mail	lea.bernard@example.com	luc.legrand@example.com
Téléphone mobile	+33600000011	+33600000012
Autre téléphone	-	-
4 impasse des Lilas	4 impasse des Lilas
Adresse postale
38000 Grenoble - France	38000 Grenoble - France
Pays de résidence fiscale	France	France
Statut d'occupation du
Propriétaire	Propriétaire
logement
Relations
Situation matrimoniale	Pacsé(e)
Régime	Séparation de biens
Nombre d'enfants à charge : 2
Enfants	Date de naissance	Enfant de	À charge fiscale de
Lina BERNARD	05/12/2022 (3 ans)	Commun	Commun
Noe BERNARD	12/02/2026 (0 ans)	Commun	Commun
Professionnel
Lea BERNARD	Luc NOM2
Profession (ou dernière profession)	Kiné	Kiné
Secteur d'activité	-	-
Nom de la société	-	-
Patrimoine
Actifs
Désignation	Lea BERNARD	Luc LEGRAND	Total
Résidence principale - Immobilier de
220000 €	220000 €	440000 €
jouissance - Résidence principale
LMNP Classique - Immobilier locatif -
95000 €	95000 €	190000 €
LMNP Chambery
Livret A - Épargne bancaire - Livret A	6000 €	-	6000 €
Livret A - Épargne bancaire - Livret A	-	13000 €	13000 €
LDD - Épargne bancaire - LDD	-	6000 €	6000 €
Assurance vie - Assurance vie BNP	3784 €	-	3784 €
Assurance vie - Assurance vie	-	1000 €	1000 €
PER - Épargne retraite et salariale - PER	4040 €	-	4040 €
PER - Épargne retraite et salariale - PER	-	2545 €	2545 €
TOTAL	329000 €	337000 €	666000 €
Passifs
Objectifs
Objectif(s)	Attribué à	Priorité	Horizon
Recueil d'informations - Lea BERNARD et Luc LEGRAND - 22/09/2026	5/7
Optimiser la rentabilité de votre	Lea BERNARD & Luc LEGRAND
1	-
patrimoine
Préparer votre retraite	Lea BERNARD & Luc LEGRAND	2	-
Epargne de précaution souhaitée	10000 €	15000 €
`.trim();

describe("RIO couple — colonnes décalées 2026", () => {
  const data = parseStelliumRio(RIO);

  it("remet chaque naissance sur la bonne personne", () => {
    expect(data.prenom).toBe("Lea");
    expect(data.nom).toBe("BERNARD");
    expect(data.dateNaissance).toBe("12/03/1992");
    expect(data.lieuNaissance).toBe("Lyon");
    expect(data.conjoint?.prenom).toBe("Luc");
    expect(data.conjoint?.dateNaissance).toBe("04/08/1994");
    expect(data.conjoint?.lieuNaissance).toBe("Nantes");
  });

  it("borne la profession et lit le statut propriétaire", () => {
    expect(data.profession).toBe("Kiné");
    expect(data.conjoint?.profession).toBe("Kiné");
    expect(data.statutOccupationLogement).toBe("PROPRIETAIRE");
    expect(data.conjoint?.statutOccupationLogement).toBe("PROPRIETAIRE");
  });

  it("lit les enfants malgré l'âge entre parenthèses", () => {
    expect(data.enfants).toEqual([
      expect.objectContaining({ prenom: "Lina", nom: "BERNARD", dateNaissance: "05/12/2022" }),
      expect.objectContaining({ prenom: "Noe", nom: "BERNARD", dateNaissance: "12/02/2026" }),
    ]);
  });

  it("nomme les biens et attribue chaque contrat à la bonne colonne", () => {
    expect(data.biensImmobiliers?.map((bien) => ({
      type: bien.type,
      nom: bien.nom,
      valeur: bien.valeur,
    }))).toEqual([
      { type: "RESIDENCE_PRINCIPALE", nom: "Résidence principale", valeur: 440000 },
      { type: "LMNP", nom: "LMNP Chambery", valeur: 190000 },
    ]);

    const byKey = (data.contratsFinanciers ?? []).map((contrat) => ({
      type: contrat.type,
      nom: contrat.nom,
      montant: contrat.montant,
      owner: contrat.rioOwnerHint,
    }));
    expect(byKey).toEqual([
      { type: "LIVRET_A", nom: "Livret A", montant: 6000, owner: "person1" },
      { type: "LIVRET_A", nom: "Livret A", montant: 13000, owner: "person2" },
      { type: "LDDS", nom: "LDD", montant: 6000, owner: "person2" },
      { type: "ASSURANCE_VIE", nom: "Assurance vie BNP", montant: 3784, owner: "person1" },
      { type: "ASSURANCE_VIE", nom: "Assurance vie", montant: 1000, owner: "person2" },
      { type: "PER", nom: "PER", montant: 4040, owner: "person1" },
      { type: "PER", nom: "PER", montant: 2545, owner: "person2" },
    ]);
  });

  it("ignore le pied de page collé au premier objectif", () => {
    expect(data.objectifsPrincipaux?.[0]).toBe(
      "Optimiser la rentabilité de votre patrimoine"
    );
    expect(data.objectifsPrincipaux).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/Recueil d'informations/i)])
    );
  });
});
