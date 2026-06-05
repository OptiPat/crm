import { describe, it, expect } from "vitest";
import {
  validateEtiquetteForm,
  type EtiquetteFormValidationInput,
} from "./etiquette-form-validation";

const base: EtiquetteFormValidationInput = {
  nom: "Relance",
  emailActif: false,
  emailTemplateId: null,
  emailEnvoiMode: "eligibility",
  emailEnvoiHeure: "09:00",
  emailEnvoiLocal: "",
  actif: true,
  isAuto: false,
  segmentId: null,
  useComboRule: false,
  categoriesSelectionnees: ["CLIENT"],
  ruleChildren: [],
  conditionType: "DELAI_SANS_CONTACT",
  typesProduitSelectionnes: [],
};

describe("validateEtiquetteForm", () => {
  it("valide un formulaire correct (null)", () => {
    expect(validateEtiquetteForm(base)).toBeNull();
  });

  it("nom obligatoire", () => {
    expect(validateEtiquetteForm({ ...base, nom: "  " })).toMatch(/nom/i);
  });

  it("email actif sans template", () => {
    expect(
      validateEtiquetteForm({ ...base, emailActif: true, emailTemplateId: null })
    ).toMatch(/template/i);
  });

  it("email éligibilité sans heure", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        emailActif: true,
        emailTemplateId: 1,
        emailEnvoiMode: "eligibility",
        emailEnvoiHeure: "",
      })
    ).toMatch(/heure/i);
  });

  it("email fixe sans date", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        emailActif: true,
        emailTemplateId: 1,
        emailEnvoiMode: "fixed",
        emailEnvoiLocal: "",
      })
    ).toMatch(/date/i);
  });

  it("auto sans catégorie", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        categoriesSelectionnees: [],
      })
    ).toMatch(/catégorie/i);
  });

  it("combo : une condition sans catégorie", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        useComboRule: true,
        ruleChildren: [{ categories: ["CLIENT"] }, { categories: [] }],
      })
    ).toMatch(/condition combinée/i);
  });

  it("type produit sans type sélectionné", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        conditionType: "TYPE_PRODUIT",
        typesProduitSelectionnes: [],
      })
    ).toMatch(/type de produit/i);
  });

  it("segment lié : pas d'exigence de catégorie", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        segmentId: 5,
        categoriesSelectionnees: [],
      })
    ).toBeNull();
  });
});
