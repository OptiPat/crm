use crate::commands::DbState;
use crate::database::models::{
    FicheConseilRedactionPreset, NewFicheConseilRedactionPreset, UpdateFicheConseilRedactionPreset,
};
use tauri::State;

#[tauri::command]
pub fn get_all_fiche_conseil_redaction_presets(
    db: State<'_, DbState>,
) -> Result<Vec<FicheConseilRedactionPreset>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_all_fiche_conseil_redaction_presets()
        .map_err(|e| format!("Échec lecture rédactions fiche conseil : {e}"))
}

#[tauri::command]
pub fn create_fiche_conseil_redaction_preset(
    db: State<'_, DbState>,
    input: NewFicheConseilRedactionPreset,
) -> Result<FicheConseilRedactionPreset, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_fiche_conseil_redaction_preset(input)
        .map_err(|e| format!("Échec création rédaction fiche conseil : {e}"))
}

#[tauri::command]
pub fn update_fiche_conseil_redaction_preset(
    db: State<'_, DbState>,
    id: i64,
    input: UpdateFicheConseilRedactionPreset,
) -> Result<FicheConseilRedactionPreset, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_fiche_conseil_redaction_preset(id, input)
        .map_err(|e| format!("Échec mise à jour rédaction fiche conseil : {e}"))
}

#[tauri::command]
pub fn delete_fiche_conseil_redaction_preset(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .delete_fiche_conseil_redaction_preset(id)
        .map_err(|e| format!("Échec suppression rédaction fiche conseil : {e}"))
}
