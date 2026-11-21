import { describe, expect, it } from "vitest";
import {
  formatStelliumProductForDisplay,
  isKnownStelliumBoxPlacementProduct,
  normalizeStelliumBoxPlacementProduct,
  stelliumBoxPlacementProductsMatch,
  stelliumProductFamilyIdForProduct,
  stelliumProductGroupsForSelect,
  STELLIUM_BOX_PLACEMENT_PRODUCTS,
} from "@/lib/placement/stellium-box-placement-products";

describe("stellium-box-placement-products", () => {
  it("contient les familles fournies", () => {
    expect(STELLIUM_BOX_PLACEMENT_PRODUCTS).toContain("Cristalliance Avenir");
    expect(STELLIUM_BOX_PLACEMENT_PRODUCTS).toContain("PER ERES BY Swisslife");
    expect(STELLIUM_BOX_PLACEMENT_PRODUCTS).toContain("Comète");
    expect(STELLIUM_BOX_PLACEMENT_PRODUCTS).not.toContain("Comète (ALPSI)");
  });

  it("ignore ALPSI et CIF au matching", () => {
    expect(
      stelliumBoxPlacementProductsMatch("Comète", "Comète (ALPSI)")
    ).toBe(true);
    expect(
      stelliumBoxPlacementProductsMatch("Activimmo", "Activimmo ALPSI")
    ).toBe(true);
    expect(
      stelliumBoxPlacementProductsMatch("Corum Origin", "Corum Origin CIF")
    ).toBe(true);
    expect(
      stelliumBoxPlacementProductsMatch("Cristalliance Avenir", "Cristalliance EvoluPER")
    ).toBe(false);
  });

  it("normalise accents et espaces", () => {
    expect(normalizeStelliumBoxPlacementProduct("  Cristalliance Opportunités ")).toBe(
      "cristalliance opportunites"
    );
  });

  it("formate le produit client sans ALPSI/CIF", () => {
    expect(formatStelliumProductForDisplay("Comète (ALPSI)")).toBe("Comète");
    expect(formatStelliumProductForDisplay("Cristalliance Avenir")).toBe(
      "Cristalliance Avenir"
    );
  });
});

describe("produits retirés de la commercialisation", () => {
  it("LF Avenir Santé n'est plus dans les menus mais reste reconnue", () => {
    const menu = stelliumProductGroupsForSelect().flatMap((g) => g.items);
    expect(menu).not.toContain("LF Avenir Santé");
    expect(menu).toContain("Comète");
    expect(stelliumProductFamilyIdForProduct("LF Avenir Santé")).toBe("scpi");
    expect(isKnownStelliumBoxPlacementProduct("LF Avenir Santé")).toBe(true);
  });

  it("garde LF Avenir Santé dans le menu si elle est déjà choisie", () => {
    const menu = stelliumProductGroupsForSelect("LF Avenir Santé").flatMap((g) => g.items);
    expect(menu).toContain("LF Avenir Santé");
  });
});
