use crate::uc_comparator::scoring_profile::ScoringProfile;
use crate::uc_comparator::types::UcFundInput;

const AUM_ALERT_THRESHOLD_MEUR: f64 = 50.0;
const MOMENTUM_YTD_GAP_PTS: f64 = 5.0;

pub fn collect_fund_alerts(fund: &UcFundInput, profile: ScoringProfile) -> Vec<String> {
    let mut alerts = Vec::new();

    if let Some(sharpe) = fund.sharpe_3y {
        if sharpe < 0.0 {
            alerts.push(
                "ℹ️ Efficience négative sur 3 ans (sous-score Sharpe = 0)".to_string(),
            );
        }
    }

    if let Some(aum) = fund.aum_meur {
        if aum < AUM_ALERT_THRESHOLD_MEUR {
            alerts.push(format!(
                "⚠️ Encours < {AUM_ALERT_THRESHOLD_MEUR:.0} M€ : risque de liquidité ou de fermeture"
            ));
        }
    }

    if profile == ScoringProfile::Equity {
        const TOP10_ALERT_THRESHOLD: f64 = 50.0;
        if let Some(top10) = fund.top10_percent {
            if top10 > TOP10_ALERT_THRESHOLD {
                alerts.push(
                    "⚠️ Concentration Top 10 > 50 % : risque idiosyncratique".to_string(),
                );
            }
        }

        if let (Some(ytd), Some(p3)) = (fund.perf_ytd, fund.perf_3ans) {
            if ytd < p3 - MOMENTUM_YTD_GAP_PTS {
                alerts.push("⚠️ Momentum YTD en décrochage".to_string());
            }
        }
    }

    alerts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::uc_comparator::types::UcFundInput;

    fn fund(top10: Option<f64>, ytd: Option<f64>, p3: Option<f64>) -> UcFundInput {
        UcFundInput {
            isin: "FR001".into(),
            nom: "Test".into(),
            categorie: Some("Obligations".into()),
            sri: None,
            perf_1an: None,
            perf_3ans: p3,
            perf_5ans: None,
            perf_ytd: ytd,
            sharpe_3y: None,
            top10_percent: top10,
            max_drawdown_3y: None,
            aum_meur: None,
        }
    }

    #[test]
    fn obligations_skip_top10_and_momentum_alerts() {
        let alerts = collect_fund_alerts(
            &fund(Some(95.0), Some(1.0), Some(10.0)),
            ScoringProfile::Obligations,
        );
        assert!(alerts.is_empty());
    }

    #[test]
    fn equity_keeps_top10_alert() {
        let alerts = collect_fund_alerts(
            &fund(Some(95.0), None, None),
            ScoringProfile::Equity,
        );
        assert!(alerts.iter().any(|a| a.contains("Top 10")));
    }
}
