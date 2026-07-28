import { describe, expect, it } from "vitest";
import { computeGrowthObjective } from "./organisation-growth-objective";

describe("computeGrowthObjective", () => {
  it("calcule les parrainages bruts nécessaires en tenant compte de l'attrition et de la croissance visée", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 50,
      targetGrowthPercent: 30,
    });
    // attrition appliquée à tout le pool (existants + recrues) : survie 50 %
    // ceil(10 * (1.3/0.5 - 1)) = 16
    expect(result.recruitsForTarget).toBe(16);
  });

  it("expose l'effectif visé séparément du nombre de parrainages (pas la même chose)", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 56.3,
      targetGrowthPercent: 30,
    });
    // effectif visé : round(10 * 1.3) = 13 — différent de recruitsForTarget (20, qui compense
    // aussi l'attrition sur tout le pool) : deux notions distinctes, pas la même grandeur.
    expect(result.targetHeadcount).toBe(13);
    expect(result.recruitsForTarget).toBe(20);
  });

  it("laisse les parraineurs à null si le taux de parraineurs visé est inconnu", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 50,
      targetGrowthPercent: 30,
    });
    expect(result.sponsorsForTarget).toBeNull();
    expect(result.impliedRatioForTarget).toBeNull();
  });

  it("calcule les parraineurs nécessaires en appliquant le taux visé une seule fois (effectif × taux)", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 50,
      targetGrowthPercent: 30,
      targetSponsorsRatePercent: 26.5,
    });
    // objectif : round(13 * 0.265) = round(3.445) = 3
    // (pas de double application de la croissance — le taux ne s'applique qu'à l'effectif visé)
    expect(result.sponsorsForTarget).toBe(3);
  });

  it("dérive le ratio parrainages/parraineur implicite à partir des parraineurs nécessaires", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 50,
      targetGrowthPercent: 30,
      targetSponsorsRatePercent: 40, // sponsorsForTarget = round(13 * 0.4) = 5
    });
    expect(result.sponsorsForTarget).toBe(5);
    expect(result.recruitsForTarget).toBe(16);
    expect(result.impliedRatioForTarget).toBeCloseTo(16 / 5, 5);
  });

  it("calcule le volume actuel en additionnant le perso et l'équipe (base réelle)", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 56.3,
      targetGrowthPercent: 30,
      currentPersonalVolume: 800_000,
      currentTeamAverageVolume: 286_246,
      currentTeamActiveConsultantCount: 9,
    });
    expect(result.currentOrgVolume).toBeCloseTo(800_000 + 9 * 286_246, 0);
  });

  it("calcule l'effectif actif équipe (hors soi) en appliquant le taux visé une seule fois", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 56.3,
      targetGrowthPercent: 30,
      targetPersonalVolume: 900_000,
      targetTeamAverageVolume: 300_000,
      targetTeamActiveRatePercent: 47.6,
    });
    // effectif équipe hors soi visé : 13 - 1 = 12 ; round(12 * 0.476) = round(5.712) = 6
    expect(result.targetTeamActiveCount).toBe(6);
    // le volume utilise la valeur non arrondie (12 * 0.476 = 5.712) pour varier en continu, pas par paliers
    expect(result.targetOrgVolume).toBeCloseTo(900_000 + 12 * 0.476 * 300_000, 0);
    // valeur brute exposée pour que « effectif × volume moyen » se vérifie à la main
    expect(result.targetTeamActiveCountRaw).toBeCloseTo(5.712, 5);
  });

  it("le volume varie en continu avec la croissance visée (pas par paliers d'arrondi d'effectif)", () => {
    const base = {
      currentConsultantCount: 10,
      attritionPercent: 50,
      targetTeamActiveRatePercent: 50,
      targetPersonalVolume: 0,
      targetTeamAverageVolume: 100_000,
    };
    const at0 = computeGrowthObjective({ ...base, targetGrowthPercent: 0 });
    const at5 = computeGrowthObjective({ ...base, targetGrowthPercent: 5 });
    // effectif équipe hors soi : 10-1=9 à croissance 0 ; round(10*1.05)-1=10 à croissance 5 %
    // les deux arrondissent différemment mais le volume, lui, doit varier en continu
    expect(at0.targetOrgVolume).not.toBeCloseTo(at5.targetOrgVolume!, 0);
  });

  it("l'attrition n'affecte que l'effort de recrutement (parrainages), pas l'effectif/volume atteint", () => {
    const base = {
      currentConsultantCount: 10,
      targetGrowthPercent: 30,
      targetTeamActiveRatePercent: 50,
      targetPersonalVolume: 500_000,
      targetTeamAverageVolume: 200_000,
    };
    const attritionBasse = computeGrowthObjective({ ...base, attritionPercent: 10 });
    const attritionHaute = computeGrowthObjective({ ...base, attritionPercent: 70 });
    // même effectif/volume visé quelle que soit l'attrition — seul l'effort (parrainages) diffère
    expect(attritionBasse.targetTeamActiveCount).toBe(attritionHaute.targetTeamActiveCount);
    expect(attritionBasse.targetOrgVolume).toBeCloseTo(attritionHaute.targetOrgVolume!, 6);
    expect(attritionHaute.recruitsForTarget).toBeGreaterThan(attritionBasse.recruitsForTarget);
  });

  it("laisse le volume à null si les données de volume sont incomplètes", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 50,
      targetGrowthPercent: 30,
    });
    expect(result.currentOrgVolume).toBeNull();
    expect(result.targetOrgVolume).toBeNull();
    expect(result.targetTeamActiveCount).toBeNull();
  });

  it("accepte un objectif de croissance personnalisé plus ambitieux", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 56.3,
      targetGrowthPercent: 100,
    });
    // survie 43.7 % : ceil(10 * (2.0/0.437 - 1)) = 36
    expect(result.recruitsForTarget).toBe(36);
  });

  it("plafonne le taux de survie pour rester calculable même avec une attrition ≥ 100 %", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 120,
      targetGrowthPercent: 0,
    });
    expect(Number.isFinite(result.recruitsForTarget)).toBe(true);
    expect(result.recruitsForTarget).toBeGreaterThan(0);
  });

  it("calcule le funnel JD en cascade (présents JD puis « oui je viens »)", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 50,
      targetGrowthPercent: 30, // recruitsForTarget = 16
      jdPresenceToRecruitRatePercent: 50,
      jdConfirmationToPresenceRatePercent: 50,
    });
    // 16 parrainages ÷ 50 % = 32 présents JD ; 32 ÷ 50 % = 64 « oui je viens »
    expect(result.jdPresencesForTarget).toBe(32);
    expect(result.jdConfirmationsForTarget).toBe(64);
  });

  it("laisse le funnel JD à null si les taux de transformation sont inconnus", () => {
    const result = computeGrowthObjective({
      currentConsultantCount: 10,
      attritionPercent: 50,
      targetGrowthPercent: 30,
    });
    expect(result.jdPresencesForTarget).toBeNull();
    expect(result.jdConfirmationsForTarget).toBeNull();
  });
});
