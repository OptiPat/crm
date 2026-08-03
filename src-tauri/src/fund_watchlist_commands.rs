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
pub fn start_fund_watchlist_favorites_report(app: AppHandle) -> Result<(), String> {
    crate::fund_watchlist_coach::spawn_favorites_report(app)
}

#[tauri::command]
pub fn fund_watchlist_coach_report_in_progress() -> bool {
    crate::fund_watchlist_coach::coach_report_in_progress()
}

#[tauri::command]
pub fn get_fund_watchlist_coach_last_report(
    db: State<'_, DbState>,
) -> Result<Option<FundWatchlistFavoritesReport>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_fund_watchlist_coach_last_report()
        .map_err(|e| format!("Lecture dernier rapport Coach : {e}"))
}
