import { nextFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import { computeGrowthObjective, type GrowthObjectiveResult } from "./organisation-growth-objective";

/**
 * Projection pluriannuelle du « Tableau d'objectifs » — un vrai plan d'action année par année :
 * chaque année peut avoir ses propres hypothèses (croissance, attrition, taux, volumes visés),
 * une année non modifiée reprenant celles de l'année précédente (cascade). Permet par exemple de
 * pousser la croissance/attrition une année, puis de se concentrer sur le volume l'année suivante,
 * sans jamais devoir ressaisir les hypothèses non concernées.
 */
export type YearlyGrowthLevers = {
  targetGrowthPercent: number;
  attritionPercent: number;
  targetSponsorsRatePercent: number;
  targetTeamActiveRatePercent: number;
  targetPersonalVolume: number;
  targetTeamAverageVolume: number;
};

/**
 * Résout la cascade d'hypothèses : `overridesByYear[N]` (1-based) écrase ponctuellement l'année N,
 * chaque champ non précisé étant hérité de l'année précédente (donc `baseline` en année 1 si rien
 * n'est jamais modifié). `overridesByYear[1]` est ignoré par construction (l'année 1 reste toujours
 * la colonne « Objectif » du tableau principal, non éditable dans la grille de projection).
 */
export function resolveYearlyGrowthLevers(
  years: number,
  overridesByYear: Record<number, Partial<YearlyGrowthLevers>>,
  baseline: YearlyGrowthLevers
): YearlyGrowthLevers[] {
  const resolved: YearlyGrowthLevers[] = [];
  let previous = baseline;
  for (let year = 1; year <= Math.max(0, Math.floor(years)); year++) {
    const override = year === 1 ? {} : (overridesByYear[year] ?? {});
    const current = { ...previous, ...override };
    resolved.push(current);
    previous = current;
  }
  return resolved;
}

export type YearlyGrowthObjective = GrowthObjectiveResult & {
  /** 1 = premier exercice projeté (celui déjà affiché dans le tableau « Objectif »). */
  year: number;
  exerciceLabel: string;
};

/**
 * Rejoue `computeGrowthObjective` année par année, chacune avec ses propres leviers résolus
 * (`yearlyLevers[i]`) — l'effectif visé de l'année N devient l'effectif de départ de l'année N+1.
 * Les taux de conversion du funnel JD restent partagés (pas de stratégie annuelle dessus, cf.
 * `sharedJdRates`) : ce sont des taux de conversion terrain de l'exercice en cours, pas un levier
 * de plan pluriannuel.
 */
export function projectGrowthObjectiveOverYears(
  yearlyLevers: YearlyGrowthLevers[],
  sharedJdRates: {
    jdPresenceToRecruitRatePercent?: number | null;
    jdConfirmationToPresenceRatePercent?: number | null;
  },
  currentConsultantCount: number,
  startExerciceLabel: string
): YearlyGrowthObjective[] {
  const results: YearlyGrowthObjective[] = [];
  let headcount = Math.max(0, currentConsultantCount);
  let exerciceLabel = startExerciceLabel;

  for (let index = 0; index < yearlyLevers.length; index++) {
    const levers = yearlyLevers[index];
    const result = computeGrowthObjective({
      currentConsultantCount: headcount,
      attritionPercent: levers.attritionPercent,
      targetGrowthPercent: levers.targetGrowthPercent,
      targetSponsorsRatePercent: levers.targetSponsorsRatePercent,
      targetTeamActiveRatePercent: levers.targetTeamActiveRatePercent,
      targetPersonalVolume: levers.targetPersonalVolume,
      targetTeamAverageVolume: levers.targetTeamAverageVolume,
      jdPresenceToRecruitRatePercent: sharedJdRates.jdPresenceToRecruitRatePercent,
      jdConfirmationToPresenceRatePercent: sharedJdRates.jdConfirmationToPresenceRatePercent,
    });
    results.push({ ...result, year: index + 1, exerciceLabel });
    headcount = result.targetHeadcount;
    exerciceLabel = nextFiscalYearLabel(exerciceLabel) ?? exerciceLabel;
  }

  return results;
}
