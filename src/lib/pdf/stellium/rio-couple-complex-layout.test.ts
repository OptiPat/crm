import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "./rio-parser";

/** Couple anonymisé : professions décalées, enfant nommé, SCI, actifs coupés. */
const RIO = `
Recueil d'informations
Consultant : Jean DUPONT
Investisseur : Paul LEGRAND et Lea BERNARD
Date d'entrée en relation : 29/06/2026
Identité
Paul LEGRAND	Lea BERNARD
Civilité	Monsieur	Madame
Nom d'usage / prénom	LEGRAND Paul	BERNARD Lea
Nom de naissance	LEGRAND	BERNARD
Né(e) le	01/02/1990 à Lyon - France	03/04/1992 à Nantes - France
Nationalité	Française	Française
Coordonnées
Adresse e-mail	paul.legrand@example.com	lea.bernard@example.com
Téléphone mobile	+33600000021	+33600000022
Adresse postale
69001 Lyon - France	69001 Lyon - France
Relations
Situation matrimoniale	Pacsé(e)
Régime	Séparation de biens
Nombre d'enfants à charge pour Paul LEGRAND : 1
Enfants	Date de naissance	Enfant de	À charge fiscale de
Hugo LEGRAND	17/10/2021 (4 ans)	Paul LEGRAND	Paul LEGRAND
Professionnel
Paul LEGRAND	Lea BERNARD
Directeur investissement immo depuis	Chargé de mission Immo
Profession (ou dernière profession)
le 09/09/2014
Secteur d'activité	-	-
Nom de la société	AGILITEAM	MAIRIE
Patrimoine
Actifs
Désignation	Paul LEGRAND	Lea BERNARD	Total
SCI ou SARL de famille - Foncier - SCI ou
1000000 €	-	1000000 €
SARL de famille
Résidence principale - Immobilier de
400000 €	-	400000 €
jouissance - Résidence principale
Assurance vie - épargne financière -
21410 €	-	21410 €
Assurance vie - Premium
Assurance vie - épargne financière -
5590 €	-	5590 €
Assurance vie - Essentiel
Assurance vie - épargne financière -
6794 €	-	6794 €
Assurance vie - Fortuneo
Compte titres (CTO) - épargne financière
3200 €	-	3200 €
- Compte titres (CTO)
TOTAL	1435994 €	0 €	1435994 €
Passifs
`.trim();

describe("RIO couple — layout complexe", () => {
  const data = parseStelliumRio(RIO);

  it("recolle les professions décalées", () => {
    expect(data.profession).toBe("Directeur investissement immo");
    expect(data.conjoint?.profession).toBe("Chargé de mission Immo");
  });

  it("lit un enfant rattaché à un parent", () => {
    expect(data.enfants).toEqual([
      expect.objectContaining({
        prenom: "Hugo",
        nom: "LEGRAND",
        dateNaissance: "17/10/2021",
      }),
    ]);
  });

  it("prend la SCI en parts de société sur la première personne", () => {
    const sci = data.contratsFinanciers?.find((c) => c.type === "PARTS_SOCIETE");
    expect(sci).toMatchObject({
      nom: "SCI ou SARL de famille",
      montant: 1_000_000,
      rioOwnerHint: "person1",
    });
  });

  it("garde le nom des assurances-vie coupées et le compte-titres", () => {
    const rows = (data.contratsFinanciers ?? []).map((c) => ({
      type: c.type,
      nom: c.nom,
      montant: c.montant,
      owner: c.rioOwnerHint,
    }));
    expect(rows).toEqual(
      expect.arrayContaining([
        { type: "ASSURANCE_VIE", nom: "Premium", montant: 21410, owner: "person1" },
        { type: "ASSURANCE_VIE", nom: "Essentiel", montant: 5590, owner: "person1" },
        { type: "ASSURANCE_VIE", nom: "Fortuneo", montant: 6794, owner: "person1" },
        { type: "COMPTE_TITRE", nom: "Compte titres (CTO)", montant: 3200, owner: "person1" },
      ])
    );
    const rp = data.biensImmobiliers?.find((b) => b.type === "RESIDENCE_PRINCIPALE");
    expect(rp).toMatchObject({ nom: "Résidence principale", valeur: 400000, rioOwnerHint: "person1" });
  });
});
