import { describe, expect, it } from "vitest";
import { resolveStelliumPerProductLabelFromCrm } from "@/lib/pdf/arbitrage-fiche-conseil/per-stellium-product-map";

describe("resolveStelliumPerProductLabelFromCrm", () => {
  it("mappe EvoluPER depuis nom produit ou partenaire Apicil", () => {
    expect(
      resolveStelliumPerProductLabelFromCrm({
        nomProduit: "EvoluPER",
        partenaireNom: null,
      })
    ).toBe("Cristalliance EvoluPER");
    expect(
      resolveStelliumPerProductLabelFromCrm({
        nomProduit: "Contrat retraite",
        partenaireNom: "Apicil",
      })
    ).toBe("Cristalliance EvoluPER");
  });

  it("mappe PER Opportunités et Spirica", () => {
    expect(
      resolveStelliumPerProductLabelFromCrm({
        nomProduit: "PER",
        partenaireNom: "Oddo",
      })
    ).toBe("Cristalliance PER Opportunités");
    expect(
      resolveStelliumPerProductLabelFromCrm({
        nomProduit: "PER ERES",
        partenaireNom: "Spirica",
      })
    ).toBe("PER ERES BY Spirica");
  });

  it("accepte un libellé catalogue déjà exact", () => {
    expect(
      resolveStelliumPerProductLabelFromCrm({
        nomProduit: "Cristalliance EvoluPER",
        partenaireNom: null,
      })
    ).toBe("Cristalliance EvoluPER");
  });

  it("retourne null si inconnu", () => {
    expect(
      resolveStelliumPerProductLabelFromCrm({
        nomProduit: "Produit X",
        partenaireNom: "Assureur Y",
      })
    ).toBeNull();
  });
});
