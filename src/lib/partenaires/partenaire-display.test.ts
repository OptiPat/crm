import { describe, expect, it } from "vitest";
import { suggestPartenaireTypeForProduit } from "@/lib/partenaires/partenaire-display";

describe("suggestPartenaireTypeForProduit", () => {
  it("suggère ASSUREUR pour AV/PER", () => {
    expect(suggestPartenaireTypeForProduit("ASSURANCE_VIE")).toBe("ASSUREUR");
    expect(suggestPartenaireTypeForProduit("PER")).toBe("ASSUREUR");
  });

  it("suggère SCPI pour SCPI", () => {
    expect(suggestPartenaireTypeForProduit("SCPI")).toBe("SOCIETE_GESTION_SCPI");
  });

  it("suggère FIP pour FIP/FCPI", () => {
    expect(suggestPartenaireTypeForProduit("FIP_FCPI")).toBe("SOCIETE_GESTION_FIP");
  });

  it("suggère PROMOTEUR pour immo", () => {
    expect(suggestPartenaireTypeForProduit("PINEL")).toBe("PROMOTEUR");
  });
});
