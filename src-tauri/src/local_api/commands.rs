use crate::commands::DbState;
use super::config::{get_local_api_settings, regenerate_local_api_token, save_local_api_settings, LocalApiSettingsPayload};
use super::{restart_for_app, update_runtime_token};
use crate::database::scpi_campaigns::ScpiCampaignDashboard;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_local_api_settings_cmd(db: State<'_, DbState>) -> Result<LocalApiSettingsPayload, String> {
    let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
    let database = db_guard.as_ref().ok_or("Base non initialisée")?;
    get_local_api_settings(database)
}

#[tauri::command]
pub fn save_local_api_settings_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
    enabled: bool,
    port: u16,
    scpi_n8n_webhook_url: Option<String>,
) -> Result<LocalApiSettingsPayload, String> {
    let payload = {
        let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
        let database = db_guard.as_ref().ok_or("Base non initialisée")?;
        save_local_api_settings(
            database,
            enabled,
            port,
            scpi_n8n_webhook_url.as_deref(),
        )?
    };
    {
        let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
        let database = db_guard.as_ref().ok_or("Base non initialisée")?;
        restart_for_app(&app, database)?;
    }
    Ok(payload)
}

#[tauri::command]
pub fn regenerate_local_api_token_cmd(
    db: State<'_, DbState>,
) -> Result<LocalApiSettingsPayload, String> {
    let payload = {
        let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
        let database = db_guard.as_ref().ok_or("Base non initialisée")?;
        regenerate_local_api_token(database)?
    };
    // Pas de redémarrage serveur : évite le blocage UI (join thread + mutex DB).
    update_runtime_token(payload.token.clone());
    Ok(payload)
}

#[tauri::command]
pub fn get_scpi_campaign_dashboard_cmd(
    db: State<'_, DbState>,
) -> Result<ScpiCampaignDashboard, String> {
    let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
    let database = db_guard.as_ref().ok_or("Base non initialisée")?;
    database
        .get_scpi_campaign_dashboard()
        .map_err(|e| e.to_string())
}
