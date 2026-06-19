import { describe, expect, it } from "vitest";
import { parseEpargnePrecaution } from "./rio-epargne-precaution";

describe("parseEpargnePrecaution", () => {
  it("extrait une valeur unique (solo, espaces PDF.js)", () => {
    const text =
      "Préparer votre retraite Paul LEGRAND 2 - " +
      "Epargne de précaution souhaitée   20   000   €  MENTIONS RESERVEES";
    expect(parseEpargnePrecaution(text)).toEqual({ person1: 20000 });
  });

  it("extrait deux valeurs (couple, une colonne par personne)", () => {
    const text =
      "Marc ROUSSEAU   Anne ROUSSEAU  " +
      "Epargne de précaution souhaitée   15   000   €   15   000   €  " +
      "Effort d’épargne mensuel   0   €   0   €";
    expect(parseEpargnePrecaution(text)).toEqual({
      person1: 15000,
      person2: 15000,
    });
  });

  it("gère des montants différents par personne", () => {
    const text =
      "Epargne de précaution souhaitée 12 000 € 8 000 € Effort d’épargne mensuel";
    expect(parseEpargnePrecaution(text)).toEqual({
      person1: 12000,
      person2: 8000,
    });
  });

  it("retourne vide si absent", () => {
    expect(parseEpargnePrecaution("Aucune section pertinente ici")).toEqual({});
  });

  it("ignore une valeur nulle", () => {
    expect(parseEpargnePrecaution("Epargne de précaution souhaitée 0 €")).toEqual({});
  });
});
