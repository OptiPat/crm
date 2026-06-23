import { describe, expect, it } from "vitest";
import {
  buildTypeProduitConditionConfig,
  isTypeProduitConditionValid,
  parseTypeProduitConditionConfig,
} from "./type-produit-condition";

describe("type-produit-condition", () => {
  it("construit la config avec noms optionnels", () => {
    expect(buildTypeProduitConditionConfig(["SCPI"], ["Epargne Pierre"])).toEqual({
      types: ["SCPI"],
      noms_produit: ["Epargne Pierre"],
    });
    expect(buildTypeProduitConditionConfig(["SCPI"], [])).toEqual({
      types: ["SCPI"],
      noms_produit: undefined,
    });
  });

  it("valide si au moins un filtre", () => {
    expect(isTypeProduitConditionValid([], [])).toBe(false);
    expect(isTypeProduitConditionValid(["SCPI"], [])).toBe(true);
    expect(isTypeProduitConditionValid([], ["Epargne Pierre"])).toBe(true);
  });

  it("parse types et noms", () => {
    expect(
      parseTypeProduitConditionConfig({
        types: ["SCPI"],
        noms_produit: ["Comète"],
      })
    ).toEqual({
      types: ["SCPI"],
      nomsProduit: ["Comète"],
    });
  });
});
