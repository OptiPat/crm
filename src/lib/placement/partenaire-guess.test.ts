import { describe, expect, it } from "vitest";
import { guessPartenaireIdForProduct } from "./partenaire-guess";
import { souscriptionExtrasFromOperation, souscriptionExtrasToPayload } from "./souscription-details";

const partenaires = [
  { id: 1, raison_sociale: "Corum Asset Management" },
  { id: 2, raison_sociale: "Swiss Life" },
  { id: 3, raison_sociale: "Primonial REIM" },
];

describe("guessPartenaireIdForProduct", () => {
  it("reprend le partenaire des placements existants du même produit", () => {
    expect(
      guessPartenaireIdForProduct("Cristalliance Avenir", partenaires, [
        { nom_produit: "Cristalliance Avenir", partenaire_id: 2 },
        { nom_produit: "cristalliance avenir", partenaire_id: 2 },
        { nom_produit: "Cristalliance Avenir", partenaire_id: 3 },
      ])
    ).toBe(2);
  });

  it("sinon devine par le nom du partenaire", () => {
    expect(guessPartenaireIdForProduct("Corum Origin", partenaires, [])).toBe(1);
  });

  it("ne devine rien en cas de doute", () => {
    expect(guessPartenaireIdForProduct("Comète", partenaires, [])).toBeNull();
    expect(
      guessPartenaireIdForProduct("Epargne Pierre", partenaires, [
        { nom_produit: "Epargne Pierre", partenaire_id: 2 },
        { nom_produit: "Epargne Pierre", partenaire_id: 3 },
      ])
    ).toBeNull();
  });
});

describe("partenaire dans les détails de souscription", () => {
  it("aller-retour opération → saisie → payload", () => {
    const extras = souscriptionExtrasFromOperation({ partenaire_id: 7 });
    expect(extras.partenaireId).toBe(7);
    const result = souscriptionExtrasToPayload(extras, "SCPI");
    expect("payload" in result && result.payload.partenaire_id).toBe(7);
  });
});
