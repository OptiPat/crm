import { describe, expect, it } from "vitest";
import { computePageBreaks, safeCutPositions } from "@/lib/pdf/element-pdf-capture";

describe("safeCutPositions", () => {
  it("coupe au milieu de l'espace entre deux blocs", () => {
    expect(
      safeCutPositions([
        { top: 0, bottom: 100 },
        { top: 120, bottom: 200 },
      ])
    ).toEqual([110, 200]);
  });

  it("garde le bas du bloc si le suivant colle ou est trop loin", () => {
    expect(
      safeCutPositions([
        { top: 0, bottom: 100 },
        { top: 100, bottom: 150 },
        { top: 400, bottom: 450 },
      ])
    ).toEqual([100, 150, 450]);
  });

  it("ignore les blocs parents qui englobent le suivant", () => {
    // Section (0–300) contenant un paragraphe (10–100) : le prochain début après 100 est 320.
    expect(
      safeCutPositions([
        { top: 0, bottom: 300 },
        { top: 10, bottom: 100 },
        { top: 320, bottom: 400 },
      ])
    ).toEqual([310, 100, 400]);
  });
});

describe("computePageBreaks", () => {
  it("garde une seule page quand tout tient", () => {
    expect(computePageBreaks([100, 200], 500, 1000)).toEqual([500]);
  });

  it("coupe au bas du dernier bloc qui tient dans la page", () => {
    // Page de 1000 px : le paragraphe qui finit à 1040 passe à la page suivante.
    expect(computePageBreaks([300, 650, 980, 1040, 1700, 2100], 2100, 1000)).toEqual([
      980, 1700, 2100,
    ]);
  });

  it("coupe net si un bloc géant dépasse la page", () => {
    expect(computePageBreaks([100, 2500], 2500, 1000)).toEqual([1000, 2000, 2500]);
  });

  it("refuse une page à moitié vide : ignore un bloc qui finit trop tôt", () => {
    // Seul bloc avant la limite : 200 px (moins d'une demi-page) → coupe nette.
    expect(computePageBreaks([200, 1600], 1600, 1000)).toEqual([1000, 1600]);
  });

  it("supporte un document vide", () => {
    expect(computePageBreaks([], 0, 1000)).toEqual([0]);
  });
});
