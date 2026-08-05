//! Positions clients par contrat : import de l'export « Supports », détenteurs d'un fonds et
//! composition d'un contrat.

use crate::commands::DbState;
use crate::database::contrat_supports::{
    ContratSupportImportRow, ContratSupportLine, ContratSupportsImportResult, FundHolder,
};
use tauri::State;

#[tauri::command]
pub fn import_contrat_supports(
    db: State<'_, DbState>,
    rows: Vec<ContratSupportImportRow>,
    source_label: Option<String>,
) -> Result<ContratSupportsImportResult, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let label = source_label.unwrap_or_else(|| "supports".to_string());
    database
        .import_contrat_supports(rows, &label)
        .map_err(|e| format!("Échec import positions clients : {e}"))
}

#[tauri::command]
pub fn list_fund_holders(db: State<'_, DbState>, isin: String) -> Result<Vec<FundHolder>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .list_fund_holders(&isin)
        .map_err(|e| format!("Échec lecture détenteurs : {e}"))
}

#[tauri::command]
pub fn list_contrat_supports(
    db: State<'_, DbState>,
    investissement_id: i64,
) -> Result<Vec<ContratSupportLine>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .list_contrat_supports(investissement_id)
        .map_err(|e| format!("Échec lecture composition du contrat : {e}"))
}
