import { describe, expect, it } from "vitest";
import {
  BIENS_MEUBLES_TYPES,
  isBiensMeublesType,
} from "./biens-meubles-types";

describe("biens-meubles-types", () => {
  it("reconnaît les cinq types du panier", () => {
    expect(BIENS_MEUBLES_TYPES).toHaveLength(5);
    expect(isBiensMeublesType("BIJOUX")).toBe(true);
    expect(isBiensMeublesType("FONDS_COMMERCE")).toBe(true);
    expect(isBiensMeublesType("ASSURANCE_VIE")).toBe(false);
  });
});
