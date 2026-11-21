import { describe, expect, it } from "vitest";
import { estimateFrenchLegacyCniExpiry } from "@/lib/identity/french-legacy-cni-expiry";

/** N° de carte fictifs : AAMM + 8 chiffres. */
const NOW = new Date("2026-11-21T12:00:00");

describe("estimateFrenchLegacyCniExpiry", () => {
  it("majeur, délivrée en 08/2020 → 15 ans (01/08/2035)", () => {
    expect(estimateFrenchLegacyCniExpiry("200800000001", "15/03/1985", NOW)).toBe("01/08/2035");
  });

  it("mineur à la délivrance → 10 ans", () => {
    expect(estimateFrenchLegacyCniExpiry("200800000001", "15/03/2010", NOW)).toBe("01/08/2030");
  });

  it("majeur la veille de ses 18 ans → encore mineur (10 ans)", () => {
    expect(estimateFrenchLegacyCniExpiry("200800000001", "02/08/2002", NOW)).toBe("01/08/2030");
  });

  it("délivrée avant 2004 → 10 ans même pour un majeur", () => {
    expect(estimateFrenchLegacyCniExpiry("030500000001", "15/03/1970", NOW)).toBe("01/05/2013");
  });

  it("délivrée en 1995 (siècle déduit) → 10 ans", () => {
    expect(estimateFrenchLegacyCniExpiry("950600000001", "15/03/1970", NOW)).toBe("01/06/2005");
  });

  it("données incohérentes → pas d'estimation", () => {
    expect(estimateFrenchLegacyCniExpiry("201300000001", "15/03/1985", NOW)).toBeUndefined(); // mois 13
    expect(estimateFrenchLegacyCniExpiry("200800000001", "15/03/2021", NOW)).toBeUndefined(); // né après
    expect(estimateFrenchLegacyCniExpiry("ABCD00000001", "15/03/1985", NOW)).toBeUndefined();
    expect(estimateFrenchLegacyCniExpiry("200800000001", undefined, NOW)).toBeUndefined();
  });
});
