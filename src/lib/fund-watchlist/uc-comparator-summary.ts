import type {
  CompareResponse,
  UcCriterionScore,
  UcFundMetricsSnapshot,
  UcFundResultScore,
} from "@/lib/api/tauri-uc-comparator";
import { formatFundPerfPercent, formatFundSharpe } from "@/lib/fund-watchlist/fund-watchlist-display";

export type UcCriterionWinner = {
  criterion: UcCriterionScore;
  winnerIsin: string | null;
  winnerLabel: string | null;
  tie: boolean;
};

const CRITERION_HELP: Record<string, string> = {
  top10:
    "Part cumulée des 10 plus grosses lignes du portefeuille (composition Boursorama). Récupérée automatiquement à la comparaison si absente du cache.",
  sharpe_3y:
    "Rendement ajusté du risque sur 3 ans. Un Sharpe ≤ 0 obtient 0 ; les Sharpe positifs sont comparés avec un plancher à 0 (pas de « couperet » entre deux fonds proches).",
  max_drawdown:
    "Perte maximale observée sur 3 ans — plus le drawdown est faible, mieux c'est (critère obligataire v1.5).",
  aum: "Encours du fonds en M€ — liquidité et pérennité (critère obligataire v1.5).",
  vol_3ans:
    "Volatilité 3 ans mesurée (import Cristalliance) : à performance égale, le fonds le plus calme est préféré. Un écart inférieur à 1 point (0,4 en obligataire) n'est pas départagé.",
  worst_year:
    "Perte de la plus mauvaise année civile connue du fonds. Substitut vérifiable du max drawdown, que Boursorama réserve à ses clients — c'est ce qu'un client aurait vécu dans sa pire année.",
  rang_categorie:
    "Rang Morningstar moyen du fonds dans sa catégorie (1 = meilleur, 100 = pire), sur les années publiées par Boursorama. Noté en absolu : deux rangs voisins restent proches.",
};

export function ucConfidenceThreshold(profile?: string | null): number {
  return profile === "obligations" ? 0.6 : 0.7;
}

export function ucScoringProfileLabel(profile?: string | null): string {
  return profile === "obligations" ? "Obligations" : "Actions / diversifié";
}

export function criterionHelpText(key: string): string | undefined {
  return CRITERION_HELP[key];
}

export function formatCriterionWeight(weight: number): string {
  return `${Math.round(weight * 1000) / 10} %`;
}

export function availableCriteriaWeightSum(criteria: UcCriterionScore[]): number {
  return criteria.filter((c) => c.available).reduce((sum, c) => sum + c.weight_global, 0);
}

export function isCriteriaWeightRenormalized(criteria: UcCriterionScore[]): boolean {
  const sum = availableCriteriaWeightSum(criteria);
  return criteria.some((c) => !c.available) && Math.abs(sum - 1) > 0.001;
}

export function effectiveCriterionWeight(
  criterion: UcCriterionScore,
  criteria: UcCriterionScore[]
): number {
  const sum = availableCriteriaWeightSum(criteria);
  if (!criterion.available || sum <= 0) return 0;
  return criterion.weight_global / sum;
}

export function formatCriterionWeightLabel(
  criterion: UcCriterionScore,
  criteria: UcCriterionScore[]
): string {
  if (!criterion.available) {
    return `poids ${formatCriterionWeight(criterion.weight_global)} — non évalué`;
  }
  if (isCriteriaWeightRenormalized(criteria)) {
    return `poids effectif ${formatCriterionWeight(effectiveCriterionWeight(criterion, criteria))}`;
  }
  return `poids ${formatCriterionWeight(criterion.weight_global)}`;
}

/** Comparatifs archivés avant le champ `discriminant` : considérés comme discriminants. */
export function isCriterionDiscriminant(criterion: UcCriterionScore): boolean {
  return criterion.discriminant !== false;
}

export function nonDiscriminantCriteria(criteria: UcCriterionScore[]): UcCriterionScore[] {
  return criteria.filter((c) => c.available && !isCriterionDiscriminant(c));
}

export const UC_CRITERION_NON_DISCRIMINANT_LABEL = "écart non significatif — noté à égalité";

