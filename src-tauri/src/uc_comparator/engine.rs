use crate::uc_comparator::alerts::collect_fund_alerts;
use crate::uc_comparator::bond_strategy::infer_bond_fund_profile;
use crate::uc_comparator::eligibility::{categories_match, evaluate_categories, shared_category_label};
use crate::uc_comparator::normalize::{
    min_max_higher_better, min_max_lower_better, score_category_rank, score_perf5_group,
    score_sharpe_group, score_top10_percent, scores_are_discriminant,
};
use crate::uc_comparator::scoring_profile::{
    criteria_for_profile, resolve_scoring_profile, CriterionDef, Pilier, ScoringProfile,
};
use crate::uc_comparator::types::{
    UcComparisonResult, UcCriterionScore, UcFundInput, UcFundResultScore, UcPilierScores,
    UcScoringVersion, UcVerdict,
};

const TIE_SCORE_GAP: f64 = 2.0;

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
    let profile = resolve_scoring_profile(funds);
    let confidence_threshold = profile.confidence_threshold();

    let criterion_scores = compute_criterion_scores(funds, version, profile);
    let confidence_index = compute_confidence(&criterion_scores, version, profile);

    if confidence_index < confidence_threshold {
        return Ok(build_insufficient_data_result(
            funds,
            version,
            profile,
            confidence_index,
            criterion_scores,
        ));
    }

    let totals = compute_weighted_totals(&criterion_scores);
    let (verdict, winner_isin, score_gap) = determine_verdict(funds, &totals, &criterion_scores);
    let ranked = build_ranked_results(funds, &totals, &criterion_scores, version, profile);

    let mut result = UcComparisonResult {
        scoring_version: version,
        scoring_profile: profile.as_str().to_string(),
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
    profile: ScoringProfile,
) -> Vec<UcCriterionScore> {
    criteria_for_profile(profile)
        .iter()
        .filter_map(|def| {
            let weight = criterion_weight(def, version);
            if weight <= 0.0 {
                return None;
            }
            let raw = extract_raw_values(funds, def.key);
            let available = raw.iter().all(|v| v.is_some());
            let scores: Vec<f64> = if available {
                compute_scores_for_criterion(def, &raw)
                    .into_iter()
                    .map(|s| s.unwrap_or(0.0))
                    .collect()
            } else {
                vec![0.0; funds.len()]
            };
            let discriminant = available && scores_are_discriminant(&scores);
            Some(UcCriterionScore {
                key: def.key.to_string(),
                label: def.label.to_string(),
                weight_global: weight,
                scores,
                available,
                discriminant,
            })
        })
        .collect()
}

fn criterion_weight(def: &CriterionDef, version: UcScoringVersion) -> f64 {
    match version {
        UcScoringVersion::V1 => def.weight_v1,
        UcScoringVersion::V2 => def.weight_v2,
    }
}

fn extract_raw_values(funds: &[UcFundInput], key: &str) -> Vec<Option<f64>> {
    funds
        .iter()
        .map(|f| match key {
            "perf_1an" => f.perf_1an,
            "perf_3ans" => f.perf_3ans,
            "perf_5ans" => f.perf_5ans,
            "sharpe_3y" => f.sharpe_3y,
            "vol_3ans" => f.vol_3ans,
            "worst_year" => f.worst_year_perf,
            "rang_categorie" => f.category_rank_avg,
            "top10" => f.top10_percent,
            _ => None,
        })
        .collect()
}

fn compute_scores_for_criterion(def: &CriterionDef, raw: &[Option<f64>]) -> Vec<Option<f64>> {
    match def.key {
        "perf_1an" | "perf_3ans" | "worst_year" => {
            min_max_higher_better(raw, def.min_significant_delta)
        }
        "perf_5ans" => score_perf5_group(raw, def.min_significant_delta),
        "sharpe_3y" => score_sharpe_group(raw),
        "vol_3ans" => min_max_lower_better(raw, def.min_significant_delta),
        "rang_categorie" => raw.iter().map(|v| v.map(score_category_rank)).collect(),
        "top10" => raw.iter().map(|v| v.map(score_top10_percent)).collect(),
        _ => vec![None; raw.len()],
    }
}

