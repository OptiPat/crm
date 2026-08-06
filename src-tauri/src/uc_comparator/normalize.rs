//! Normalisation des critères : caps absolus, min-max relatif, scores absolus directs.

const PERF5_NEGATIVE_CAP: f64 = 30.0;

/// Amplitude minimale entre scores pour qu'un critère départage réellement les fonds.
/// 0,01 laissait passer du bruit : deux Sharpe à 1,20 et 1,23 (97,6 contre 100) ou deux Top 10 à
/// 45,1 % et 45,7 % (50 contre 48) étaient annoncés comme points forts en comité. Le critère ne
/// désigne un gagnant qu'au-delà de 5 points de score ; les scores eux-mêmes sont inchangés.
pub const SCORE_DISCRIMINANT_EPSILON: f64 = 5.0;

/// Min-max relatif « plus haut = mieux ». Écart brut sous `min_significant_delta` → 50 pour tous.
/// `full_spread_delta` ancre l'échelle : l'écart de score devient proportionnel à l'écart réel au
/// lieu de sauter à 0 contre 100 dès le franchissement du plancher. `0.0` = min-max pur.
pub fn min_max_higher_better(
    values: &[Option<f64>],
    min_significant_delta: f64,
    full_spread_delta: f64,
) -> Vec<Option<f64>> {
    let present: Vec<f64> = values.iter().filter_map(|v| *v).collect();
    if present.is_empty() {
        return vec![None; values.len()];
    }
    let min = present.iter().copied().fold(f64::INFINITY, f64::min);
    let max = present.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if max - min < min_significant_delta {
        return values.iter().map(|raw| raw.map(|_| 50.0)).collect();
    }
    if full_spread_delta > 0.0 {
        let center = group_center(&present);
        return values
            .iter()
            .map(|raw| raw.map(|v| anchored_score(v - center, full_spread_delta)))
            .collect();
    }
    values
        .iter()
        .map(|raw| raw.map(|v| min_max_value(v, min, max)))
        .collect()
}

