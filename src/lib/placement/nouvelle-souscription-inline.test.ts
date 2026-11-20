import { describe, expect, it } from "vitest";
import {
  buildNouvelleSouscriptionOperationInputs,
  newNouvelleSouscriptionDraft,
  validateNouvelleSouscriptionDrafts,
} from "./nouvelle-souscription-inline";
import { validateSuiviStelliumActInput } from "./suivi-stellium-acts";
import { NOUVELLE_SOUSCRIPTION_ACT_LABEL } from "@/lib/pipe/pipe-suivi";

const draft = (productLabel: string, montantEuros: string) => ({
  ...newNouvelleSouscriptionDraft(),
  productLabel,
  montantEuros,
});

describe("nouvelle souscription saisie à la création du Suivi", () => {
  it("ignore les lignes vides, exige produit et montant sur une ligne entamée", () => {
    expect(validateNouvelleSouscriptionDrafts([newNouvelleSouscriptionDraft()])).toBeNull();
    expect(validateNouvelleSouscriptionDrafts([draft("Corum Origin", "")])).toMatch(/montant/);
    expect(
      validateNouvelleSouscriptionDrafts([draft("Corum Origin", "10000"), draft("", "5000")])
    ).toMatch(/Souscription 2 : produit/);
  });

  it("valide via l'acte Suivi « Nouvelle souscription »", () => {
    expect(
      validateSuiviStelliumActInput({
        productLabel: "",
        actLabel: NOUVELLE_SOUSCRIPTION_ACT_LABEL,
        souscriptions: [draft("Corum Origin", "")],
      })
    ).toMatch(/montant/);
  });

  it("crée une souscription partenaire par ligne remplie sur l'affaire enfant", () => {
    const inputs = buildNouvelleSouscriptionOperationInputs(
      [draft("Corum Origin", "10000"), newNouvelleSouscriptionDraft(), draft("Comète", "5000,50")],
      { contactId: 3, pipeId: 42 }
    );
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      contact_id: 3,
      pipe_id: 42,
      operation_type: "SOUSCRIPTION",
      stellium_label: "Souscription",
      product_label: "Corum Origin",
      montant_centimes: 1_000_000,
      holder_contact_id: null,
      holder_foyer_id: null,
    });
    expect(inputs[1]?.montant_centimes).toBe(500_050);
  });
});

describe("nouvelle souscription — même produit deux fois", () => {
  it("accepte deux lignes du même produit, chacune créée à part (force_new)", () => {
    const drafts = [
      draft("Cristalliance Avenir", "70000"),
      draft("Cristalliance Avenir", "50"),
    ];
    expect(validateNouvelleSouscriptionDrafts(drafts)).toBeNull();
    const inputs = buildNouvelleSouscriptionOperationInputs(drafts, { contactId: 3, pipeId: 42 });
    expect(inputs.map((i) => i.montant_centimes)).toEqual([7_000_000, 5_000]);
    expect(inputs.every((i) => i.force_new === true)).toBe(true);
  });
});
