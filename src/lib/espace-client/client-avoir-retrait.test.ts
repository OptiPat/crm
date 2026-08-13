import { describe, expect, it } from "vitest";
import { canClientRetirerAvoir } from "./client-avoir-retrait";

describe("canClientRetirerAvoir", () => {
  it("n'autorise que les lignes DECLARE_CLIENT", () => {
    expect(canClientRetirerAvoir("DECLARE_CLIENT")).toBe(true);
    expect(canClientRetirerAvoir("MON_CONSEIL")).toBe(false);
    expect(canClientRetirerAvoir("EXISTANT_CLIENT")).toBe(false);
    expect(canClientRetirerAvoir(undefined)).toBe(false);
  });
});
