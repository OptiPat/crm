use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::models::{EspaceAcces, EspaceSyncSummary};
use crate::espace_client::config::{
    get_sync_config, is_espace_client_active, save_sync_config, EspaceClientSyncConfig,
};
use crate::espace_client::push::push_espace_client_snapshot;
use crate::espace_client::snapshot::{
    build_espace_client_snapshot, build_espace_client_snapshot_for_push,
};
use crate::espace_client::sync_payload::EspaceClientSyncPayload;
use crate::database::Database;
use tauri::State;

/// R11 — la fonctionnalité est mono-instance et invisible par défaut : aucune
/// commande ne répond tant que `espace_client_active` n'est pas posée.
fn require_espace_client_active(database: &Database) -> Result<(), String> {
    if is_espace_client_active(database)? {
        return Ok(());
    }
    Err("Espace client non activé sur cette installation".into())
}

#[tauri::command]
pub fn get_espace_acces_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<Option<EspaceAcces>, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database
        .get_espace_acces_by_contact(contact_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn activate_espace_acces_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
    email: String,
) -> Result<EspaceAcces, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database.activate_espace_acces(contact_id, &email)
}

#[tauri::command]
pub fn revoke_espace_acces_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<EspaceAcces, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database.revoke_espace_acces(contact_id)
}

#[tauri::command]
pub fn get_espace_sync_summary_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<EspaceSyncSummary, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database.get_espace_sync_summary().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_espace_client_sync_config_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<EspaceClientSyncConfig, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    get_sync_config(database)
}

#[tauri::command]
pub fn save_espace_client_sync_config_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    portal_url: String,
    sync_secret: Option<String>,
) -> Result<EspaceClientSyncConfig, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    save_sync_config(&app, database, &portal_url, sync_secret.as_deref())
}

#[tauri::command]
pub fn build_espace_client_snapshot_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<EspaceClientSyncPayload, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    build_espace_client_snapshot(database, contact_id)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushEspaceClientContactResult {
    pub sequence: i64,
    pub investissement_count: usize,
    pub timeline_count: usize,
}

#[tauri::command]
pub fn push_espace_client_contact_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<PushEspaceClientContactResult, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    let payload = build_espace_client_snapshot_for_push(database, contact_id)?;
    push_espace_client_snapshot(&app, database, &payload)?;
    Ok(PushEspaceClientContactResult {
        sequence: payload.sequence,
        investissement_count: payload.investissements.len(),
        timeline_count: payload.timeline.len(),
    })
}

#[cfg(test)]
mod tests {
    use crate::espace_client::config::PORTAL_URL_SETTING_KEY;

    #[test]
    fn portal_url_setting_key_is_stable() {
        assert_eq!(PORTAL_URL_SETTING_KEY, "espace_client_portal_url");
    }
}
