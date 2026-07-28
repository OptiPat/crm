import { describe, expect, it } from "vitest";
import {
  projectGrowthObjectiveOverYears,
  resolveYearlyGrowthLevers,
  type YearlyGrowthLevers,
} from "./organisation-growth-projection";

const baseline: YearlyGrowthLevers = {
  targetGrowthPercent: 30,
  attritionPercent: 0,
  targetSponsorsRatePercent: 40,
  targetTeamActiveRatePercent: 70,
  targetPersonalVolume: 1_000_000,
  targetTeamAverageVolume: 200_000,
};

describe("resolveYearlyGrowthLevers", () => {
  it("reprend le baseline pour toutes les années sans surcharge", () => {
    const resolved = resolveYearlyGrowthLevers(3, {}, baseline);
    expect(resolved).toEqual([baseline, baseline, baseline]);
  });

  it("ignore une surcharge sur l'année 1 (toujours = baseline)", () => {
    const resolved = resolveYearlyGrowthLevers(2, { 1: { targetGrowthPercent: 99 } }, baseline);
    expect(resolved[0].targetGrowthPercent).toBe(30);
  });

  it("applique une surcharge ponctuelle qui persiste en cascade sur les années suivantes", () => {
    const resolved = resolveYearlyGrowthLevers(
      4,
      { 2: { targetGrowthPercent: 10 } },
      baseline
    );
    expect(resolved.map((r) => r.targetGrowthPercent)).toEqual([30, 10, 10, 10]);
  });

  it("une surcharge plus tardive prend le dessus sur la cascade précédente", () => {
    const resolved = resolveYearlyGrowthLevers(
      4,
      { 2: { targetGrowthPercent: 10 }, 4: { targetGrowthPercent: 5 } },
      baseline
    );
    expect(resolved.map((r) => r.targetGrowthPercent)).toEqual([30, 10, 10, 5]);
  });

  it("les champs non surchargés restent hérités, seul le champ ciblé change", () => {
    const resolved = resolveYearlyGrowthLevers(2, { 2: { attritionPercent: 50 } }, baseline);
    expect(resolved[1]).toEqual({ ...baseline, attritionPercent: 50 });
  });
});

describe("projectGrowthObjectiveOverYears", () => {
  it("compose l'effectif d'année en année avec des leviers identiques (cas partagé)", () => {
    const yearlyLevers = resolveYearlyGrowthLevers(3, {}, baseline);
    const results = projectGrowthObjectiveOverYears(yearlyLevers, {}, 10, "2026-2027");

    expect(results).toHaveLength(3);
    expect(results[0].targetHeadcount).toBe(13);
    expect(results[1].targetHeadcount).toBe(17);
    expect(results[2].targetHeadcount).toBe(22);
  });

  it("applique bien des leviers différents par année (business plan pilotable)", () => {
    // Année 1 : forte croissance +50%, attrition dure. Année 2 : stabilisation +10%.
    const yearlyLevers = resolveYearlyGrowthLevers(
      2,
      { 2: { targetGrowthPercent: 10, attritionPercent: 20 } },
      { ...baseline, targetGrowthPercent: 50, attritionPercent: 50 }
    );
    const results = projectGrowthObjectiveOverYears(yearlyLevers, {}, 10, "2026-2027");

    expect(results[0].targetHeadcount).toBe(15); // 10 * 1.5
    expect(results[1].targetHeadcount).toBe(17); // round(15 * 1.1)
    // L'attrition doit bien changer l'effort de recrutement d'une année à l'autre.
    expect(results[0].recruitsForTarget).not.toBe(results[1].recruitsForTarget);
  });

  it("chaîne les labels d'exercice à partir du label de départ", () => {
    const yearlyLevers = resolveYearlyGrowthLevers(3, {}, baseline);
    const results = projectGrowthObjectiveOverYears(yearlyLevers, {}, 10, "2026-2027");
    expect(results.map((r) => r.exerciceLabel)).toEqual(["2026-2027", "2027-2028", "2028-2029"]);
    expect(results.map((r) => r.year)).toEqual([1, 2, 3]);
  });

  it("le volume suit le levier de volume propre à chaque année", () => {
    const yearlyLevers = resolveYearlyGrowthLevers(
      2,
      { 2: { targetTeamAverageVolume: 300_000, targetPersonalVolume: 2_000_000 } },
      baseline
    );
    const results = projectGrowthObjectiveOverYears(yearlyLevers, {}, 10, "2026-2027");
    // Année 1 : effectif 13, équipe hors moi = 12, actifs 70% -> 8.4 * 200000 + 1000000
    expect(results[0].targetOrgVolume).toBeCloseTo(8.4 * 200_000 + 1_000_000);
    // Année 2 : effectif round(13*1.3)=17, équipe hors moi = 16, actifs 70% -> 11.2 * 300000 + 2000000
    expect(results[1].targetOrgVolume).toBeCloseTo(11.2 * 300_000 + 2_000_000);
  });

  it("retourne un tableau vide si aucune année", () => {
    expect(projectGrowthObjectiveOverYears([], {}, 10, "2026-2027")).toEqual([]);
  });
});
