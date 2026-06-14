import { describe, expect, it } from "vitest";
import {
  buildDescriptionsScpiFromKeys,
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

  it("expose 7 fiches SCPI de rendement", () => {
    expect(SCPI_ANNEXE_PRODUCT_FICHES).toHaveLength(7);
    expect(SCPI_ANNEXE_PRODUCT_FICHES.map((p) => p.key)).toEqual([
      "comete",
      "transitions_europe",
      "epargne_pierre_europe",
      "alta_convictions",
      "osmo_energie",
      "ncap_regions",
      "corum_origin",
    ]);
  });
});
