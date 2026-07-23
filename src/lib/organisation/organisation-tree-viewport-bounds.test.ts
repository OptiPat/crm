import { describe, expect, it } from "vitest";
import { clampOrganisationTreeViewportPan } from "@/lib/organisation/organisation-tree-viewport-bounds";

describe("clampOrganisationTreeViewportPan", () => {
  const pad = 24;

  it("centre horizontalement et aligne en bas quand le contenu est plus petit que le cadre", () => {
    const result = clampOrganisationTreeViewportPan(0, 0, 1, 800, 600, 400, 300, pad);
    expect(result.panX).toBe(200);
    expect(result.panY).toBe(600 - pad - 300);
  });

  it("empêche de sortir à gauche ou à droite quand le contenu est plus large", () => {
    const minX = 800 - 2000 - pad;
    const tooFarLeft = clampOrganisationTreeViewportPan(-2000, 0, 1, 800, 600, 2000, 300, pad);
    expect(tooFarLeft.panX).toBe(minX);

    const tooFarRight = clampOrganisationTreeViewportPan(500, 0, 1, 800, 600, 2000, 300, pad);
    expect(tooFarRight.panX).toBe(pad);

    const inBounds = clampOrganisationTreeViewportPan(-500, 0, 1, 800, 600, 2000, 300, pad);
    expect(inBounds.panX).toBe(-500);
  });

  it("empêche de sortir en haut ou en bas quand le contenu est plus haut", () => {
    const tooHigh = clampOrganisationTreeViewportPan(0, 500, 1, 800, 600, 400, 1200, pad);
    expect(tooHigh.panY).toBe(pad);

    const tooLow = clampOrganisationTreeViewportPan(0, -900, 1, 800, 600, 400, 1200, pad);
    expect(tooLow.panY).toBe(600 - 1200 - pad);
  });

  it("prend en compte le zoom sur les dimensions affichées", () => {
    const result = clampOrganisationTreeViewportPan(1000, 0, 2, 800, 600, 500, 200, pad);
    expect(result.panX).toBeLessThanOrEqual(pad);
    expect(result.panX).toBeGreaterThanOrEqual(800 - 500 * 2 - pad);
  });
});
