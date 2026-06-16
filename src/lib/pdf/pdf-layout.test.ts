import { describe, expect, it } from "vitest";
import {
  groupPdfTextItemsIntoLines,
  lineHasStelliumColumnLayout,
  reconstructPageTextFromItems,
} from "./pdf-layout";

describe("pdf-layout", () => {
  it("sépare deux colonnes Stellium par tabulation", () => {
    const lines = groupPdfTextItemsIntoLines([
      { str: "Salaires", transform: [1, 0, 0, 1, 10, 100], width: 50 },
      { str: "80 923 €", transform: [1, 0, 0, 1, 200, 100], width: 60 },
      { str: "80 923 €", transform: [1, 0, 0, 1, 320, 100], width: 60 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("\t");
    expect(lines[0]).toMatch(/Salaires\t80 923 €/);
  });

  it("regroupe les mots proches sur une même ligne", () => {
    const text = reconstructPageTextFromItems([
      { str: "Recueil", transform: [1, 0, 0, 1, 10, 200], width: 40 },
      { str: "d'informations", transform: [1, 0, 0, 1, 55, 200], width: 80 },
    ]);
    expect(text).toBe("Recueil d'informations");
  });

  it("détecte une ligne tableau Stellium", () => {
    expect(lineHasStelliumColumnLayout("D'activité\t80 923 €\t80 923 €")).toBe(true);
    expect(lineHasStelliumColumnLayout("Salaires 80923")).toBe(false);
  });
});
