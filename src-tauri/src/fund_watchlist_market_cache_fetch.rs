//! Récupération Boursorama → cache marché (Top 10 + exposition) pour le comparateur UC.

use std::thread;
use std::time::Duration;

use crate::database::Database;
use crate::fund_watchlist_coach::boursorama::{
    boursorama_client, fetch_composition_for_isin, top10_concentration_percent,
    BoursoramaExposition, BoursoramaHoldingLine,
};
use crate::uc_comparator::types::UcFundExposition;

const FETCH_PAUSE_MS: u64 = 350;

pub struct BoursoramaCacheUpdate {
    pub isin: String,
    pub top10_percent: Option<f64>,
    pub exposition: UcFundExposition,
}

pub fn list_isins_missing_boursorama_data(
    database: &Database,
    isins: &[String],
) -> Result<Vec<String>, String> {
    if isins.is_empty() {
        return Ok(Vec::new());
    }
    let cached = database
        .get_fund_watchlist_market_cache_bulk(isins)
        .map_err(|e| format!("Lecture cache marché : {e}"))?;
    Ok(isins
        .iter()
        .map(|s| s.trim().to_uppercase())
        .filter(|isin| {
            if isin.is_empty() {
                return false;
            }
            let row = cached.iter().find(|row| row.isin == *isin);
            match row {
                None => true,
                Some(row) => {
                    row.top10_percent.is_none()
                        || row.exposition_json.is_none()
                        || exposition_from_cache_json(row.exposition_json.as_deref())
                            .map(|expo| expo.needs_boursorama_refresh())
                            .unwrap_or(false)
                }
            }
        })
        .collect())
}

/// Interroge Boursorama (hors verrou DB recommandé).
pub fn fetch_boursorama_cache_for_isins(
    isins: &[String],
) -> Result<Vec<BoursoramaCacheUpdate>, String> {
    if isins.is_empty() {
        return Ok(Vec::new());
    }
    let client = boursorama_client()?;
    let mut updates = Vec::new();
    for (index, isin) in isins.iter().enumerate() {
        if index > 0 {
            thread::sleep(Duration::from_millis(FETCH_PAUSE_MS));
        }
        let Some(data) = fetch_composition_for_isin(&client, isin)? else {
            continue;
        };
        let top10 = top10_concentration_percent(&data.holdings);
        let exposition = exposition_to_uc(&data.exposition, &data.holdings);
        if top10.is_none()
            && exposition.geo.is_empty()
            && exposition.sectors.is_empty()
            && exposition.holdings.is_empty()
            && exposition.style_box.is_none()
        {
            continue;
        }
        updates.push(BoursoramaCacheUpdate {
            isin: isin.clone(),
            top10_percent: top10,
            exposition,
        });
    }
    Ok(updates)
}

pub fn apply_boursorama_cache_updates(
    database: &Database,
    updates: &[BoursoramaCacheUpdate],
) -> Result<usize, String> {
    for update in updates {
        let exposition_json = if update.exposition.geo.is_empty()
            && update.exposition.sectors.is_empty()
            && update.exposition.asset_breakdown.is_empty()
            && update.exposition.holdings.is_empty()
            && update.exposition.style_box.is_none()
        {
            None
        } else {
            Some(
                serde_json::to_string(&update.exposition)
                    .map_err(|e| format!("Sérialisation exposition ({}) : {e}", update.isin))?,
            )
        };
        database
            .upsert_fund_watchlist_market_cache_boursorama(
                &update.isin,
                update.top10_percent,
                exposition_json.as_deref(),
            )
            .map_err(|e| format!("Écriture cache Boursorama ({}) : {e}", update.isin))?;
    }
    Ok(updates.len())
}

pub fn exposition_from_cache_json(json: Option<&str>) -> Option<UcFundExposition> {
    let raw = json?;
    serde_json::from_str(raw).ok()
}

