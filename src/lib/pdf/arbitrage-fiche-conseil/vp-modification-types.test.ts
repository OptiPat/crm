import { describe, expect, it } from "vitest";
import { toVpModificationPdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";

describe("vp-modification-types", () => {
  it("ne produit un remplissage PDF que si au moins un type est coché", () => {
    expect(
      toVpModificationPdfFillInput({ kinds: [], montantEuros: "100", frequence: "MENSUEL" })
    ).toBeUndefined();
    expect(
      toVpModificationPdfFillInput({
        kinds: ["allocation"],
        montantEuros: "",
        frequence: "MENSUEL",
      })
    ).toEqual({ kinds: ["allocation"], montantCentimes: null, frequence: null });
    expect(
      toVpModificationPdfFillInput({
        kinds: ["montant"],
        montantEuros: "150",
        frequence: "MENSUEL",
      })
    ).toEqual({ kinds: ["montant"], montantCentimes: 150_00, frequence: null });
  });
});
