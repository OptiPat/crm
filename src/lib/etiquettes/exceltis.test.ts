import { describe, expect, it } from "vitest";
import {
  formatExceltisEtiquetteNom,
  getExceltisMillesimeProposals,
  isExceltisEligibleProductType,
  isExceltisEtiquetteNom,
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

  it("formate le nom d'étiquette", () => {
    expect(formatExceltisEtiquetteNom(8, 2026)).toBe("Exceltis — Août 2026");
    expect(formatExceltisEtiquetteNom(2, 2025)).toBe("Exceltis — Février 2025");
  });

  it("identifie les types de produit éligibles Exceltis", () => {
    expect(isExceltisEligibleProductType("ASSURANCE_VIE")).toBe(true);
    expect(isExceltisEligibleProductType("PER")).toBe(true);
    expect(isExceltisEligibleProductType("SCPI")).toBe(false);
  });

  it("extrait le millésime depuis le nom d'étiquette", () => {
    expect(parseMillesimeLabelFromEtiquetteNom("Exceltis — Février 2025")).toBe("Février 2025");
    expect(parseMillesimeLabelFromEtiquetteNom("Suivi > 1 an")).toBeNull();
    expect(isExceltisEtiquetteNom("Exceltis — Octobre 2024")).toBe(true);
  });
});
