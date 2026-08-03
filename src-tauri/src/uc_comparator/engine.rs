use crate::uc_comparator::alerts::collect_fund_alerts;
use crate::uc_comparator::eligibility::{categories_match, evaluate_categories, shared_category_label};
use crate::uc_comparator::normalize::{
    min_max_higher_better, score_aum_meur, score_drawdown_group, score_perf5_group,
    score_sharpe_group, score_top10_percent,
};
use crate::uc_comparator::types::{
    UcComparisonResult, UcCriterionScore, UcFundInput, UcFundResultScore, UcPilierScores,
    UcScoringVersion, UcVerdict,
};

const CONFIDENCE_THRESHOLD: f64 = 0.70;
const TIE_SCORE_GAP: f64 = 2.0;

struct CriterionDef {
    key: &'static str,
    label: &'static str,
    weight_v1: f64,
    weight_v15: f64,
    pilier: Pilier,
}

#[derive(Clone, Copy)]
enum Pilier {
    Performance,
    Risque,
    Structure,
}

const CRITERIA: [CriterionDef; 7] = [
    CriterionDef {
        key: "perf_1an",
        label: "Perf. 1 an",
        weight_v1: 0.08,
        weight_v15: 0.05,
        pilier: Pilier::Performance,
    },
    CriterionDef {
        key: "perf_3ans",
        label: "Perf. 3 ans",
        weight_v1: 0.16,
        weight_v15: 0.10,
        pilier: Pilier::Performance,
    },
    CriterionDef {
        key: "perf_5ans",
        label: "Perf. 5 ans",
        weight_v1: 0.16,
        weight_v15: 0.10,
        pilier: Pilier::Performance,
    },
    CriterionDef {
        key: "sharpe_3y",
        label: "Sharpe 3 ans",
        weight_v1: 0.45,
        weight_v15: 0.35,
        pilier: Pilier::Risque,
    },
    CriterionDef {
        key: "max_drawdown",
        label: "Max drawdown",
        weight_v1: 0.0,
        weight_v15: 0.20,
        pilier: Pilier::Risque,
    },
    CriterionDef {
        key: "aum",
        label: "Encours",
        weight_v1: 0.0,
        weight_v15: 0.10,
        pilier: Pilier::Structure,
    },
    CriterionDef {
        key: "top10",
        label: "Concentration Top 10",
        weight_v1: 0.15,
        weight_v15: 0.10,
        pilier: Pilier::Structure,
    },
];

pub fn run_comparison(
    funds: &[UcFundInput],
    version: UcScoringVersion,
) -> Result<UcComparisonResult, String> {
    if funds.len() < 2 || funds.len() > 4 {
        return Err("La comparaison requiert entre 2 et 4 fonds.".to_string());
    }

    if !categories_match(funds) {
        return Ok(build_category_mismatch_result(funds, version));
    }

    let category_eval = evaluate_categories(funds);

    let criterion_scores = compute_criterion_scores(funds, version);
    let confidence_index = compute_confidence(&criterion_scores, version);

    if confidence_index < CONFIDENCE_THRESHOLD {
        return Ok(build_insufficient_data_result(
            funds,
            version,
            confidence_index,
            criterion_scores,
        ));
    }

    let totals = compute_weighted_totals(&criterion_scores);
    let (verdict, winner_isin, score_gap) = determine_verdict(funds, &totals, &criterion_scores);
    let ranked = build_ranked_results(funds, &totals, &criterion_scores, version);

    let mut result = UcComparisonResult {
        scoring_version: version,
        category: shared_category_label(funds),
        is_same_category: category_eval.exact_match,
        category_warning: category_eval.subcategory_warning,
        confidence_index,
        verdict,
        winner_isin,
        score_gap,
        funds: ranked,
        criteria: criterion_scores,
        raw_json_payload: String::new(),
    };
    result.raw_json_payload =
        serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string());
    Ok(result)
}

