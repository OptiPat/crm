import { describe, expect, it } from "vitest";
import {
  normalizeStelliumBoxPlacementLabel,
  placementOperationTypeFromStelliumLabel,
  stelliumBoxPlacementLabelsMatch,
  stelliumLabelGroupsForProduct,
  isStelliumLabelAllowedForProduct,
  STELLIUM_BOX_PLACEMENT_LABELS,
} from "@/lib/placement/stellium-box-placement-labels";

describe("stellium-box-placement-labels", () => {
  it("normalise accents et espaces", () => {
    expect(normalizeStelliumBoxPlacementLabel("  Arbitrage libre ")).toBe("arbitrage libre");
    expect(normalizeStelliumBoxPlacementLabel("Modification administrative : RIB")).toBe(
      "modification administrative : rib"
    );
  });

  it("matche déclaration et mail", () => {
    expect(
      stelliumBoxPlacementLabelsMatch(
        "Modification administrative : RIB",
        "Modification administrative : RIB"
      )
    ).toBe(true);
    expect(
      stelliumBoxPlacementLabelsMatch("Arbitrage libre", "Modification administrative : RIB")
    ).toBe(false);
  });

  it("mappe le type email grossier", () => {
    expect(placementOperationTypeFromStelliumLabel("Arbitrage libre")).toBe("ARBITRAGE");
    expect(placementOperationTypeFromStelliumLabel("Modification administrative : RIB")).toBe(
      "AUTRE"
    );
    expect(
      placementOperationTypeFromStelliumLabel("Versements programmés : Mise en place")
    ).toBe("VERSEMENT");
  });

  it("contient les libellés gestion et SCPI", () => {
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain("Arbitrage libre");
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain("Modification administrative : RIB");
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain("Cession de parts");
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain(
      "Modification administrative : adresse / nom / RIB"
    );
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain(
      "Réinvestissements des dividendes : Mise en place"
    );
    expect(STELLIUM_BOX_PLACEMENT_LABELS).not.toContain("Versement complémentaire");
  });

  it("mappe réinvestissement dividendes SCPI", () => {
    expect(
      placementOperationTypeFromStelliumLabel("Réinvestissements des dividendes : Modification")
    ).toBe("REINVESTISSEMENT");
  });

  it("filtre les actes selon le produit", () => {
    const scpiGroups = stelliumLabelGroupsForProduct("Comète");
    expect(scpiGroups).toHaveLength(1);
    expect(scpiGroups[0]?.id).toBe("scpi");
    expect(scpiGroups[0]?.items).toContain("Cession de parts");
    expect(scpiGroups[0]?.items).not.toContain("Arbitrage libre");

    const avGroups = stelliumLabelGroupsForProduct("Cristalliance Avenir");
    expect(avGroups.some((g) => g.id === "arbitrages")).toBe(true);
    expect(avGroups.some((g) => g.id === "scpi")).toBe(false);
    expect(isStelliumLabelAllowedForProduct("Arbitrage libre", "Cristalliance Avenir")).toBe(true);
    expect(isStelliumLabelAllowedForProduct("Cession de parts", "Cristalliance Avenir")).toBe(
      false
    );
  });
});
