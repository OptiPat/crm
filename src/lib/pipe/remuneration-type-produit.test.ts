import { describe, expect, it } from "vitest";
import { inferTypeProduitFromStelliumProductLabel } from "@/lib/pipe/remuneration-type-produit";

describe("remuneration-type-produit", () => {
  it("infère SCPI depuis le catalogue Stellium", () => {
    expect(inferTypeProduitFromStelliumProductLabel("Corum Origin")).toBe("SCPI");
  });

  it("infère assurance-vie depuis le catalogue", () => {
    expect(inferTypeProduitFromStelliumProductLabel("Cristalliance Avenir")).toBe(
      "ASSURANCE_VIE"
    );
  });

  it("infère G3F via heuristique libellé", () => {
    expect(inferTypeProduitFromStelliumProductLabel("Fonds G3F Patrimoine")).toBe("G3F");
  });
});