/** Avertit quand des critères disponibles ne départagent pas les fonds comparés. */
export function formatNonDiscriminantNotice(criteria: UcCriterionScore[]): string | null {
  const flat = nonDiscriminantCriteria(criteria);
  if (flat.length === 0) return null;
  const labels = flat.map((c) => c.label).join(", ");
  const weight = flat.reduce((sum, c) => sum + c.weight_global, 0);
  return (
    `Écart non significatif sur : ${labels}. Ces critères sont notés à égalité ` +
    `et ne départagent pas les fonds (${formatCriterionWeight(weight)} du barème sans effet sur le classement).`
  );
}

export function metricsForIsin(
  metrics: UcFundMetricsSnapshot[],
  isin: string
): UcFundMetricsSnapshot | undefined {
  return metrics.find((m) => m.isin === isin);
}

export function formatCriterionRawValue(
  key: string,
  metrics: UcFundMetricsSnapshot | undefined
): string {
  if (!metrics) return "—";
  switch (key) {
    case "perf_1an":
      return formatFundPerfPercent(metrics.perf_1an);
    case "perf_3ans":
      return formatFundPerfPercent(metrics.perf_3ans);
    case "perf_5ans":
      return formatFundPerfPercent(metrics.perf_5ans);
    case "sharpe_3y":
      return formatFundSharpe(metrics.sharpe_3y);
    case "top10":
      return metrics.top10_percent != null
        ? `${metrics.top10_percent.toFixed(1).replace(".", ",")} %`
        : "—";
    case "max_drawdown":
      return metrics.max_drawdown_3y != null
        ? `${metrics.max_drawdown_3y.toFixed(1).replace(".", ",")} %`
        : "—";
    case "aum":
      return metrics.aum_meur != null
        ? `${metrics.aum_meur.toFixed(0).replace(".", ",")} M€`
        : "—";
    case "vol_3ans":
      return metrics.vol_3ans != null
        ? `${metrics.vol_3ans.toFixed(1).replace(".", ",")} %`
        : "—";
    case "worst_year":
      return formatFundPerfPercent(metrics.worst_year_perf);
    case "rang_categorie":
      // Rang Morningstar en centile : 1 = tête de catégorie, 100 = queue.
      return metrics.category_rank_avg != null
        ? `${metrics.category_rank_avg.toFixed(0)}/100`
        : "—";
    default:
      return "—";
  }
}

export function resolveCriterionWinners(
  response: CompareResponse
): UcCriterionWinner[] {
  const { criteria, fund_order: fundOrder, results } = response;
  const nameByIsin = new Map(results.map((f) => [f.isin, f.nom]));

  return criteria.map((criterion) => {
    if (!criterion.available) {
      return { criterion, winnerIsin: null, winnerLabel: null, tie: false };
    }
    if (!isCriterionDiscriminant(criterion)) {
      return { criterion, winnerIsin: null, winnerLabel: null, tie: true };
    }
    const max = Math.max(...criterion.scores);
    const leaders = criterion.scores
      .map((score, index) => ({ score, isin: fundOrder[index] }))
      .filter((entry) => entry.score === max && entry.isin);
    const tie = leaders.length > 1;
    const winnerIsin = tie ? null : (leaders[0]?.isin ?? null);
    return {
      criterion,
      winnerIsin,
      winnerLabel: winnerIsin ? (nameByIsin.get(winnerIsin) ?? winnerIsin) : null,
      tie,
    };
  });
}

export function sharedFundAlerts(results: UcFundResultScore[]): string[] {
  if (results.length === 0) return [];
  const [first, ...rest] = results;
  const firstAlerts = first.alerts ?? [];
  return firstAlerts.filter((alert) => rest.every((fund) => fund.alerts?.includes(alert)));
}