fn compute_confidence(
    criteria: &[UcCriterionScore],
    version: UcScoringVersion,
    profile: ScoringProfile,
) -> f64 {
    let total_theoretical: f64 = criteria_for_profile(profile)
        .iter()
        .map(|d| criterion_weight(d, version))
        .filter(|w| *w > 0.0)
        .sum();
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

fn bond_fields_for_fund(fund: &UcFundInput, profile: ScoringProfile) -> (Option<String>, Option<String>) {
    if profile != ScoringProfile::Obligations {
        return (None, None);
    }
    let inferred = infer_bond_fund_profile(fund.categorie.as_deref(), &fund.nom);
    (inferred.credit_quality, inferred.strategy)
}

fn build_ranked_results(
    funds: &[UcFundInput],
    totals: &[f64],
    criteria: &[UcCriterionScore],
    version: UcScoringVersion,
    profile: ScoringProfile,
) -> Vec<UcFundResultScore> {
    let mut indexed: Vec<(usize, f64)> = totals.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    indexed
        .into_iter()
        .enumerate()
        .map(|(rank, (fund_idx, total))| {
            let fund = &funds[fund_idx];
            let pilier = compute_pilier_scores(fund_idx, criteria, version, profile);
            let criterion_scores: Vec<f64> = criteria
                .iter()
                .map(|c| c.scores.get(fund_idx).copied().unwrap_or(0.0))
                .collect();
            let (bond_credit_quality, bond_strategy) = bond_fields_for_fund(fund, profile);
            UcFundResultScore {
                isin: fund.isin.clone(),
                nom: fund.nom.clone(),
                rank: rank + 1,
                score_relative_total: total,
                pilier_scores: pilier,
                criterion_scores,
                alerts: collect_fund_alerts(fund, profile),
                bond_credit_quality,
                bond_strategy,
                category_alpha_avg: fund.category_alpha_avg,
            }
        })
        .collect()
}

fn compute_pilier_scores(
    fund_idx: usize,
    criteria: &[UcCriterionScore],
    version: UcScoringVersion,
    profile: ScoringProfile,
) -> UcPilierScores {
    let mut perf = Vec::new();
    let mut risque = Vec::new();
    let mut structure = Vec::new();

    for def in criteria_for_profile(profile).iter() {
        let weight = criterion_weight(def, version);
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
    let profile = resolve_scoring_profile(funds);
    let ranked = funds
        .iter()
        .enumerate()
        .map(|(i, f)| {
            let (bond_credit_quality, bond_strategy) = bond_fields_for_fund(f, profile);
            UcFundResultScore {
                isin: f.isin.clone(),
                nom: f.nom.clone(),
                rank: i + 1,
                score_relative_total: 0.0,
                pilier_scores: UcPilierScores::default(),
                criterion_scores: vec![],
                alerts: collect_fund_alerts(f, profile),
                bond_credit_quality,
                bond_strategy,
                category_alpha_avg: f.category_alpha_avg,
            }
        })
        .collect();
    UcComparisonResult {
        scoring_version: version,
        scoring_profile: profile.as_str().to_string(),
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
    profile: ScoringProfile,
    confidence_index: f64,
    criteria: Vec<UcCriterionScore>,
) -> UcComparisonResult {
    let ranked = funds
        .iter()
        .enumerate()
        .map(|(i, f)| {
            let (bond_credit_quality, bond_strategy) = bond_fields_for_fund(f, profile);
            UcFundResultScore {
                isin: f.isin.clone(),
                nom: f.nom.clone(),
                rank: i + 1,
                score_relative_total: 0.0,
                pilier_scores: UcPilierScores::default(),
                criterion_scores: vec![],
                alerts: collect_fund_alerts(f, profile),
                bond_credit_quality,
                bond_strategy,
                category_alpha_avg: f.category_alpha_avg,
            }
        })
        .collect();
    UcComparisonResult {
        scoring_version: version,
        scoring_profile: profile.as_str().to_string(),
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
            vol_3ans: None,
            top10_percent: Some(top10),
            max_drawdown_3y: None,
            aum_meur: None,
            ..Default::default()
        }
    }

    fn oblig_candidate(
        isin: &str,
        nom: &str,
        p1: f64,
        p3: Option<f64>,
        sharpe: f64,
    ) -> UcFundInput {
        UcFundInput {
            isin: isin.to_string(),
            nom: nom.to_string(),
            categorie: Some("Obligations".to_string()),
            sri: Some(2),
            perf_1an: Some(p1),
            perf_3ans: p3,
            perf_5ans: None,
            perf_ytd: None,
            sharpe_3y: Some(sharpe),
            vol_3ans: None,
            top10_percent: Some(94.6),
            max_drawdown_3y: None,
            aum_meur: None,
            ..Default::default()
        }
    }

    #[test]
    fn engine_v1_characterization_alpha_vs_beta() {
        let alpha = candidate("FR001", 5.0, 20.0, 35.0, 0.70, 35.0);
        let beta = candidate("FR002", 10.0, 15.0, 25.0, 0.30, 50.0);

        let result = run_comparison(&[alpha, beta], UcScoringVersion::V1).expect("comparison");

        assert_eq!(result.verdict, UcVerdict::WinnerDeclared);
        assert_eq!(result.winner_isin.as_deref(), Some("FR001"));
        assert_eq!(result.scoring_profile, "equity");
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
    fn obligations_declares_winner_without_perf5_and_top10() {
        let funds = [
            oblig_candidate("FR001", "Amundi Oblig Internationales Flexible", 6.7, Some(13.3), 1.09),
            oblig_candidate("FR002", "Schelcher Short Term Z", 2.4, Some(11.0), 4.46),
        ];
        let result = run_comparison(&funds, UcScoringVersion::V1).expect("comparison");
        assert_eq!(result.scoring_profile, "obligations");
        assert_ne!(result.verdict, UcVerdict::InsufficientData);
        assert!(result.confidence_index >= 0.60);
        assert_eq!(result.winner_isin.as_deref(), Some("FR001"));
        assert!(result
            .criteria
            .iter()
            .all(|c| c.key != "top10" && c.key != "perf_5ans"));
        // Calibrage obligataire : 2,3 pts d'écart sur 3 ans doivent départager. Le seuil actions
        // (3 pts) les effacerait et ferait basculer le vainqueur sur le seul Sharpe.
        assert!(
            result
                .criteria
                .iter()
                .find(|c| c.key == "perf_3ans")
                .expect("perf_3ans")
                .discriminant,
            "seuil obligataire trop large"
        );
    }

    #[test]
    fn obligations_attach_strategy_and_skip_top10_alert() {
        let fund = oblig_candidate("FR001", "Ostrum Credit Ultra Short Plus RE", 2.2, Some(2.0), 1.39);
        let peer = oblig_candidate("FR002", "Schelcher Short Term Z", 2.4, Some(11.0), 4.46);
        let result = run_comparison(&[fund, peer], UcScoringVersion::V1).expect("comparison");
        let ostrum = result.funds.iter().find(|f| f.isin == "FR001").expect("ostrum");
        assert_eq!(
            ostrum.bond_strategy.as_deref(),
            Some("Ultra court terme / monétaire")
        );
        assert!(ostrum
            .alerts
            .iter()
            .all(|a| !a.contains("Concentration Top 10")));
    }

    #[test]
    fn near_identical_funds_end_in_technical_tie() {
        let a = candidate("FR001", 12.0, 30.0, 50.0, 0.80, 40.0);
        let b = candidate("FR002", 12.1, 30.2, 50.5, 0.82, 40.0);

        let result = run_comparison(&[a, b], UcScoringVersion::V1).expect("comparison");

        assert_eq!(result.verdict, UcVerdict::Tie);
        assert!(result.winner_isin.is_none());

        for key in ["perf_1an", "perf_3ans", "perf_5ans"] {
            let crit = result.criteria.iter().find(|c| c.key == key).expect(key);
            assert!(crit.available, "{key} disponible");
            assert!(!crit.discriminant, "{key} ne doit pas départager 0,1 pt d'écart");
            assert_eq!(crit.scores, vec![50.0, 50.0], "{key}");
        }

        let sharpe = result
            .criteria
            .iter()
            .find(|c| c.key == "sharpe_3y")
            .expect("sharpe");
        assert!(sharpe.discriminant, "le Sharpe reste sur une échelle proportionnelle");

        let gap = result.score_gap.expect("gap");
        assert!(gap <= TIE_SCORE_GAP, "gap={gap}");
    }

    #[test]
    fn sharpe_is_non_discriminant_when_all_funds_are_negative() {
        let a = candidate("FR001", 20.0, 40.0, 60.0, -0.10, 35.0);
        let b = candidate("FR002", 10.0, 20.0, 30.0, -0.50, 45.0);

        let result = run_comparison(&[a, b], UcScoringVersion::V1).expect("comparison");

        let sharpe = result
            .criteria
            .iter()
            .find(|c| c.key == "sharpe_3y")
            .expect("sharpe");
        assert!(sharpe.available, "les deux Sharpe sont renseignés");
        assert!(
            !sharpe.discriminant,
            "aucun Sharpe positif : le critère ne classe personne"
        );
        assert_eq!(sharpe.scores, vec![0.0, 0.0]);

        // Le poids Sharpe (45 %) reste compté sans rien rapporter : plafond à 55/100.
        let best = result
            .funds
            .iter()
            .map(|f| f.score_relative_total)
            .fold(f64::MIN, f64::max);
        assert!(best <= 55.0, "best={best}");
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
            vol_3ans: None,
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
            ..Default::default()
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
            vol_3ans: None,
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
            ..Default::default()
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
            vol_3ans: None,
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
            ..Default::default()
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
            vol_3ans: None,
            top10_percent: Some(45.7),
            max_drawdown_3y: None,
            aum_meur: None,
            ..Default::default()
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
            vol_3ans: None,
            top10_percent: Some(45.1),
            max_drawdown_3y: None,
            aum_meur: None,
            ..Default::default()
        };

        let result = run_comparison(&[pictet, fidelity], UcScoringVersion::V1).expect("comparison");

        assert_eq!(result.verdict, UcVerdict::WinnerDeclared);
        assert_eq!(result.winner_isin.as_deref(), Some("LU1279334210"));
        let gap = result.score_gap.expect("gap");
        assert!(gap > TIE_SCORE_GAP, "gap={gap}");
    }

    fn v2_candidate(
        isin: &str,
        perf: f64,
        sharpe: f64,
        vol: f64,
        worst_year: f64,
        rank: Option<f64>,
    ) -> UcFundInput {
        UcFundInput {
            isin: isin.to_string(),
            nom: format!("Fonds {isin}"),
            categorie: Some("Actions Europe".to_string()),
            sri: Some(5),
            perf_1an: Some(perf),
            perf_3ans: Some(perf * 3.0),
            perf_5ans: Some(perf * 5.0),
            sharpe_3y: Some(sharpe),
            vol_3ans: Some(vol),
            top10_percent: Some(40.0),
            worst_year_perf: Some(worst_year),
            category_rank_avg: rank,
            ..Default::default()
        }
    }

    /// Le Sharpe pesait 45 % en v1 : deux fonds au Sharpe voisin y étaient déclarés à égalité
    /// même si l'un avait divisé par deux la perte de sa pire année.
    #[test]
    fn v2_departage_sur_le_risque_quand_les_perfs_se_valent() {
        let calme = v2_candidate("FR001", 10.0, 0.82, 9.0, -8.0, None);
        let heurte = v2_candidate("FR002", 10.4, 0.80, 18.0, -31.0, None);

        let v1 = run_comparison(&[calme.clone(), heurte.clone()], UcScoringVersion::V1)
            .expect("comparison v1");
        assert_eq!(v1.verdict, UcVerdict::Tie);

        let v2 = run_comparison(&[calme, heurte], UcScoringVersion::V2).expect("comparison v2");
        assert_eq!(v2.verdict, UcVerdict::WinnerDeclared);
        assert_eq!(v2.winner_isin.as_deref(), Some("FR001"));
    }

    #[test]
    fn v2_note_le_rang_categorie_en_absolu() {
        let regulier = v2_candidate("FR001", 10.0, 0.80, 12.0, -20.0, Some(12.0));
        let irregulier = v2_candidate("FR002", 10.0, 0.80, 12.0, -20.0, Some(78.0));

        let result = run_comparison(&[regulier, irregulier], UcScoringVersion::V2)
            .expect("comparison");
        let rang = result
            .criteria
            .iter()
            .find(|c| c.key == "rang_categorie")
            .expect("critère rang");
        assert!(rang.available && rang.discriminant);
        // Échelle absolue : le rang 12 vaut ~89, le rang 78 ~22. Pas de 0 contre 100.
        assert!((rang.scores[0] - 88.9).abs() < 0.5, "{:?}", rang.scores);
        assert!((rang.scores[1] - 22.2).abs() < 0.5, "{:?}", rang.scores);
        assert_eq!(result.winner_isin.as_deref(), Some("FR001"));
    }

    /// Le rang vient du web : son absence doit redistribuer son poids, pas bloquer la comparaison.
    #[test]
    fn v2_reste_exploitable_sans_rang_categorie() {
        let result = run_comparison(
            &[
                v2_candidate("FR001", 12.0, 0.90, 10.0, -9.0, None),
                v2_candidate("FR002", 6.0, 0.40, 17.0, -28.0, None),
            ],
            UcScoringVersion::V2,
        )
        .expect("comparison");
        assert_eq!(result.verdict, UcVerdict::WinnerDeclared);
        assert!(result.confidence_index >= 0.70, "{}", result.confidence_index);
    }

    #[test]
    fn v2_neutralise_un_ecart_de_volatilite_insignifiant() {
        let result = run_comparison(
            &[
                v2_candidate("FR001", 10.0, 0.80, 12.0, -20.0, None),
                v2_candidate("FR002", 10.0, 0.80, 12.4, -20.0, None),
            ],
            UcScoringVersion::V2,
        )
        .expect("comparison");
        let vol = result
            .criteria
            .iter()
            .find(|c| c.key == "vol_3ans")
            .expect("critère volatilité");
        assert!(!vol.discriminant, "{:?}", vol.scores);
        assert_eq!(result.verdict, UcVerdict::Tie);
    }
}
