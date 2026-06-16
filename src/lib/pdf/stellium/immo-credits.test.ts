import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "./rio-parser";
import plazaFixture from "./fixtures/rio-plaza-2026.txt?raw";

describe("immo-credits — Plaza 2026", () => {
  const data = parseStelliumRio(plazaFixture);

  it("associe mensualité et CRD aux biens immobiliers", () => {
    const rp = data.biensImmobiliers?.find((b) => b.nom === "Primo MTP");
    const loc = data.biensImmobiliers?.find((b) => b.nom === "Sete AIRBNB");

    expect(rp).toMatchObject({
      valeur: 310000,
      mensualiteCredit: 1500,
      creditCRD: 210000,
      dateFinCredit: "15/06/2045",
    });
    expect(loc).toMatchObject({
      valeur: 72500,
      mensualiteCredit: 500,
      creditCRD: 70000,
      dateFinCredit: "01/01/2040",
    });
  });
});
