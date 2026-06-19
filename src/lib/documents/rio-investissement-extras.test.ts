import { describe, expect, it } from "vitest";
import {
  buildImmoInvestissementExtras,
  buildPatrimoineMontantInitial,
} from "./rio-investissement-extras";

describe("rio-investissement-extras", () => {
  it("mappe crédit/loyer immo en centimes structurés", () => {
    const extras = buildImmoInvestissementExtras({
      editedType: "RP",
      mensualiteCredit: 1500,
      creditCRD: 210_000,
      loyerMensuel: 800,
      dateFinCredit: "15/06/2045",
    });
    expect(extras.mensualite_credit).toBe(150_000);
    expect(extras.credit_crd).toBe(21_000_000);
    expect(extras.loyer_mensuel).toBe(80_000);
    expect(extras.date_fin_pret).toBe("2045-06-15T00:00:00Z");
  });

  it("mappe crédit SCPI en centimes structurés", () => {
    const extras = buildImmoInvestissementExtras({
      editedType: "SCPI",
      mensualiteCredit: 650,
      creditCRD: 45_000,
      dateFinCredit: "10/11/2046",
    });
    expect(extras.mensualite_credit).toBe(65_000);
    expect(extras.credit_crd).toBe(4_500_000);
    expect(extras.date_fin_pret).toBe("2046-11-10T00:00:00Z");
  });

  it("AV utilise encours sans montant_initial", () => {
    expect(buildPatrimoineMontantInitial("ASSURANCE_VIE", 80_000)).toBeUndefined();
    expect(buildPatrimoineMontantInitial("RP", 310_000)).toBe(31_000_000);
  });
});
