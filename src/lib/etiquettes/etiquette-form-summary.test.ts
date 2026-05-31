import { describe, expect, it } from "vitest";
import { formatEtiquetteRuleSummary } from "@/lib/etiquettes/etiquette-form-summary";

const base = {
  isAuto: true,
  conditionType: "PERIODE_ANNEE",
  delaiJours: 365,
  inclureSansDate: true,
  ageCible: 69,
  ageJoursAvant: 30,
  champDate: "date_prochain_suivi",
  joursAvant: 30,
  moisDebut: 4,
  moisFin: 5,
  typesProduitCount: 0,
  invChampDate: "date_fin_demembrement",
  invJoursAvant: 180,
  invTypesProduitCount: 0,
  categories: ["CLIENT"],
};

describe("formatEtiquetteRuleSummary", () => {
  it("décrit une période annuelle", () => {
    const s = formatEtiquetteRuleSummary(base);
    expect(s).toContain("Avril");
    expect(s).toContain("Mai");
    expect(s).toContain("Clients");
  });

  it("manuel si pas de règle auto", () => {
    expect(formatEtiquetteRuleSummary({ ...base, isAuto: false })).toContain("manuelle");
  });
});