fn compute_criterion_scores(
    funds: &[UcFundInput],
    version: UcScoringVersion,
) -> Vec<UcCriterionScore> {
    CRITERIA
        .iter()
        .filter_map(|def| {
            let weight = match version {
                UcScoringVersion::V1 => def.weight_v1,
                UcScoringVersion::V15 => def.weight_v15,
            };
            if weight <= 0.0 {
                return None;
            }
            let raw = extract_raw_values(funds, def.key);
            let available = raw.iter().all(|v| v.is_some());
            let scores: Vec<f64> = if available {
                compute_scores_for_criterion(def.key, &raw)
                    .into_iter()
                    .map(|s| s.unwrap_or(0.0))
                    .collect()
            } else {
                vec![0.0; funds.len()]
            };
            Some(UcCriterionScore {
                key: def.key.to_string(),
                label: def.label.to_string(),
                weight_global: weight,
                scores,
                available,
            })
        })
        .collect()
}

fn extract_raw_values(funds: &[UcFundInput], key: &str) -> Vec<Option<f64>> {
    funds
        .iter()
        .map(|f| match key {
            "perf_1an" => f.perf_1an,
            "perf_3ans" => f.perf_3ans,
            "perf_5ans" => f.perf_5ans,
            "sharpe_3y" => f.sharpe_3y,
            "max_drawdown" => f.max_drawdown_3y,
            "aum" => f.aum_meur,
            "top10" => f.top10_percent,
            _ => None,
        })
        .collect()
}

fn compute_scores_for_criterion(key: &str, raw: &[Option<f64>]) -> Vec<Option<f64>> {
    match key {
        "perf_1an" | "perf_3ans" => min_max_higher_better(raw),
        "perf_5ans" => score_perf5_group(raw),
        "sharpe_3y" => score_sharpe_group(raw),
        "max_drawdown" => score_drawdown_group(raw),
        "aum" => raw.iter().map(|v| v.map(score_aum_meur)).collect(),
        "top10" => raw.iter().map(|v| v.map(score_top10_percent)).collect(),
        _ => vec![None; raw.len()],
    }
}

fn compute_confidence(criteria: &[UcCriterionScore], version: UcScoringVersion) -> f64 {
    let total_theoretical = CRITERIA
        .iter()
        .map(|d| match version {
            UcScoringVersion::V1 => d.weight_v1,
            UcScoringVersion::V15 => d.weight_v15,
        })
        .sum::<f64>();
    let available_weight: f64 = criteria
        .iter()
        .filter(|c| c.available)
        .map(|c| c.weight_global)
        .sum();
    if total_theoretical <= 0.0 {
        return 0.0;
    }
    available_weight / total_theoretical
}

fn compute_weighted_totals(criteria: &[UcCriterionScore]) -> Vec<f64> {
    let available: Vec<&UcCriterionScore> = criteria.iter().filter(|c| c.available).collect();
    let weight_sum: f64 = available.iter().map(|c| c.weight_global).sum();
    let n = criteria.first().map(|c| c.scores.len()).unwrap_or(0);
    if weight_sum <= 0.0 {
        return vec![0.0; n];
    }
    let mut totals = vec![0.0; n];
    for crit in available {
        let w = crit.weight_global / weight_sum;
        for (i, score) in crit.scores.iter().enumerate() {
            totals[i] += w * score;
        }
    }
    totals
        .into_iter()
        .map(|s| (s * 100.0).round() / 100.0)
        .collect()
}

fn determine_verdict(
    funds: &[UcFundInput],
    totals: &[f64],
    criteria: &[UcCriterionScore],
) -> (UcVerdict, Option<String>, Option<f64>) {
    let (best_idx, second_idx) = top_two_indices(totals);
    let gap = totals[best_idx] - totals[second_idx];

    // Égalité uniquement si l'écart global est faible. Le partage des critères
    // (ex. 3-2 sur 5) ne doit pas annuler un écart net significatif (ex. +8,8 pts).
    if gap <= TIE_SCORE_GAP {
        return (UcVerdict::Tie, None, Some(gap));
    }

    let _ = (criteria, funds.len());
    (
        UcVerdict::WinnerDeclared,
        Some(funds[best_idx].isin.clone()),
        Some(gap),
    )
}