export function buildUcComparisonNarrative(response: CompareResponse): string {
  const results = [...(response.results ?? [])].sort((a, b) => a.rank - b.rank);
  if (results.length === 0) return "";

  const leader = results[0];
  const runnerUp = results[1];
  const gap =
    response.score_gap ??
    (runnerUp ? leader.score_relative_total - runnerUp.score_relative_total : 0);

  if (response.verdict === "CATEGORY_MISMATCH") {
    return "Les fonds ne sont pas dans la même catégorie : aucun classement n'est proposé.";
  }
  if (response.verdict === "INSUFFICIENT_DATA") {
    const thresholdPct = Math.round(ucConfidenceThreshold(response.scoring_profile) * 100);
    return `Trop de données manquent pour proposer un gagnant fiable (confiance < ${thresholdPct} %).`;
  }
  if (response.verdict === "TIE") {
    const names =
      runnerUp != null
        ? `${leader.nom} (${leader.score_relative_total.toFixed(1)}/100) et ${runnerUp.nom} (${runnerUp.score_relative_total.toFixed(1)}/100)`
        : leader.nom;
    return `Égalité technique : ${names} sont quasi équivalents (écart ${Math.abs(gap).toFixed(1)} pt, seuil 2 pts). Aucun gagnant n'est désigné — à trancher selon votre préférence horizon (court vs long terme) et le profil client.`;
  }

  const winner = results.find((f) => f.isin === response.winner_isin) ?? leader;
  const second = results.find((f) => f.rank === 2);

  const winners = resolveCriterionWinners(response).filter((w) => w.criterion.available);
  const wonByWinner = winners.filter((w) => w.winnerIsin === winner.isin);
  const lostByWinner = winners.filter(
    (w) => w.winnerIsin && w.winnerIsin !== winner.isin && !w.tie
  );

  const parts: string[] = [];
  parts.push(
    `${winner.nom} arrive en tête avec ${winner.score_relative_total.toFixed(1)}/100` +
      (second
        ? `, soit +${gap.toFixed(1)} point${gap > 1 ? "s" : ""} d'écart sur ${second.nom}.`
        : ".")
  );

  const alphaSentence = categoryAlphaSentence(winner);
  if (alphaSentence) parts.push(alphaSentence);

  if (wonByWinner.length > 0) {
    const labels = wonByWinner
      .sort((a, b) => b.criterion.weight_global - a.criterion.weight_global)
      .map((w) => w.criterion.label.toLowerCase());
    parts.push(`Points forts : ${labels.join(", ")}.`);
  }

  if (lostByWinner.length > 0) {
    const byFund = new Map<string, string[]>();
    for (const w of lostByWinner) {
      if (!w.winnerIsin) continue;
      const list = byFund.get(w.winnerIsin) ?? [];
      list.push(w.criterion.label.toLowerCase());
      byFund.set(w.winnerIsin, list);
    }
    for (const [isin, labels] of byFund) {
      const name = results.find((f) => f.isin === isin)?.nom ?? isin;
      parts.push(`${name} reste meilleur sur : ${labels.join(", ")}.`);
    }
  }

  const unavailable = response.criteria.filter((c) => !c.available);
  if (unavailable.length > 0) {
    parts.push(
      `${unavailable.map((c) => c.label).join(", ")} : donnée absente — poids redistribué sur les autres critères (le score final reste sur 100).`
    );
  }

  const commonAlerts = sharedFundAlerts(results);
  if (commonAlerts.length > 0) {
    parts.push(`Alertes communes à tous les fonds : ${commonAlerts.join(" ")}`);
  }

  return parts.join(" ");
}

// Seuil sous lequel l'écart annuel moyen face à la catégorie ne mérite pas d'être commenté.
const CATEGORY_ALPHA_MIN = 0.3;

/**
 * L'alpha ne change pas le classement — les fonds comparés partagent leur catégorie, donc leur
 * référence — mais il dit si le gagnant bat son marché ou s'il en est seulement le moins en retard.
 */
function categoryAlphaSentence(winner: UcFundResultScore): string | null {
  const alpha = winner.category_alpha_avg;
  if (alpha == null || !Number.isFinite(alpha) || Math.abs(alpha) < CATEGORY_ALPHA_MIN) {
    return null;
  }
  const value = Math.abs(alpha).toFixed(1);
  if (alpha > 0) {
    return `Sur les années publiées, il devance sa catégorie de ${value} point par an en moyenne.`;
  }
  return `Sur les années publiées, il reste en retard de ${value} point par an sur sa catégorie : il gagne la comparaison sans battre son marché.`;
}

export function fundsInRankOrder(results: UcFundResultScore[]): UcFundResultScore[] {
  return [...results].sort((a, b) => a.rank - b.rank);
}

export function scoreForFundOnCriterion(
  criterion: UcCriterionScore,
  fundOrder: string[],
  isin: string
): number | null {
  const index = fundOrder.indexOf(isin);
  if (index < 0) return null;
  return criterion.scores[index] ?? null;
}
