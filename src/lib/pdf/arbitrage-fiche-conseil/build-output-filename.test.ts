import { describe, expect, it } from "vitest";
import { buildArbitrageFicheOutputFileName } from "@/lib/pdf/arbitrage-fiche-conseil/build-output-filename";

describe("buildArbitrageFicheOutputFileName", () => {
  it("formate AV", () => {
    expect(buildArbitrageFicheOutputFileName("AV", "DUPONT", "Jean", "AV-123456")).toBe(
      "Fiche conseil AV Arbitrage - DUPONT Jean - AV-123456.pdf"
    );
  });

  it("formate PER", () => {
    expect(buildArbitrageFicheOutputFileName("PER", "DUPONT", "Jean", "PER-123")).toBe(
      "Fiche conseil PER Arbitrage - DUPONT Jean - PER-123.pdf"
    );
  });

  it("formate modification VP", () => {
    expect(
      buildArbitrageFicheOutputFileName("AV", "DUPONT", "Jean", "AV-1", "VP_MODIFICATION")
    ).toBe("Fiche conseil AV Modification VP - DUPONT Jean - AV-1.pdf");
  });

  it("tronque au-delà de 180 caractères (limite Rust)", () => {
    const longNom = "A".repeat(100);
    const longContrat = "B".repeat(100);
    const name = buildArbitrageFicheOutputFileName("AV", longNom, "", longContrat);
    expect(name.length).toBeLessThanOrEqual(180);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});