fn top_two_indices(totals: &[f64]) -> (usize, usize) {
    let mut indexed: Vec<(usize, f64)> = totals.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let best = indexed.first().map(|(i, _)| *i).unwrap_or(0);
    let second = indexed.get(1).map(|(i, _)| *i).unwrap_or(best);
    (best, second)
}

fn build_ranked_results(
    funds: &[UcFundInput],
    totals: &[f64],
    criteria: &[UcCriterionScore],
    version: UcScoringVersion,
) -> Vec<UcFundResultScore> {
    let mut indexed: Vec<(usize, f64)> = totals.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    indexed
        .into_iter()
        .enumerate()
        .map(|(rank, (fund_idx, total))| {
            let pilier = compute_pilier_scores(fund_idx, criteria, version);
            let criterion_scores: Vec<f64> = criteria
                .iter()
                .map(|c| c.scores.get(fund_idx).copied().unwrap_or(0.0))
                .collect();
            UcFundResultScore {
                isin: funds[fund_idx].isin.clone(),
                nom: funds[fund_idx].nom.clone(),
                rank: rank + 1,
                score_relative_total: total,
                pilier_scores: pilier,
                criterion_scores,
                alerts: collect_fund_alerts(&funds[fund_idx]),
            }
        })
        .collect()
}

fn compute_pilier_scores(
    fund_idx: usize,
    criteria: &[UcCriterionScore],
    version: UcScoringVersion,
) -> UcPilierScores {
    let mut perf = Vec::new();
    let mut risque = Vec::new();
    let mut structure = Vec::new();

    for def in CRITERIA.iter() {
        let weight = match version {
            UcScoringVersion::V1 => def.weight_v1,
            UcScoringVersion::V15 => def.weight_v15,
        };
        if weight <= 0.0 {
            continue;
        }
        let crit = match criteria.iter().find(|c| c.key == def.key) {
            Some(c) if c.available => c,
            _ => continue,
        };
        let score = crit.scores.get(fund_idx).copied().unwrap_or(0.0);
        match def.pilier {
            Pilier::Performance => perf.push((weight, score)),
            Pilier::Risque => risque.push((weight, score)),
            Pilier::Structure => structure.push((weight, score)),
        }
    }

    UcPilierScores {
        performance: weighted_avg(&perf),
        risque: weighted_avg(&risque),
        structure: weighted_avg(&structure),
    }
}

fn weighted_avg(items: &[(f64, f64)]) -> Option<f64> {
    if items.is_empty() {
        return None;
    }
    let w_sum: f64 = items.iter().map(|(w, _)| w).sum();
    if w_sum <= 0.0 {
        return None;
    }
    let sum: f64 = items.iter().map(|(w, s)| w * s).sum();
    Some(((sum / w_sum) * 100.0).round() / 100.0)
}

fn build_category_mismatch_result(
    funds: &[UcFundInput],
    version: UcScoringVersion,
) -> UcComparisonResult {
    let ranked = funds
        .iter()
        .enumerate()
        .map(|(i, f)| UcFundResultScore {
            isin: f.isin.clone(),
            nom: f.nom.clone(),
            rank: i + 1,
            score_relative_total: 0.0,
            pilier_scores: UcPilierScores::default(),
            criterion_scores: vec![],
            alerts: collect_fund_alerts(f),
        })
        .collect();
    UcComparisonResult {
        scoring_version: version,
        category: None,
        is_same_category: false,
        category_warning: None,
        confidence_index: 0.40,
        verdict: UcVerdict::CategoryMismatch,
        winner_isin: None,
        score_gap: None,
        funds: ranked,
        criteria: vec![],
        raw_json_payload: String::new(),
    }
}

