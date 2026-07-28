import { describe, expect, it } from "vitest";
import { projectGrowthObjectiveOverYears } from "./organisation-growth-projection";

describe("projectGrowthObjectiveOverYears", () => {
  it("compose la croissance visée d'année en année (effectif visé N devient la base N+1)", () => {
    const results = projectGrowthObjectiveOverYears(
      { currentConsultantCount: 10, attritionPercent: 0, targetGrowthPercent: 30 },
      3,
      "2026-2027"
    );

    expect(results).toHaveLength(3);
    // 10 -> +30% -> 13 -> +30% -> 17 (round(16.9)) -> +30% -> 22 (round(22.1))
    expect(results[0].targetHeadcount).toBe(13);
    expect(results[1].targetHeadcount).toBe(17);
    expect(results[2].targetHeadcount).toBe(22);
  });

  it("chaîne les labels d'exercice à partir du label de départ", () => {
    const results = projectGrowthObjectiveOverYears(
      { currentConsultantCount: 10, attritionPercent: 0, targetGrowthPercent: 10 },
      3,
      "2026-2027"
    );
    expect(results.map((r) => r.exerciceLabel)).toEqual(["2026-2027", "2027-2028", "2028-2029"]);
    expect(results.map((r) => r.year)).toEqual([1, 2, 3]);
  });

  it("l'effort de recrutement augmente d'année en année à % de croissance constant (croissance géométrique)", () => {
    const results = projectGrowthObjectiveOverYears(
      { currentConsultantCount: 10, attritionPercent: 30, targetGrowthPercent: 20 },
      3,
      "2026-2027"
    );
    expect(results[1].recruitsForTarget).toBeGreaterThan(results[0].recruitsForTarget);
    expect(results[2].recruitsForTarget).toBeGreaterThan(results[1].recruitsForTarget);
  });

  it("tient le volume moyen équipe et le volume perso visés constants, seul l'effectif compose", () => {
    const results = projectGrowthObjectiveOverYears(
      {
        currentConsultantCount: 10,
        attritionPercent: 0,
        targetGrowthPercent: 30,
        targetTeamActiveRatePercent: 100,
        targetTeamAverageVolume: 100_000,
        targetPersonalVolume: 200_000,
      },
      2,
      "2026-2027"
    );
    // Année 1 : effectif 13, équipe hors moi = 12 actifs à 100% -> 12 * 100000 + 200000
    expect(results[0].targetOrgVolume).toBe(12 * 100_000 + 200_000);
    // Année 2 : effectif 17 (round(16.9)), équipe hors moi = 16 actifs -> 16 * 100000 + 200000
    expect(results[1].targetOrgVolume).toBe(16 * 100_000 + 200_000);
  });

  it("retourne un tableau vide pour 0 année", () => {
    expect(
      projectGrowthObjectiveOverYears(
        { currentConsultantCount: 10, attritionPercent: 0, targetGrowthPercent: 30 },
        0,
        "2026-2027"
      )
    ).toEqual([]);
  });
});
