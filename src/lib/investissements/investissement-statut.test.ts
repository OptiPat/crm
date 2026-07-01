import { describe, expect, it } from "vitest";
import {
  getInvestissementStatutLabel,
  isInvestissementActifEncours,
  isInvestissementCloture,
} from "@/lib/investissements/investissement-statut";

describe("investissement-statut", () => {
  it("considère ACTIF par défaut", () => {
    expect(isInvestissementActifEncours({})).toBe(true);
    expect(isInvestissementCloture({})).toBe(false);
  });

  it("détecte CLOTURE", () => {
    expect(isInvestissementActifEncours({ statut: "CLOTURE" })).toBe(false);
    expect(isInvestissementCloture({ statut: "CLOTURE" })).toBe(true);
    expect(getInvestissementStatutLabel("CLOTURE")).toBe("Clôturé");
  });
});
