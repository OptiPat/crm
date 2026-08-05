//! Récupération Boursorama → cache marché (Top 10 + exposition) pour le comparateur UC.

use std::thread;
use std::time::Duration;

use crate::database::Database;
use crate::fund_watchlist_coach::boursorama::{
    boursorama_client, fetch_category_history, fetch_composition_for_isin, fetch_cours_performances,
    resolve_opcvm_symbol, top10_concentration_percent, BoursoramaCategoryHistory,
    BoursoramaCoursPerformances, BoursoramaExposition, BoursoramaHoldingLine,
};
use crate::uc_comparator::types::UcFundExposition;

const FETCH_PAUSE_MS: u64 = 350;

pub struct BoursoramaCacheUpdate {
    pub isin: String,
    pub top10_percent: Option<f64>,
    pub exposition: UcFundExposition,
    pub benchmark: Option<BoursoramaCoursPerformances>,
    pub category_history: Option<BoursoramaCategoryHistory>,
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
                        || row.category_history_json.is_none()
                        || !benchmark_cache_has_category_perf_1an(row.benchmark_json.as_deref())
                        || exposition_from_cache_json(row.exposition_json.as_deref())
                            .map(|expo| expo.needs_boursorama_refresh())
                            .unwrap_or(false)
                }
            }
        })
        .collect())
}

