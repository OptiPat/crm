import { describe, expect, it } from "vitest";
import {
  isStelliumLabelAllowedForProduct,
  stelliumSuiviActLabelGroups,
} from "./stellium-box-placement-labels";
import { VERSEMENT_COMPLEMENTAIRE_ACT_LABEL } from "@/lib/pipe/pipe-suivi";
import {
  mapSuiviStelliumActRowToInput,
  mapSuiviStelliumActRowsToInputs,
  validateSuiviStelliumActInput,
  validateSuiviStelliumActs,
} from "./suivi-stellium-acts";

describe("suivi-stellium-acts", () => {
  it("exige montant pour versement complémentaire", () => {
    expect(
      validateSuiviStelliumActInput({
        productLabel: "",
        actLabel: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
      })
    ).toBe("Montant souscrit requis pour le versement complémentaire.");
    expect(
      validateSuiviStelliumActInput({
        productLabel: "",
        actLabel: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
        montantCentimes: 1_000_000,
      })
    ).toBeNull();
  });

  it("mappe le montant euros du formulaire avant validation (versement complémentaire)", () => {
    const input = mapSuiviStelliumActRowToInput({
      productLabel: "Cristalliance Evoluvie",
      actLabel: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
      montantEuros: "6250",
    });
    expect(input.montantCentimes).toBe(625_000);
    expect(validateSuiviStelliumActInput(input)).toBeNull();
    expect(
      validateSuiviStelliumActs(
        mapSuiviStelliumActRowsToInputs([
          {
            productLabel: "Cristalliance Evoluvie",
            actLabel: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
            montantEuros: "6250",
          },
        ])
      )
    ).toBeNull();
  });

  it("refuse versement complémentaire sur SCPI", () => {
    expect(
      validateSuiviStelliumActInput({
        productLabel: "Comète",
        actLabel: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
      })
    ).toBe("Versement complémentaire non applicable aux SCPI.");
  });

  it("exige produit pour un acte Stellium classique", () => {
    expect(
      validateSuiviStelliumActInput({
        productLabel: "",
        actLabel: "Arbitrage libre",
      })
    ).toBe("Produit requis pour cet acte.");
  });

  it("exige au moins un acte", () => {
    expect(validateSuiviStelliumActs([{ productLabel: "", actLabel: "" }])).toBe(
      "Ajoutez au moins un acte Stellium."
    );
  });
});

describe("stellium suivi dropdown", () => {
  it("propose versement complémentaire dans Versements", () => {
    const groups = stelliumSuiviActLabelGroups("");
    expect(groups[0]?.id).toBe("versements-programmes");
    expect(groups[0]?.label).toBe("Versements");
    expect(groups[0]?.items[0]).toBe(VERSEMENT_COMPLEMENTAIRE_ACT_LABEL);
    expect(
      isStelliumLabelAllowedForProduct(VERSEMENT_COMPLEMENTAIRE_ACT_LABEL, "", { suivi: true })
    ).toBe(true);
  });
});
