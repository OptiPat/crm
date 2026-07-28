import { nextFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import { computeGrowthObjective, type GrowthObjectiveInput, type GrowthObjectiveResult } from "./organisation-growth-objective";

/**
 * Projection pluriannuelle du « Tableau d'objectifs » — mêmes hypothèses (croissance, attrition,
 * taux, volumes visés) rejouées chaque année, l'effectif visé de l'année N devenant l'effectif de
 * départ de l'année N+1. Illustre la croissance GÉOMÉTRIQUE (composée) plutôt qu'additive : à %
 * de croissance visée constant, l'effort de recrutement (parrainages bruts) augmente chaque année
 * car appliqué à une base plus grande.
 *
 * Les hypothèses de volume (perso visé, volume moyen équipe visé) sont tenues CONSTANTES d'une
 * année sur l'autre (pas de croissance de la production individuelle projetée) — seul l'effectif
 * compose, le volume organisation suit mécaniquement via effectif équipe visé × volume moyen visé.
 */
export type YearlyGrowthObjective = GrowthObjectiveResult & {
  /** 1 = premier exercice projeté (celui déjà affiché dans le tableau « Objectif »). */
  year: number;
  exerciceLabel: string;
};

export function projectGrowthObjectiveOverYears(
  input: GrowthObjectiveInput,
  years: number,
  startExerciceLabel: string
): YearlyGrowthObjective[] {
  const results: YearlyGrowthObjective[] = [];
  let currentConsultantCount = Math.max(0, input.currentConsultantCount);
  let exerciceLabel = startExerciceLabel;

  for (let year = 1; year <= Math.max(0, Math.floor(years)); year++) {
    const result = computeGrowthObjective({ ...input, currentConsultantCount });
    results.push({ ...result, year, exerciceLabel });
    currentConsultantCount = result.targetHeadcount;
    exerciceLabel = nextFiscalYearLabel(exerciceLabel) ?? exerciceLabel;
  }

  return results;
}