/// Historique annuel d'un fonds, en distinguant deux absences très différentes : une page
/// Boursorama sans tableau annuel est un fait stable, mémorisé sous la forme d'un historique vide
/// pour que le fonds cesse d'être considéré comme « à récupérer » à chaque comparaison ; un échec
/// réseau ne laisse rien en cache, afin d'être retenté plus tard.
fn fetch_category_history_or_empty(
    client: &reqwest::blocking::Client,
    symbol: &str,
) -> Option<BoursoramaCategoryHistory> {
    match fetch_category_history(client, symbol) {
        Ok(Some(history)) => Some(history),
        Ok(None) => Some(BoursoramaCategoryHistory::default()),
        Err(_) => None,
    }
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
        let symbol = resolve_opcvm_symbol(&client, isin)?;
        let benchmark = symbol
            .as_deref()
            .and_then(|symbol| fetch_cours_performances(&client, symbol).ok().flatten());
        let category_history = symbol
            .as_deref()
            .and_then(|symbol| fetch_category_history_or_empty(&client, symbol));
        let has_history_years = category_history
            .as_ref()
            .is_some_and(|history| !history.years.is_empty());
        let top10 = top10_concentration_percent(&data.holdings);
        let exposition = exposition_to_uc(&data.exposition, &data.holdings);
        if top10.is_none()
            && exposition.geo.is_empty()
            && exposition.sectors.is_empty()
            && exposition.holdings.is_empty()
            && exposition.style_box.is_none()
            && benchmark.is_none()
            && !has_history_years
        {
            continue;
        }
        updates.push(BoursoramaCacheUpdate {
            isin: isin.clone(),
            top10_percent: top10,
            exposition,
            benchmark,
            category_history,
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
        let benchmark_json = update
            .benchmark
            .as_ref()
            .and_then(|bench| serde_json::to_string(bench).ok());
        let category_history_json = update
            .category_history
            .as_ref()
            .and_then(|history| serde_json::to_string(history).ok());
        database
            .upsert_fund_watchlist_market_cache_boursorama(
                &update.isin,
                update.top10_percent,
                exposition_json.as_deref(),
                benchmark_json.as_deref(),
                category_history_json.as_deref(),
            )
            .map_err(|e| format!("Écriture cache Boursorama ({}) : {e}", update.isin))?;
    }
    Ok(updates.len())
}

pub fn benchmark_from_cache_json(json: Option<&str>) -> Option<BoursoramaCoursPerformances> {
    let raw = json?;
    serde_json::from_str(raw).ok()
}

pub fn benchmark_cache_has_category_perf_1an(json: Option<&str>) -> bool {
    benchmark_from_cache_json(json)
        .and_then(|bench| bench.category.perf_1an)
        .is_some()
}

pub fn category_history_from_cache_json(json: Option<&str>) -> Option<BoursoramaCategoryHistory> {
    serde_json::from_str(json?).ok()
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

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FundWatchlistBenchmarkDto {
    pub isin: String,
    pub category_perf_1an: Option<f64>,
    pub label: String,
}

fn normalize_fund_watchlist_isins(isins: &[String]) -> Vec<String> {
    isins
        .iter()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .collect()
}

pub(crate) fn normalize_fund_watchlist_isins_for_command(isins: &[String]) -> Vec<String> {
    normalize_fund_watchlist_isins(isins)
}

/// Lecture cache locale uniquement (pas d'appel HTTP Boursorama).
pub fn get_boursorama_benchmarks_cached(
    database: &crate::database::Database,
    isins: &[String],
) -> Result<Vec<FundWatchlistBenchmarkDto>, String> {
    let normalized = normalize_fund_watchlist_isins(isins);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }
    let rows = database
        .get_fund_watchlist_market_cache_bulk(&normalized)
        .map_err(|e| format!("Lecture cache benchmark : {e}"))?;
    Ok(benchmarks_from_cache_rows(&normalized, &rows))
}

pub fn benchmarks_from_cache_rows(
    isins: &[String],
    rows: &[crate::database::models::UcMarketCacheRowDb],
) -> Vec<FundWatchlistBenchmarkDto> {
    isins
        .iter()
        .map(|isin| {
            let normalized = isin.trim().to_uppercase();
            let row = rows.iter().find(|row| row.isin == normalized);
            let category_perf_1an = row
                .and_then(|row| benchmark_from_cache_json(row.benchmark_json.as_deref()))
                .and_then(|bench| bench.category.perf_1an);
            FundWatchlistBenchmarkDto {
                isin: normalized,
                category_perf_1an,
                label: "Catégorie Boursorama".to_string(),
            }
        })
        .collect()
}

const BENCHMARK_CLIENT_RETRY_MS: u64 = 800;

fn boursorama_client_with_retry() -> Result<reqwest::blocking::Client, String> {
    match boursorama_client() {
        Ok(client) => Ok(client),
        Err(first) => {
            thread::sleep(Duration::from_millis(BENCHMARK_CLIENT_RETRY_MS));
            boursorama_client().map_err(|second| {
                format!(
                    "Connexion Boursorama impossible ({first} — nouvelle tentative : {second})"
                )
            })
        }
    }
}

/// Référence catégorie d'un fonds : performances glissantes et série annuelle avec rang, toutes
/// deux invalidées ensemble quand l'import Cristalliance change la performance du fonds.
pub struct BoursoramaBenchmarkUpdate {
    pub isin: String,
    pub benchmark_json: String,
    pub category_history_json: Option<String>,
}

pub fn fetch_boursorama_benchmark_updates_with_progress(
    isins: &[String],
    mut on_progress: impl FnMut(usize, usize, &str),
) -> Result<Vec<BoursoramaBenchmarkUpdate>, String> {
    if isins.is_empty() {
        return Ok(Vec::new());
    }
    let client = boursorama_client_with_retry()?;
    let mut updates = Vec::new();
    let mut failures = 0usize;
    let total = isins.len();
    for (index, isin) in isins.iter().enumerate() {
        if index > 0 {
            thread::sleep(Duration::from_millis(FETCH_PAUSE_MS));
        }
        on_progress(index + 1, total, isin);
        if let Some(update) = fetch_boursorama_benchmark_update_for_isin(&client, isin) {
            updates.push(update);
        } else {
            failures += 1;
        }
    }
    if failures == isins.len() {
        return Err(format!(
            "Aucune référence catégorie récupérée pour {} fond(s) (symbole introuvable ou page Boursorama indisponible).",
            isins.len()
        ));
    }
    Ok(updates)
}

pub fn fetch_boursorama_benchmark_update_for_isin(
    client: &reqwest::blocking::Client,
    isin: &str,
) -> Option<BoursoramaBenchmarkUpdate> {
    let symbol = resolve_opcvm_symbol(client, isin).ok().flatten()?;
    let benchmark = fetch_cours_performances(client, &symbol)
        .ok()
        .flatten()
        .filter(|bench| bench.category.perf_1an.is_some())?;
    let benchmark_json = serde_json::to_string(&benchmark).ok()?;
    let category_history_json = fetch_category_history_or_empty(client, &symbol)
        .and_then(|history| serde_json::to_string(&history).ok());
    Some(BoursoramaBenchmarkUpdate {
        isin: isin.trim().to_uppercase(),
        benchmark_json,
        category_history_json,
    })
}

pub fn apply_boursorama_benchmark_updates(
    database: &Database,
    updates: &[BoursoramaBenchmarkUpdate],
) -> Result<usize, String> {
    for update in updates {
        database
            .upsert_fund_watchlist_market_cache_boursorama(
                &update.isin,
                None,
                None,
                Some(update.benchmark_json.as_str()),
                update.category_history_json.as_deref(),
            )
            .map_err(|e| format!("Écriture benchmark ({}) : {e}", update.isin))?;
    }
    Ok(updates.len())
}

pub fn list_isins_missing_usable_benchmark(
    database: &Database,
    isins: &[String],
) -> Result<Vec<String>, String> {
    if isins.is_empty() {
        return Ok(Vec::new());
    }
    let normalized: Vec<String> = isins
        .iter()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .collect();
    let cached = database
        .get_fund_watchlist_market_cache_bulk(&normalized)
        .map_err(|e| format!("Lecture cache marché : {e}"))?;
    Ok(normalized
        .into_iter()
        .filter(|isin| {
            let row = cached.iter().find(|row| row.isin == *isin);
            match row {
                None => true,
                Some(row) => !benchmark_cache_has_category_perf_1an(row.benchmark_json.as_deref()),
            }
        })
        .collect())
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
            None,
            None,
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
            Some(r#"{"fund":{"perf_ytd":null,"perf_1mois":null,"perf_1an":10.0,"perf_3ans":null,"perf_5ans":null},"category":{"perf_ytd":null,"perf_1mois":null,"perf_1an":8.0,"perf_3ans":null,"perf_5ans":null},"source":"boursorama_cours"}"#),
            Some(r#"{"years":[{"year":"2023","fund":2.2,"category":8.34,"rank":97.0}]}"#),
        )
        .expect("seed");
        let missing =
            list_isins_missing_boursorama_data(&db, &["FR0010135103".to_string()]).expect("ok");
        assert!(missing.is_empty());
    }

    #[test]
    fn list_missing_skips_a_fund_whose_page_has_no_annual_table() {
        let db = Database::open_in_memory_for_tests().expect("db");
        // Historique vide = « page consultée, aucun tableau annuel » : sans cette mémoire, chaque
        // comparaison relancerait un scraping complet du fonds.
        db.upsert_fund_watchlist_market_cache_boursorama(
            "FR0010135103",
            Some(42.5),
            Some(
                r#"{"geo":[{"label":"France","weight_percent":50}],"sectors":[{"label":"Tech","weight_percent":80}],"asset_breakdown":[],"holdings":[{"label":"Ligne A","weight_percent":9.5}],"style_box":{"cap":"large_cap","style":"growth","label_fr":"Grandes cap. / Croissance"},"source":"boursorama"}"#,
            ),
            Some(r#"{"fund":{"perf_ytd":null,"perf_1mois":null,"perf_1an":10.0,"perf_3ans":null,"perf_5ans":null},"category":{"perf_ytd":null,"perf_1mois":null,"perf_1an":8.0,"perf_3ans":null,"perf_5ans":null},"source":"boursorama_cours"}"#),
            Some(r#"{"years":[]}"#),
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
            None,
            None,
        )
        .expect("seed");
        let missing =
            list_isins_missing_boursorama_data(&db, &["FR0010135103".to_string()]).expect("ok");
        assert_eq!(missing, vec!["FR0010135103".to_string()]);
    }
}
