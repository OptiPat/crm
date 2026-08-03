use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::models::{
    FundWatchlistEntry, FundWatchlistFavoritesReport, FundWatchlistImportResult,
    FundWatchlistImportRow,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_all_fund_watchlist_entries(
    db: State<'_, DbState>,
) -> Result<Vec<FundWatchlistEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_all_fund_watchlist_entries()
        .map_err(|e| format!("Échec lecture veille fonds : {e}"))
}

#[tauri::command]
pub fn import_fund_watchlist_entries(
    db: State<'_, DbState>,
    rows: Vec<FundWatchlistImportRow>,
    source_label: Option<String>,
) -> Result<FundWatchlistImportResult, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let label = source_label.unwrap_or_else(|| "cristalliance".to_string());
    database
        .import_fund_watchlist_entries(rows, &label)
        .map_err(|e| format!("Échec import veille fonds : {e}"))
}

#[tauri::command]
pub fn set_fund_watchlist_favorite(
    db: State<'_, DbState>,
    isin: String,
    is_favorite: bool,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .set_fund_watchlist_favorite(&isin, is_favorite)
        .map_err(|e| format!("Échec mise à jour favori : {e}"))
}

#[tauri::command]
pub fn start_fund_watchlist_favorites_report(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<(), String> {
    require_ui_session(&session)?;
    crate::fund_watchlist_coach::spawn_favorites_report(app)
}

#[tauri::command]
pub fn fund_watchlist_coach_report_in_progress() -> bool {
    crate::fund_watchlist_coach::coach_report_in_progress()
}

#[tauri::command]
pub fn get_fund_watchlist_coach_last_report(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<Option<FundWatchlistFavoritesReport>, String> {
    require_ui_session(&session)?;
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_fund_watchlist_coach_last_report()
        .map_err(|e| format!("Lecture dernier rapport Coach : {e}"))
}

#[tauri::command]
pub fn sync_fund_watchlist_boursorama_benchmarks(
    db: State<'_, DbState>,
    isins: Vec<String>,
) -> Result<Vec<crate::fund_watchlist_market_cache_fetch::FundWatchlistBenchmarkDto>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    crate::fund_watchlist_benchmark_sync::sync_boursorama_benchmarks_blocking(database, &isins, false)
}

#[tauri::command]
pub fn get_fund_watchlist_boursorama_benchmarks_cached(
    db: State<'_, DbState>,
    isins: Vec<String>,
) -> Result<Vec<crate::fund_watchlist_market_cache_fetch::FundWatchlistBenchmarkDto>, String> {
    let normalized =
        crate::fund_watchlist_market_cache_fetch::normalize_fund_watchlist_isins_for_command(&isins);
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    crate::fund_watchlist_market_cache_fetch::get_boursorama_benchmarks_cached(database, &normalized)
}

#[tauri::command]
pub fn spawn_fund_watchlist_boursorama_benchmarks_sync(
    app: AppHandle,
    isins: Vec<String>,
) -> Result<(), String> {
    crate::fund_watchlist_benchmark_sync::spawn_boursorama_benchmark_sync(app, isins)
}
