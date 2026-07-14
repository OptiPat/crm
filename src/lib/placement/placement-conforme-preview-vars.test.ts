import { describe, expect, it } from "vitest";
import {
  SAMPLE_PLACEMENT_CONFORME_PREVIEW_VARS,
  shouldUsePlacementConformePreview,
  templateTextUsesPlacementConformeVariables,
} from "@/lib/placement/placement-conforme-preview-vars";

describe("placement-conforme-preview-vars", () => {
  it("détecte libelle_stellium dans le texte", () => {
    expect(
      templateTextUsesPlacementConformeVariables(
        "{{prenom}}, {{libelle_stellium}}",
        "corps",
        null
      )
    ).toBe(true);
    expect(templateTextUsesPlacementConformeVariables("sujet", "{{produit}} seul", null)).toBe(
      false
    );
  });

  it("active l'aperçu via trigger ou variables dédiées", () => {
    expect(
      shouldUsePlacementConformePreview(
        "sujet",
        "opération {{libelle_stellium}} sur {{produit}}",
        null,
        null,
        false
      )
    ).toBe(true);
    expect(
      shouldUsePlacementConformePreview("sujet", "{{produit}}", null, null, true)
    ).toBe(true);
    expect(
      shouldUsePlacementConformePreview("sujet", "{{produit}}", null, null, false)
    ).toBe(false);
  });

  it("expose des exemples cohérents Stellium", () => {
    expect(SAMPLE_PLACEMENT_CONFORME_PREVIEW_VARS.produit).toBe("Cristalliance Evoluvie");
    expect(SAMPLE_PLACEMENT_CONFORME_PREVIEW_VARS.libelle_stellium).toBe("Arbitrage libre");
  });
});
