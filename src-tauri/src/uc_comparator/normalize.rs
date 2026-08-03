//! Normalisation des critères : caps absolus, min-max relatif, scores absolus directs.

const PERF5_NEGATIVE_CAP: f64 = 30.0;
const DRAWDOWN_HIGH_CAP: f64 = 20.0;
const DRAWDOWN_HIGH_THRESHOLD: f64 = 40.0;

/// Min-max relatif « plus haut = mieux ». Δ = 0 → 50 pour tous.
pub fn min_max_higher_better(values: &[Option<f64>]) -> Vec<Option<f64>> {
    let present: Vec<f64> = values.iter().filter_map(|v| *v).collect();
    if present.is_empty() {
        return vec![None; values.len()];
    }
    let min = present.iter().copied().fold(f64::INFINITY, f64::min);
    let max = present.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    values
        .iter()
        .map(|raw| raw.map(|v| min_max_value(v, min, max)))
        .collect()
}

/// Min-max relatif inversé sur |DD| (plus petit drawdown = mieux).
pub fn min_max_drawdown(values: &[Option<f64>]) -> Vec<Option<f64>> {
    let abs_vals: Vec<Option<f64>> = values
        .iter()
        .map(|v| v.map(|dd| dd.abs()))
        .collect();
    let present: Vec<f64> = abs_vals.iter().filter_map(|v| *v).collect();
    if present.is_empty() {
        return vec![None; values.len()];
    }
    let min = present.iter().copied().fold(f64::INFINITY, f64::min);
    let max = present.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    abs_vals
        .iter()
        .map(|raw| raw.map(|abs_dd| min_max_value_inverted(abs_dd, min, max)))
        .collect()
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
pub fn score_perf5_group(raw_perfs: &[Option<f64>]) -> Vec<Option<f64>> {
    let relative = min_max_higher_better(raw_perfs);
    relative
        .into_iter()
        .zip(raw_perfs.iter())
        .map(|(score, raw)| match (score, raw) {
            (Some(s), Some(p)) if *p < 0.0 => Some(s.min(PERF5_NEGATIVE_CAP)),
            (other, _) => other,
        })
        .collect()
}

/// Drawdown : min-max inversé puis cap à 20 si |DD| > 40 %.
pub fn score_drawdown_group(raw_dds: &[Option<f64>]) -> Vec<Option<f64>> {
    let relative = min_max_drawdown(raw_dds);
    relative
        .into_iter()
        .zip(raw_dds.iter())
        .map(|(score, raw)| match (score, raw) {
            (Some(s), Some(dd)) if dd.abs() > DRAWDOWN_HIGH_THRESHOLD => {
                Some(s.min(DRAWDOWN_HIGH_CAP))
            }
            (other, _) => other,
        })
        .collect()
}

/// Encours (M€) — score absolu logarithmique, pas de min-max.
pub fn score_aum_meur(aum: f64) -> f64 {
    if aum <= 10.0 {
        return 0.0;
    }
    if aum >= 200.0 {
        return 100.0;
    }
    let ln_aum = aum.ln();
    let ln_10 = 10.0_f64.ln();
    let ln_200 = 200.0_f64.ln();
    ((ln_aum - ln_10) / (ln_200 - ln_10)) * 100.0
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
        let scores = min_max_higher_better(&vals);
        assert_eq!(scores, vec![Some(50.0), Some(50.0)]);
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
