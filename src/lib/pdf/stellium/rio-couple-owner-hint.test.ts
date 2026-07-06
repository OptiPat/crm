import { describe, expect, it } from "vitest";
import { inferCoupleLineOwner } from "./rio-couple";

describe("inferCoupleLineOwner", () => {
  it("distingue investisseur 1 seul", () => {
    expect(inferCoupleLineOwner([10_000, undefined, 10_000], false)).toBe("person1");
  });

  it("distingue investisseur 2 seul", () => {
    expect(inferCoupleLineOwner([undefined, 8_000, 8_000], false)).toBe("person2");
  });

  it("marque foyer si les deux colonnes sont renseignées", () => {
    expect(inferCoupleLineOwner([50_000, 250_000, 300_000], false)).toBe("foyer");
  });

  it("marque foyer si seul le total est présent", () => {
    expect(inferCoupleLineOwner([400_000], false)).toBe("foyer");
  });
});