fn build_insufficient_data_result(
    funds: &[UcFundInput],
    version: UcScoringVersion,
    confidence_index: f64,
    criteria: Vec<UcCriterionScore>,
) -> UcComparisonResult {
    let ranked = funds
        .iter()
        .enumerate()
        .map(|(i, f)| UcFundResultScore {
            isin: f.isin.clone(),
            nom: f.nom.clone(),
            rank: i + 1,
            score_relative_total: 0.0,
            pilier_scores: UcPilierScores::default(),
            criterion_scores: vec![],
            alerts: collect_fund_alerts(f),
        })
        .collect();
    UcComparisonResult {
        scoring_version: version,
        category: shared_category_label(funds),
        is_same_category: true,
        category_warning: None,
        confidence_index,
        verdict: UcVerdict::InsufficientData,
        winner_isin: None,
        score_gap: None,
        funds: ranked,
        criteria,
        raw_json_payload: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::uc_comparator::types::UcFundInput;

    fn candidate(
        isin: &str,
        p1: f64,
        p3: f64,
        p5: f64,
        sharpe: f64,
        top10: f64,
    ) -> UcFundInput {
        UcFundInput {
            isin: isin.to_string(),
            nom: format!("Fonds {isin}"),
            categorie: Some("Actions Europe".to_string()),
            sri: Some(4),
            perf_1an: Some(p1),
            perf_3ans: Some(p3),
            perf_5ans: Some(p5),
            perf_ytd: None,
            sharpe_3y: Some(sharpe),
            top10_percent: Some(top10),
            max_drawdown_3y: None,
            aum_meur: None,
        }
    }

    #[test]
    fn engine_v1_characterization_alpha_vs_beta() {
        let alpha = candidate("FR001", 5.0, 20.0, 35.0, 0.70, 35.0);
        let beta = candidate("FR002", 10.0, 15.0, 25.0, 0.30, 50.0);

        let result = run_comparison(&[alpha, beta], UcScoringVersion::V1).expect("comparison");

        assert_eq!(result.verdict, UcVerdict::WinnerDeclared);
        assert_eq!(result.winner_isin.as_deref(), Some("FR001"));
        assert!((result.confidence_index - 1.0).abs() < f64::EPSILON);

        let score_alpha = result
            .funds
            .iter()
            .find(|f| f.isin == "FR001")
            .map(|f| f.score_relative_total)
            .expect("alpha");
        let score_beta = result
            .funds
            .iter()
            .find(|f| f.isin == "FR002")
            .map(|f| f.score_relative_total)
            .expect("beta");

        assert!((score_alpha - 89.50).abs() < 0.01, "alpha={score_alpha}");
        assert!((score_beta - 32.29).abs() < 0.01, "beta={score_beta}");
        assert!((score_alpha - score_beta) > 2.0);
    }

    #[test]
    fn rejects_wrong_fund_count() {
        let fund = candidate("FR001", 1.0, 2.0, 3.0, 0.5, 40.0);
        assert!(run_comparison(&[fund], UcScoringVersion::V1).is_err());
    }

    #[test]
    fn category_mismatch_blocks_winner() {
        let a = candidate("FR001", 5.0, 20.0, 35.0, 0.7, 35.0);
        let mut b = candidate("FR002", 10.0, 15.0, 25.0, 0.3, 50.0);
        b.categorie = Some("Obligations Euro".to_string());

        let result = run_comparison(&[a, b], UcScoringVersion::V1).expect("comparison");
        assert_eq!(result.verdict, UcVerdict::CategoryMismatch);
        assert!(result.winner_isin.is_none());
    }

    #[test]
    fn three_funds_close_sharpe_is_technical_tie_not_couperet() {
        let fidelity = UcFundInput {
            isin: "LU0099574567".to_string(),
            nom: "Fidelity Global Tech".to_string(),
            categorie: Some("Actions Secteur Technologies".to_string()),
            sri: Some(6),
            perf_1an: Some(20.0),
            perf_3ans: Some(67.0),
            perf_5ans: Some(88.9),
            perf_ytd: None,
            sharpe_3y: Some(1.20),
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
        };
        let pictet = UcFundInput {
            isin: "LU1279334210".to_string(),
            nom: "Pictet Robotics".to_string(),
            categorie: Some("Actions Secteur Technologies".to_string()),
            sri: Some(6),
            perf_1an: Some(28.6),
            perf_3ans: Some(74.4),
            perf_5ans: Some(78.3),
            perf_ytd: None,
            sharpe_3y: Some(1.23),
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
        };
        let sextant = UcFundInput {
            isin: "FR0011050863".to_string(),
            nom: "Sextant Tech A".to_string(),
            categorie: Some("Actions Secteur Technologies".to_string()),
            sri: Some(6),
            perf_1an: Some(-0.3),
            perf_3ans: Some(23.0),
            perf_5ans: Some(5.4),
            perf_ytd: None,
            sharpe_3y: Some(-0.22),
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
        };

        let result = run_comparison(
            &[fidelity, pictet, sextant],
            UcScoringVersion::V1,
        )
        .expect("comparison");

        let pictet_score = result
            .funds
            .iter()
            .find(|f| f.isin == "LU1279334210")
            .map(|f| f.score_relative_total)
            .expect("pictet");
        let fidelity_score = result
            .funds
            .iter()
            .find(|f| f.isin == "LU0099574567")
            .map(|f| f.score_relative_total)
            .expect("fidelity");

        // Avant correctif Sharpe : Fidelity ~41/100 et écart +56. Après : scores proches.
        assert!(fidelity_score > 90.0, "fidelity={fidelity_score}");
        assert!(pictet_score > 95.0, "pictet={pictet_score}");
        assert!((pictet_score - fidelity_score) < 6.0, "gap={}", pictet_score - fidelity_score);

        let sharpe_crit = result
            .criteria
            .iter()
            .find(|c| c.key == "sharpe_3y")
            .expect("sharpe");
        let fidelity_idx = 0;
        let pictet_idx = 1;
        assert!(sharpe_crit.scores[fidelity_idx] > 95.0);
        assert!((sharpe_crit.scores[pictet_idx] - 100.0).abs() < 0.1);
    }

    #[test]
    fn pictet_vs_fidelity_declares_winner_when_gap_above_tie_threshold() {
        let pictet = UcFundInput {
            isin: "LU1279334210".to_string(),
            nom: "Pictet Robotics".to_string(),
            categorie: Some("Actions Secteur Technologies".to_string()),
            sri: Some(6),
            perf_1an: Some(28.6),
            perf_3ans: Some(74.4),
            perf_5ans: Some(78.3),
            perf_ytd: None,
            sharpe_3y: Some(1.23),
            top10_percent: Some(45.7),
            max_drawdown_3y: None,
            aum_meur: None,
        };
        let fidelity = UcFundInput {
            isin: "LU0099574567".to_string(),
            nom: "Fidelity Global Tech".to_string(),
            categorie: Some("Actions Secteur Technologies".to_string()),
            sri: Some(6),
            perf_1an: Some(20.0),
            perf_3ans: Some(67.0),
            perf_5ans: Some(88.9),
            perf_ytd: None,
            sharpe_3y: Some(1.20),
            top10_percent: Some(45.1),
            max_drawdown_3y: None,
            aum_meur: None,
        };

        let result = run_comparison(&[pictet, fidelity], UcScoringVersion::V1).expect("comparison");

        assert_eq!(result.verdict, UcVerdict::WinnerDeclared);
        assert_eq!(result.winner_isin.as_deref(), Some("LU1279334210"));
        let gap = result.score_gap.expect("gap");
        assert!(gap > TIE_SCORE_GAP, "gap={gap}");
    }
}
