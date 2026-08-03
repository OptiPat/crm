use std::sync::{Mutex, OnceLock};
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::DbState;
use crate::fund_watchlist_market_cache_fetch::{
    apply_boursorama_benchmark_updates, fetch_boursorama_benchmark_updates_with_progress,
    get_boursorama_benchmarks_cached, list_isins_missing_usable_benchmark,
    normalize_fund_watchlist_isins_for_command, FundWatchlistBenchmarkDto,
};

pub const BENCHMARK_SYNC_DONE_EVENT: &str = "fund-watchlist-benchmark-sync-done";
pub const BENCHMARK_SYNC_PROGRESS_EVENT: &str = "fund-watchlist-benchmark-sync-progress";

static SYNC_RUNNING: OnceLock<Mutex<bool>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkSyncDoneEvent {
    pub ok: bool,
    pub benchmarks: Vec<FundWatchlistBenchmarkDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkSyncProgressEvent {
    pub current: usize,
    pub total: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isin: Option<String>,
}

/// Verrou applicatif (pas le verrou SQLite) : une seule sync benchmark Boursorama à la fois.
pub struct BenchmarkSyncGuard;

impl Drop for BenchmarkSyncGuard {
    fn drop(&mut self) {
        set_sync_running(false);
    }
}

fn set_sync_running(running: bool) {
    if let Ok(mut guard) = SYNC_RUNNING.get_or_init(|| Mutex::new(false)).lock() {
        *guard = running;
    }
}

pub fn acquire_benchmark_sync_lock() -> Result<BenchmarkSyncGuard, String> {
    let mut guard = SYNC_RUNNING
        .get_or_init(|| Mutex::new(false))
        .lock()
        .map_err(|_| "Verrou sync benchmark indisponible.")?;
    if *guard {
        return Err("Mise à jour des références marché déjà en cours.".into());
    }
    *guard = true;
    Ok(BenchmarkSyncGuard)
}

pub fn spawn_boursorama_benchmark_sync(app: AppHandle, isins: Vec<String>) -> Result<(), String> {
    let guard = acquire_benchmark_sync_lock()?;

    thread::Builder::new()
        .name("fund-watchlist-benchmark-sync".into())
        .spawn(move || {
            let _guard = guard;
            let payload = match run_sync(&app, &isins, true) {
                Ok(benchmarks) => BenchmarkSyncDoneEvent {
                    ok: true,
                    benchmarks,
                    error: None,
                },
                Err(error) => BenchmarkSyncDoneEvent {
                    ok: false,
                    benchmarks: vec![],
                    error: Some(error),
                },
            };
            let _ = app.emit(BENCHMARK_SYNC_DONE_EVENT, payload);
        })
        .map_err(|e| format!("Impossible de lancer la sync benchmark : {e}"))?;

    Ok(())
}

pub fn sync_boursorama_benchmarks_blocking(
    database: &crate::database::Database,
    isins: &[String],
    force_refresh: bool,
) -> Result<Vec<FundWatchlistBenchmarkDto>, String> {
    let _lock = acquire_benchmark_sync_lock()?;
    let normalized = normalize_fund_watchlist_isins_for_command(isins);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }

    let to_fetch = if force_refresh {
        normalized.clone()
    } else {
        list_isins_missing_usable_benchmark(database, &normalized)?
    };

    if !to_fetch.is_empty() {
        let updates = fetch_boursorama_benchmark_updates_with_progress(&to_fetch, |_, _, _| {})?;
        if !updates.is_empty() {
            apply_boursorama_benchmark_updates(database, &updates)?;
        }
    }

    get_boursorama_benchmarks_cached(database, &normalized)
}

fn run_sync(
    app: &AppHandle,
    isins: &[String],
    force_refresh: bool,
) -> Result<Vec<FundWatchlistBenchmarkDto>, String> {
    let normalized = normalize_fund_watchlist_isins_for_command(isins);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }

    let to_fetch = {
        let db_state = app.state::<DbState>();
        let db_guard = db_state
            .inner()
            .lock()
            .map_err(|_| "Base de données indisponible.")?;
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        if force_refresh {
            normalized.clone()
        } else {
            list_isins_missing_usable_benchmark(database, &normalized)?
        }
    };

    if !to_fetch.is_empty() {
        let updates = fetch_boursorama_benchmark_updates_with_progress(&to_fetch, |current, total, isin| {
            let _ = app.emit(
                BENCHMARK_SYNC_PROGRESS_EVENT,
                BenchmarkSyncProgressEvent {
                    current,
                    total,
                    isin: Some(isin.to_string()),
                },
            );
        })?;
        if !updates.is_empty() {
            let db_state = app.state::<DbState>();
            let db_guard = db_state
                .inner()
                .lock()
                .map_err(|_| "Base de données indisponible.")?;
            let database = db_guard.as_ref().ok_or("Database not initialized")?;
            apply_boursorama_benchmark_updates(database, &updates)?;
        }
    }

    let db_state = app.state::<DbState>();
    let db_guard = db_state
        .inner()
        .lock()
        .map_err(|_| "Base de données indisponible.")?;
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    get_boursorama_benchmarks_cached(database, &normalized)
}
