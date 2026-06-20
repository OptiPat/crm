import { describe, expect, it } from "vitest";
import {
  exceltisEtiquetteKeysMatch,
  formatExceltisEtiquetteNom,
  getExceltisMillesimeProposals,
  isExceltisEligibleProductType,
  isExceltisEtiquetteNom,
  parseExceltisGammeFromText,
  parseExceltisKeyFromNom,
  parseMillesimeLabelFromEtiquetteNom,
} from "./exceltis";

describe("exceltis", () => {
  it("propose M+1 à M+3 depuis mai 2026", () => {
    const ref = new Date(2026, 4, 15);
    const options = getExceltisMillesimeProposals(ref);
    expect(options).toHaveLength(3);
    expect(options[0]).toMatchObject({ label: "Juin 2026", offset: 1, key: "2026-06" });
    expect(options[1]).toMatchObject({ label: "Juillet 2026", offset: 2, key: "2026-07" });
    expect(options[2]).toMatchObject({ label: "Août 2026", offset: 3, key: "2026-08" });
  });

  it("formate le nom d'étiquette avec gamme", () => {
    expect(formatExceltisEtiquetteNom("Rendement", 8, 2026)).toBe("Exceltis Rendement — Août 2026");
    expect(formatExceltisEtiquetteNom("Patrimoine", 6, 2026)).toBe("Exceltis Patrimoine — Juin 2026");
  });

  it("identifie les types de produit éligibles Exceltis", () => {
    expect(isExceltisEligibleProductType("ASSURANCE_VIE")).toBe(true);
    expect(isExceltisEligibleProductType("PER")).toBe(true);
    expect(isExceltisEligibleProductType("SCPI")).toBe(false);
  });

  it("extrait gamme et millésime depuis le nom d'étiquette", () => {
    expect(parseMillesimeLabelFromEtiquetteNom("Exceltis Rendement — Février 2025")).toBe(
      "Février 2025"
    );
    expect(parseExceltisKeyFromNom("Exceltis Rendement — Octobre 2024")).toEqual({
      gamme: "Rendement",
      month: 10,
      year: 2024,
    });
    expect(parseMillesimeLabelFromEtiquetteNom("Suivi > 1 an")).toBeNull();
    expect(isExceltisEtiquetteNom("Exceltis Sérénité — Mai 2024")).toBe(true);
  });

  it("accepte les variantes de nom (tiret, casse, accents)", () => {
    expect(parseExceltisKeyFromNom("Exceltis Rendement - Août 2026")).toEqual({
      gamme: "Rendement",
      month: 8,
      year: 2026,
    });
    expect(parseExceltisKeyFromNom("exceltis patrimoine aout 2026")).toEqual({
      gamme: "Patrimoine",
      month: 8,
      year: 2026,
    });
    expect(isExceltisEtiquetteNom("Exceltis — remboursement et arbitrage")).toBe(false);
  });

  it("mappe Patrimoine Taux (Stellium) vers Patrimoine", () => {
    expect(parseExceltisGammeFromText("Exceltis Patrimoine Taux Juin 2026")).toBe("Patrimoine");
    expect(parseExceltisGammeFromText("Remboursement Exceltis Rendement Février 2025")).toBe(
      "Rendement"
    );
  });

  it("matche par gamme + millésime", () => {
    const rendement = { gamme: "Rendement" as const, month: 8, year: 2026 };
    const patrimoine = { gamme: "Patrimoine" as const, month: 8, year: 2026 };
    expect(exceltisEtiquetteKeysMatch(rendement, rendement)).toBe(true);
    expect(exceltisEtiquetteKeysMatch(rendement, patrimoine)).toBe(false);
  });

  it("conserve le legacy sans gamme", () => {
    const legacy = { month: 8, year: 2026 };
    expect(exceltisEtiquetteKeysMatch(legacy, legacy)).toBe(true);
    expect(isExceltisEtiquetteNom("Exceltis — Août 2026")).toBe(true);
  });
});
