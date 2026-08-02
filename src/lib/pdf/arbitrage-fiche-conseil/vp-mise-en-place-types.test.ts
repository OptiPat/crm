import { describe, expect, it } from "vitest";
import { toVpMiseEnPlacePdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";

describe("vp-mise-en-place-types", () => {
  it("convertit montant et fréquence pour le PDF", () => {
    expect(
      toVpMiseEnPlacePdfFillInput({ montantEuros: "200", frequence: "MENSUEL" })
    ).toEqual({
      montantCentimes: 20000,
      frequence: "MENSUEL",
    });
  });

  it("ignore la fréquence seule sans montant", () => {
    expect(
      toVpMiseEnPlacePdfFillInput({ montantEuros: "", frequence: "MENSUEL" })
    ).toBeUndefined();
  });
});
