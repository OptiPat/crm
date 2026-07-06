//! Commandes Tauri — synchronisation comptabilité.

use crate::compta::calendar::{
    scan_compta_calendar_month as calendar_scan_month, ComptaCalendarTripProposal,
};
use crate::compta::distance::{compute_driving_distance_km, reset_distance_cache};
use crate::compta::drive::{
    browse_compta_drive_folder, download_drive_file_to_cache,
    resolve_browse_start_folder, scan_compta_drive_month as drive_scan_month, ComptaDriveBrowseResult,
    ComptaDriveFile,
};
use crate::commands::DbState;
use crate::database::compta::NewComptaDeplacement;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaDriveFileStatus {
    pub id: String,
    pub name: String,
    pub web_view_link: Option<String>,
    pub mime_type: String,
    pub modified_time: Option<String>,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaDriveScanResponse {
    pub depenses_folder_id: Option<String>,
    pub encaissements_folder_id: Option<String>,
    pub depenses_folder_name: String,
    pub encaissements_folder_name: String,
    pub depenses_files: Vec<ComptaDriveFileStatus>,
    pub encaissements_files: Vec<ComptaDriveFileStatus>,
}

fn map_drive_files(
    files: Vec<ComptaDriveFile>,
    imported: &[String],
) -> Vec<ComptaDriveFileStatus> {
    files
        .into_iter()
        .map(|f| ComptaDriveFileStatus {
            already_imported: imported.iter().any(|id| id == &f.id),
            id: f.id,
            name: f.name,
            web_view_link: f.web_view_link,
            mime_type: f.mime_type,
            modified_time: f.modified_time,
        })
        .collect()
}

#[tauri::command]
pub fn scan_compta_drive_month(
    app: AppHandle,
    db: State<'_, DbState>,
    year: i32,
    month: u32,
) -> Result<ComptaDriveScanResponse, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let config = database
        .get_compta_config()
        .map_err(|e| e.to_string())?;
    let imported = database
        .get_compta_imported_drive_file_ids()
        .map_err(|e| e.to_string())?;
    drop(db_guard);

    let scan = drive_scan_month(&app, &config.drive_root_folder_id, year, month)?;
    Ok(ComptaDriveScanResponse {
        depenses_folder_id: scan.depenses_folder_id,
        encaissements_folder_id: scan.encaissements_folder_id,
        depenses_folder_name: scan.depenses_folder_name,
        encaissements_folder_name: scan.encaissements_folder_name,
        depenses_files: map_drive_files(scan.depenses_files, &imported),
        encaissements_files: map_drive_files(scan.encaissements_files, &imported),
    })
}

#[tauri::command]
pub fn download_compta_drive_file(
    app: AppHandle,
    file_id: String,
    file_name: String,
) -> Result<String, String> {
    download_drive_file_to_cache(&app, &file_id, &file_name)
}

#[tauri::command]
pub fn browse_compta_drive(
    app: AppHandle,
    db: State<'_, DbState>,
    folder_id: Option<String>,
    year: Option<i32>,
    month: Option<u32>,
    month_folder_kind: Option<String>,
) -> Result<ComptaDriveBrowseResult, String> {
    if let Some(id) = folder_id.filter(|s| !s.trim().is_empty()) {
        return browse_compta_drive_folder(&app, id.trim());
    }
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let config = database
        .get_compta_config()
        .map_err(|e| e.to_string())?;
    drop(db_guard);
    let start = resolve_browse_start_folder(
        &app,
        &config.drive_root_folder_id,
        year,
        month,
        month_folder_kind.as_deref(),
    )?;
    browse_compta_drive_folder(&app, &start)
}

#[tauri::command]
pub fn scan_compta_calendar_month(
    app: AppHandle,
    db: State<'_, DbState>,
    year: i32,
    month: u32,
) -> Result<Vec<ComptaCalendarTripProposal>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let imported = database
        .get_compta_imported_google_event_ids()
        .map_err(|e| e.to_string())?;
    drop(db_guard);
    calendar_scan_month(&app, year, month, &imported)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportComptaDriveDepenseInput {
    pub file_id: String,
    pub file_name: String,
    pub web_view_link: String,
    pub date: String,
    pub categorie: String,
    pub tiers: String,
    pub ttc: f64,
    pub tva: f64,
    pub ht: f64,
}

#[tauri::command]
pub fn import_compta_drive_depense(
    db: State<'_, DbState>,
    input: ImportComptaDriveDepenseInput,
) -> Result<crate::database::compta::ComptaDepense, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_compta_depense(crate::database::compta::NewComptaDepense {
            date: input.date,
            categorie: input.categorie,
            tiers: input.tiers,
            ttc: input.ttc,
            tva: input.tva,
            ht: input.ht,
            lien_drive: Some(input.web_view_link),
            source_drive_file_id: Some(input.file_id),
        })
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportComptaCalendarTripInput {
    pub event_id: String,
    pub date: String,
    pub destination: String,
    pub objet: String,
    pub km: f64,
    pub indemnite: f64,
}

#[tauri::command]
pub fn compute_compta_driving_distance_km(
    origin: String,
    destination: String,
    origin_queries: Vec<String>,
    destination_queries: Vec<String>,
) -> Result<f64, String> {
    compute_driving_distance_km(&origin, &destination, origin_queries, destination_queries)
}

#[tauri::command]
pub fn reset_compta_distance_cache() {
    reset_distance_cache();
}

#[tauri::command]
pub fn import_compta_calendar_trip(
    db: State<'_, DbState>,
    input: ImportComptaCalendarTripInput,
) -> Result<crate::database::compta::ComptaDeplacement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_compta_deplacement(NewComptaDeplacement {
            date: input.date,
            destination: input.destination,
            objet: input.objet,
            km: input.km,
            indemnite: input.indemnite,
            source_google_event_id: Some(input.event_id),
        })
        .map_err(|e| e.to_string())
}