/// Point qui vaut 50 : la **médiane** du groupe, pas le milieu des extrêmes. Un seul fonds très
/// décroché déplaçait ce milieu et envoyait les deux premiers au-delà du plafond, donc à égalité
/// à 100 : quatre fonds Asie allant de +9,5 % à +81,5 % sur trois ans centraient l'échelle sur
/// 45,5 %, et les 4 points qui séparaient réellement les deux leaders disparaissaient. La médiane
/// ne bouge pas quand un fonds décroche. Sur deux fonds, elle vaut le milieu des extrêmes : les
/// comparatifs par paire sont inchangés.
fn group_center(present: &[f64]) -> f64 {
    let mut sorted = present.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = sorted.len();
    if n == 0 {
        return 0.0;
    }
    if n % 2 == 1 {
        sorted[n / 2]
    } else {
        (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
    }
}

/// Score centré sur 50 au niveau de la médiane du groupe, l'amplitude complète étant atteinte à
/// `full_spread_delta` d'écart brut. Au-delà, on borne : l'ordre reste strict, l'écart plafonne.
fn anchored_score(gap_to_center: f64, full_spread_delta: f64) -> f64 {
    let half = full_spread_delta / 2.0;
    (50.0 + 50.0 * (gap_to_center / half)).clamp(0.0, 100.0)
}

/// Un critère dont tous les scores sont identiques n'apporte aucune information au classement
/// (perfs sous le seuil de significativité, ou Sharpe de tous les fonds ≤ 0 en marché baissier).
pub fn scores_are_discriminant(scores: &[f64]) -> bool {
    if scores.len() < 2 {
        return false;
    }
    let min = scores.iter().copied().fold(f64::INFINITY, f64::min);
    let max = scores.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    max - min > SCORE_DISCRIMINANT_EPSILON
}

/// Min-max relatif « plus bas = mieux » (volatilité). Écart brut sous `min_significant_delta`
/// → 50 pour tous : deux fonds séparés par 0,3 point de volatilité ne se départagent pas.
pub fn min_max_lower_better(
    values: &[Option<f64>],
    min_significant_delta: f64,
    full_spread_delta: f64,
) -> Vec<Option<f64>> {
    let present: Vec<f64> = values.iter().filter_map(|v| *v).collect();
    if present.is_empty() {
        return vec![None; values.len()];
    }
    let min = present.iter().copied().fold(f64::INFINITY, f64::min);
    let max = present.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if max - min < min_significant_delta {
        return values.iter().map(|raw| raw.map(|_| 50.0)).collect();
    }
    if full_spread_delta > 0.0 {
        let center = group_center(&present);
        return values
            .iter()
            .map(|raw| raw.map(|v| anchored_score(center - v, full_spread_delta)))
            .collect();
    }
    values
        .iter()
        .map(|raw| raw.map(|v| min_max_value_inverted(v, min, max)))
        .collect()
}

/// Rang Morningstar dans la catégorie : déjà un centile (1 = meilleur, 100 = pire), donc noté en
/// absolu. Pas de min-max, qui transformerait deux rangs voisins en 0 et 100.
pub fn score_category_rank(rank: f64) -> f64 {
    let clamped = rank.clamp(1.0, 100.0);
    ((100.0 - clamped) / 99.0) * 100.0
}

fn min_max_value(value: f64, min: f64, max: f64) -> f64 {
    if (max - min).abs() < f64::EPSILON {
        return 50.0;
    }
    ((value - min) / (max - min)) * 100.0
}

fn min_max_value_inverted(abs_dd: f64, min: f64, max: f64) -> f64 {
    if (max - min).abs() < f64::EPSILON {
        return 50.0;
    }
    ((max - abs_dd) / (max - min)) * 100.0
}

/// Sharpe ≤ 0 → 0 ; min-max relatif sur Sharpe > 0 avec plancher à 0
/// (un fonds négatif ne doit pas faire tomber le 2e meilleur Sharpe positif à 0).
pub fn score_sharpe_group(sharpes: &[Option<f64>]) -> Vec<Option<f64>> {
    let mut scores = vec![None; sharpes.len()];
    let positive: Vec<(usize, f64)> = sharpes
        .iter()
        .enumerate()
        .filter_map(|(i, s)| {
            let v = *s.as_ref()?;
            if v > 0.0 {
                Some((i, v))
            } else {
                scores[i] = Some(0.0);
                None
            }
        })
        .collect();
    if positive.is_empty() {
        return scores;
    }
    let max = positive
        .iter()
        .map(|(_, v)| *v)
        .fold(f64::NEG_INFINITY, f64::max);
    if max <= 0.0 {
        return scores;
    }
    // Plancher relatif = 0 (cap amont), pas le min des Sharpe positifs du groupe.
    let min_floor = 0.0;
    for (i, v) in positive {
        scores[i] = Some(min_max_value(v, min_floor, max));
    }
    scores
}

/// Perf 5 ans : min-max relatif puis cap à 30 si perf brute < 0.
pub fn score_perf5_group(
    raw_perfs: &[Option<f64>],
    min_significant_delta: f64,
    full_spread_delta: f64,
) -> Vec<Option<f64>> {
    let relative = min_max_higher_better(raw_perfs, min_significant_delta, full_spread_delta);
    relative
        .into_iter()
        .zip(raw_perfs.iter())
        .map(|(score, raw)| match (score, raw) {
            (Some(s), Some(p)) if *p < 0.0 => Some(s.min(PERF5_NEGATIVE_CAP)),
            (other, _) => other,
        })
        .collect()
}

/// Concentration top 10 — score absolu linéaire inversé.
pub fn score_top10_percent(top10: f64) -> f64 {
    if top10 <= 30.0 {
        return 100.0;
    }
    if top10 >= 60.0 {
        return 0.0;
    }
    ((60.0 - top10) / 30.0) * 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn min_max_delta_zero_returns_fifty() {
        let vals = vec![Some(5.0), Some(5.0)];
        let scores = min_max_higher_better(&vals, 0.0, 0.0);
        assert_eq!(scores, vec![Some(50.0), Some(50.0)]);
    }

    #[test]
    fn min_max_below_significant_delta_returns_fifty_for_all() {
        let scores = min_max_higher_better(&[Some(12.0), Some(12.1)], 1.5, 15.0);
        assert_eq!(scores, vec![Some(50.0), Some(50.0)]);
    }

    #[test]
    fn min_max_above_significant_delta_keeps_relative_spread() {
        let scores = min_max_higher_better(&[Some(12.0), Some(20.0)], 1.5, 0.0);
        assert_eq!(scores, vec![Some(0.0), Some(100.0)]);
    }

    #[test]
    fn anchored_scale_keeps_a_small_gap_small() {
        // 7,4 pts de perf 3 ans cumulée pour une amplitude de référence de 30 : l'écart de score
        // reste proportionnel au lieu de sauter à 0 contre 100.
        let scores = min_max_higher_better(&[Some(67.0), Some(74.4)], 3.0, 30.0);
        let (a, b) = (scores[0].unwrap(), scores[1].unwrap());
        assert!((a - 37.7).abs() < 0.1, "{a}");
        assert!((b - 62.3).abs() < 0.1, "{b}");
    }

    #[test]
    fn anchored_scale_saturates_beyond_reference_amplitude() {
        let scores = min_max_higher_better(&[Some(10.0), Some(60.0)], 3.0, 30.0);
        assert_eq!(scores, vec![Some(0.0), Some(100.0)]);
    }

    #[test]
    fn anchored_scale_centers_on_the_median_not_the_extremes() {
        // Quatre fonds Asie sur 3 ans. Le retardataire à +9,5 % tirait le centre à 45,5 %, ce qui
        // envoyait les deux premiers au-delà du plafond : 100 contre 100 pour 4 points d'écart.
        // Médiane 63,2 % → ils sont de nouveau départagés, et le retardataire reste à 0.
        let scores = min_max_higher_better(&[Some(81.5), Some(77.3), Some(49.1), Some(9.5)], 3.0, 60.0);
        let s: Vec<f64> = scores.iter().map(|v| v.expect("score")).collect();
        assert!((s[0] - 80.5).abs() < 0.1, "{s:?}");
        assert!((s[1] - 73.5).abs() < 0.1, "{s:?}");
        assert!((s[2] - 26.5).abs() < 0.1, "{s:?}");
        assert!((s[3] - 0.0).abs() < 0.1, "{s:?}");
    }

    #[test]
    fn anchored_scale_median_equals_midpoint_on_two_funds() {
        // Invariant qui protège les comparatifs par paire : médiane et milieu des extrêmes
        // coïncident, donc le centrage sur la médiane ne change aucun duel.
        let pair = min_max_higher_better(&[Some(67.0), Some(74.4)], 3.0, 30.0);
        assert!((pair[0].expect("a") - 37.7).abs() < 0.1, "{pair:?}");
        assert!((pair[1].expect("b") - 62.3).abs() < 0.1, "{pair:?}");
    }

    #[test]
    fn anchored_scale_lower_better_centers_on_the_median() {
        // Volatilités Asie : trois fonds à 15,8-16,6 % et un à 21,1 %. La médiane désigne le
        // groupe serré comme référence, l'agité tombe à 0 sans écraser les trois autres.
        let scores =
            min_max_lower_better(&[Some(15.9), Some(21.1), Some(16.6), Some(15.8)], 1.0, 8.0);
        let s: Vec<f64> = scores.iter().map(|v| v.expect("score")).collect();
        assert!((s[0] - 54.375).abs() < 0.1, "{s:?}");
        assert!((s[1] - 0.0).abs() < 0.1, "{s:?}");
        assert!((s[2] - 45.625).abs() < 0.1, "{s:?}");
        assert!((s[3] - 55.625).abs() < 0.1, "{s:?}");
    }

    #[test]
    fn anchored_scale_lower_better_favours_the_calmest() {
        // 7 points de volatilité pour une amplitude de 8 : le fonds calme prend presque tout.
        let scores = min_max_lower_better(&[Some(16.8), Some(23.8)], 1.0, 8.0);
        let (calm, agitated) = (scores[0].unwrap(), scores[1].unwrap());
        assert!((calm - 93.75).abs() < 0.1, "{calm}");
        assert!((agitated - 6.25).abs() < 0.1, "{agitated}");
    }

    #[test]
    fn perf5_ignores_gap_below_threshold_but_keeps_negative_cap() {
        assert_eq!(
            score_perf5_group(&[Some(50.0), Some(50.5)], 5.0, 50.0),
            vec![Some(50.0), Some(50.0)]
        );
        // Sous le seuil mais perf négative : le cap absolu à 30 continue de s'appliquer.
        assert_eq!(
            score_perf5_group(&[Some(-2.0), Some(-2.5)], 5.0, 50.0),
            vec![Some(30.0), Some(30.0)]
        );
    }

    #[test]
    fn scores_all_equal_are_not_discriminant() {
        assert!(!scores_are_discriminant(&[50.0, 50.0]));
        assert!(!scores_are_discriminant(&[0.0, 0.0, 0.0]));
        assert!(scores_are_discriminant(&[0.0, 100.0]));
        assert!(scores_are_discriminant(&[50.0, 65.0]));
        // Bruit : 2,4 points de score ne désignent pas un gagnant de critère.
        assert!(!scores_are_discriminant(&[97.56, 100.0]));
        assert!(!scores_are_discriminant(&[50.0, 48.0]));
    }

    #[test]
    fn top10_absolute_scores() {
        assert!((score_top10_percent(35.0) - 83.333333).abs() < 0.01);
        assert!((score_top10_percent(50.0) - 33.333333).abs() < 0.01);
    }

    #[test]
    fn sharpe_non_positive_gets_zero() {
        let sharpes = vec![Some(0.7), Some(-0.1)];
        let scores = score_sharpe_group(&sharpes);
        assert_eq!(scores[0], Some(100.0));
        assert_eq!(scores[1], Some(0.0));
    }

    #[test]
    fn sharpe_relative_between_two_positive() {
        let sharpes = vec![Some(0.7), Some(0.3)];
        let scores = score_sharpe_group(&sharpes);
        assert!((scores[0].unwrap() - 100.0).abs() < f64::EPSILON);
        assert!((scores[1].unwrap() - (0.3 / 0.7 * 100.0)).abs() < 0.01);
    }

    #[test]
    fn sharpe_negative_does_not_zero_second_positive() {
        let sharpes = vec![Some(1.23), Some(1.20), Some(-0.22)];
        let scores = score_sharpe_group(&sharpes);
        assert!((scores[0].unwrap() - 100.0).abs() < 0.01);
        assert!((scores[1].unwrap() - (1.20 / 1.23 * 100.0)).abs() < 0.1);
        assert_eq!(scores[2], Some(0.0));
    }
}