fn exposition_to_uc(
    expo: &BoursoramaExposition,
    holdings: &[BoursoramaHoldingLine],
) -> UcFundExposition {
    UcFundExposition {
        geo: slices_to_uc(&expo.geo),
        sectors: slices_to_uc(&expo.sectors),
        asset_breakdown: slices_to_uc(&expo.asset_breakdown),
        holdings: holdings_to_uc(holdings),
        style_box: expo.style_box.as_ref().map(|box_| {
            crate::uc_comparator::types::UcStyleBox {
                cap: box_.cap.clone(),
                style: box_.style.clone(),
                label_fr: box_.label_fr.clone(),
            }
        }),
        source: "boursorama".to_string(),
    }
}

fn holdings_to_uc(holdings: &[BoursoramaHoldingLine]) -> Vec<crate::uc_comparator::types::UcExposureSlice> {
    holdings
        .iter()
        .take(6)
        .filter_map(|line| {
            line.weight_percent.map(|weight| crate::uc_comparator::types::UcExposureSlice {
                label: line.label.clone(),
                weight_percent: weight,
            })
        })
        .collect()
}

fn slices_to_uc(
    slices: &[crate::fund_watchlist_coach::boursorama::BoursoramaBreakdownSlice],
) -> Vec<crate::uc_comparator::types::UcExposureSlice> {
    slices
        .iter()
        .map(|slice| crate::uc_comparator::types::UcExposureSlice {
            label: slice.label.clone(),
            weight_percent: slice.weight_percent,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    #[test]
    fn exposition_from_cache_json_accepts_legacy_payload_without_asset_breakdown() {
        let legacy = r#"{"geo":[{"label":"Etats-Unis","weight_percent":72.3}],"sectors":[{"label":"Technologie","weight_percent":83.7}],"source":"boursorama"}"#;
        let expo = exposition_from_cache_json(Some(legacy)).expect("parse");
        assert_eq!(expo.geo.len(), 1);
        assert_eq!(expo.sectors.len(), 1);
        assert!(expo.asset_breakdown.is_empty());
    }

    #[test]
    fn list_missing_when_holdings_absent_in_cached_exposition() {
        let db = Database::open_in_memory_for_tests().expect("db");
        db.upsert_fund_watchlist_market_cache_boursorama(
            "FR0010135103",
            Some(42.5),
            Some(
                r#"{"geo":[{"label":"France","weight_percent":50}],"sectors":[{"label":"Tech","weight_percent":80}],"asset_breakdown":[],"holdings":[],"style_box":{"cap":"large_cap","style":"growth","label_fr":"Grandes cap. / Croissance"},"source":"boursorama"}"#,
            ),
        )
        .expect("seed");
        let missing =
            list_isins_missing_boursorama_data(&db, &["FR0010135103".to_string()]).expect("ok");
        assert_eq!(missing, vec!["FR0010135103".to_string()]);
    }

    #[test]
    fn list_missing_skips_when_cache_complete_with_style_box() {
        let db = Database::open_in_memory_for_tests().expect("db");
        db.upsert_fund_watchlist_market_cache_boursorama(
            "FR0010135103",
            Some(42.5),
            Some(
                r#"{"geo":[{"label":"France","weight_percent":50}],"sectors":[{"label":"Tech","weight_percent":80}],"asset_breakdown":[],"holdings":[{"label":"Ligne A","weight_percent":9.5}],"style_box":{"cap":"large_cap","style":"growth","label_fr":"Grandes cap. / Croissance"},"source":"boursorama"}"#,
            ),
        )
        .expect("seed");
        let missing =
            list_isins_missing_boursorama_data(&db, &["FR0010135103".to_string()]).expect("ok");
        assert!(missing.is_empty());
    }

    #[test]
    fn list_missing_when_style_box_absent_in_cached_exposition() {
        let db = Database::open_in_memory_for_tests().expect("db");
        db.upsert_fund_watchlist_market_cache_boursorama(
            "FR0010135103",
            Some(42.5),
            Some(
                r#"{"geo":[{"label":"France","weight_percent":50}],"sectors":[{"label":"Tech","weight_percent":80}],"asset_breakdown":[],"source":"boursorama"}"#,
            ),
        )
        .expect("seed");
        let missing =
            list_isins_missing_boursorama_data(&db, &["FR0010135103".to_string()]).expect("ok");
        assert_eq!(missing, vec!["FR0010135103".to_string()]);
    }
}
