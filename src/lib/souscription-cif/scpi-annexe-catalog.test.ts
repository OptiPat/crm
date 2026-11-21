import { describe, expect, it } from "vitest";
import {
  buildDescriptionsScpiFromKeys,
  isScpiAnnexeCommercialisee,
  SCPI_ANNEXE_PRODUCT_FICHES,
} from "@/lib/souscription-cif/scpi-annexe-catalog";

describe("scpi-annexe-catalog", () => {
  it("retourne une chaîne vide si aucune clé connue", () => {
    expect(buildDescriptionsScpiFromKeys([])).toBe("");
    expect(buildDescriptionsScpiFromKeys(["scpi-inconnue"])).toBe("");
  });

  it("concatène les fiches dans l'ordre des clés", () => {
    const text = buildDescriptionsScpiFromKeys(["comete", "corum_origin"]);
    expect(text).toContain("— COMÈTE —");
    expect(text).toContain("— CORUM ORIGIN —");
    expect(text.indexOf("COMÈTE")).toBeLessThan(text.indexOf("CORUM ORIGIN"));
  });

  it("expose 12 fiches SCPI de rendement", () => {
    expect(SCPI_ANNEXE_PRODUCT_FICHES).toHaveLength(12);
    expect(SCPI_ANNEXE_PRODUCT_FICHES.map((p) => p.key)).toEqual([
      "comete",
      "transitions_europe",
      "epargne_pierre_europe",
      "epargne_pierre",
      "alta_convictions",
      "osmo_energie",
      "ncap_regions",
      "corum_origin",
      "corum_eurion",
      "immorente",
      "activimmo",
      "lf_avenir_sante",
    ]);
  });
});

describe("SCPI plus commercialisées", () => {
  it("LF Avenir Santé est masquée des nouveaux dossiers mais reste au catalogue", () => {
    const lf = SCPI_ANNEXE_PRODUCT_FICHES.find((p) => p.key === "lf_avenir_sante");
    expect(lf).toBeDefined();
    expect(isScpiAnnexeCommercialisee(lf!)).toBe(false);
    const proposees = SCPI_ANNEXE_PRODUCT_FICHES.filter(isScpiAnnexeCommercialisee);
    expect(proposees).toHaveLength(11);
    expect(proposees.some((p) => p.key === "comete")).toBe(true);
  });
});
