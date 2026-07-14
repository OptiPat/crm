import { describe, expect, it } from "vitest";
import {
  normalizeStelliumBoxPlacementLabel,
  placementOperationTypeFromStelliumLabel,
  stelliumBoxPlacementLabelsMatch,
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

  it("contient les libellés gestion fournis (hors SCPI)", () => {
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain("Arbitrage libre");
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain("Modification administrative : RIB");
    expect(STELLIUM_BOX_PLACEMENT_LABELS).not.toContain("Versement complémentaire");
  });
});
