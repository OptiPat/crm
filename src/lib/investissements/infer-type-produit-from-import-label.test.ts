import { describe, expect, it } from "vitest";
import { inferTypeProduitFromImportProduitLabel } from "./infer-type-produit-from-import-label";

describe("inferTypeProduitFromImportProduitLabel", () => {
  it("mappe les dispositifs fiscaux immo historiques", () => {
    expect(inferTypeProduitFromImportProduitLabel("BESSON Programme X")).toBe("BESSON");
    expect(inferTypeProduitFromImportProduitLabel("Scellier")).toBe("SCELLIER");
    expect(inferTypeProduitFromImportProduitLabel("ROBIEN")).toBe("ROBIEN");
    expect(inferTypeProduitFromImportProduitLabel("Méhaignerie")).toBe("MEHAIGNERIE");
    expect(inferTypeProduitFromImportProduitLabel("Périssol")).toBe("PERISSOL");
    expect(inferTypeProduitFromImportProduitLabel("DUFLOT")).toBe("DUFLOT");
    expect(inferTypeProduitFromImportProduitLabel("Borloo")).toBe("BORLOO");
    expect(inferTypeProduitFromImportProduitLabel("Jeanbrun")).toBe("JEANBRUN");
  });
});
