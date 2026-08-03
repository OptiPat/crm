use crate::uc_comparator::types::UcFundInput;

const AUM_ALERT_THRESHOLD_MEUR: f64 = 50.0;
const TOP10_ALERT_THRESHOLD: f64 = 50.0;
const MOMENTUM_YTD_GAP_PTS: f64 = 5.0;

pub fn collect_fund_alerts(fund: &UcFundInput) -> Vec<String> {
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

    alerts
}
