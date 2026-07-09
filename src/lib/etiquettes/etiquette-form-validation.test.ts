import { describe, it, expect } from "vitest";
import {
  validateEtiquetteForm,
  validateEtiquetteFormDetailed,
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
  useGroupRule: false,
  useComboRule: false,
  categoriesSelectionnees: ["CLIENT"],
  ruleChildren: [],
  conditionType: "DELAI_SANS_CONTACT",
  typesProduitSelectionnes: [],
  nomsProduitSelectionnes: [],
  tmiTranchesSelectionnees: [],
  irNetMontant: null,
  revenusAnnuelsMontant: null,
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

  it("Exceltis : email actif sans date fixe (déclencheur Stellium)", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        nom: "Exceltis Rendement — Février 2025",
        emailActif: true,
        emailTemplateId: 1,
        emailEnvoiMode: "fixed",
        emailEnvoiLocal: "",
      })
    ).toBeNull();
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
        useGroupRule: false,
        useComboRule: true,
        ruleChildren: [{ categories: ["CLIENT"] }, { categories: [] }],
      })
    ).toMatch(/condition combinée/i);
  });

  it("type produit sans type ni nom sélectionné", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        conditionType: "TYPE_PRODUIT",
        typesProduitSelectionnes: [],
        nomsProduitSelectionnes: [],
      })
    ).toMatch(/type ou un nom/i);
  });

  it("type produit avec nom seulement", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        conditionType: "TYPE_PRODUIT",
        typesProduitSelectionnes: [],
        nomsProduitSelectionnes: ["Epargne Pierre"],
      })
    ).toBeNull();
  });

  it("combo type produit sans type ni nom", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        useComboRule: true,
        ruleChildren: [
          {
            categories: ["CLIENT"],
            type: "TYPE_PRODUIT",
            config: { types: [], noms_produit: [] },
          },
        ],
      })
    ).toMatch(/type ou un nom/i);
  });

  it("segment lié : pas d'exigence de catégorie", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        useGroupRule: true,
        segmentId: 5,
        categoriesSelectionnees: [],
      })
    ).toBeNull();
  });

  it("mode groupe sans sélection", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        useGroupRule: true,
        segmentId: null,
      })
    ).toMatch(/groupe de contacts/i);
  });

  it("combo TMI sans tranche", () => {
    expect(
      validateEtiquetteForm({
        ...base,
        isAuto: true,
        useComboRule: true,
        ruleChildren: [{ type: "TMI", config: { tranches: [] }, categories: ["CLIENT"] }],
      })
    ).toMatch(/tranche TMI/i);
  });

  it("detailed : email sans template → onglet email", () => {
    const err = validateEtiquetteFormDetailed({
      ...base,
      emailActif: true,
      emailTemplateId: null,
    });
    expect(err?.tab).toBe("email");
    expect(err?.fieldId).toBe("email-template");
  });
});
