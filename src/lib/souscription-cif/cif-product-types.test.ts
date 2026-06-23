import { describe, expect, it } from "vitest";
import {
  getCifProductTypeLabel,
  isCifProductTypeAvailable,
  parseSouscriptionCifProductType,
} from "@/lib/souscription-cif/cif-product-types";

describe("cif-product-types", () => {
  it("SCPI et capital investissement sont sélectionnables", () => {
    expect(isCifProductTypeAvailable("scpi")).toBe(true);
    expect(isCifProductTypeAvailable("capital-investissement")).toBe(true);
    expect(isCifProductTypeAvailable("g3f")).toBe(true);
  });

  it("parse le type et retombe sur scpi", () => {
    expect(parseSouscriptionCifProductType("g3f")).toBe("g3f");
    expect(parseSouscriptionCifProductType("inconnu")).toBe("scpi");
  });

  it("libellé affichage", () => {
    expect(getCifProductTypeLabel("scpi")).toBe("SCPI");
    expect(getCifProductTypeLabel("g3f")).toBe("G3F");
  });
});
