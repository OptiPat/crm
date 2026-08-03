//! Récupération Boursorama → cache marché (Top 10) pour le comparateur UC.

use std::thread;
use std::time::Duration;

use crate::database::Database;
use crate::fund_watchlist_coach::boursorama::{boursorama_client, fetch_top10_percent_for_isin};

const FETCH_PAUSE_MS: u64 = 350;

pub fn list_isins_missing_top10(
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
            !isin.is_empty()
                && !cached
                    .iter()
                    .any(|row| row.isin == *isin && row.top10_percent.is_some())
        })
        .collect())
}

/// Interroge Boursorama (hors verrou DB recommandé).
pub fn fetch_top10_for_isins(isins: &[String]) -> Result<Vec<(String, f64)>, String> {
    if isins.is_empty() {
        return Ok(Vec::new());
    }
    let client = boursorama_client()?;
    let mut updates = Vec::new();
    for (index, isin) in isins.iter().enumerate() {
        if index > 0 {
            thread::sleep(Duration::from_millis(FETCH_PAUSE_MS));
        }
        let Some(top10) = fetch_top10_percent_for_isin(&client, isin)? else {
            continue;
        };
        updates.push((isin.clone(), top10));
    }
    Ok(updates)
}

pub fn apply_top10_updates(
    database: &Database,
    updates: &[(String, f64)],
) -> Result<usize, String> {
    for (isin, top10) in updates {
        database
            .upsert_fund_watchlist_market_cache_top10(isin, *top10, "boursorama")
            .map_err(|e| format!("Écriture cache Top 10 ({isin}) : {e}"))?;
    }
    Ok(updates.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    #[test]
    fn list_missing_top10_skips_when_cache_complete() {
        let db = Database::open_in_memory_for_tests().expect("db");
        db.upsert_fund_watchlist_market_cache_top10("FR0010135103", 42.5, "test")
            .expect("seed");
        let missing =
            list_isins_missing_top10(&db, &["FR0010135103".to_string()]).expect("ok");
        assert!(missing.is_empty());
    }
}
