import { describe, expect, it } from "vitest";
import { parseAuto } from "./parse-auto";
import legrandFixture from "./stellium/fixtures/rio-solo-legrand-2026.txt?raw";

describe("parseAuto", () => {
  it("route vers Stellium pour un RIO 2026", () => {
    const data = parseAuto(legrandFixture);
    expect(data.typeDocument).toBe("RIO");
    expect(data.nom).toBe("LEGRAND");
  });

  it("retourne un extrait vide si le texte n'est pas Stellium", () => {
    const data = parseAuto("Facture fournisseur XYZ");
    expect(data.typeDocument).toBeUndefined();
    expect(data.confidence).toBe(0);
    expect(data.raw).toContain("Facture");
  });
});
