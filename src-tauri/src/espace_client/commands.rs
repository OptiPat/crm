use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::models::{EspaceAcces, EspaceConnexionLogEntry, EspaceSyncSummary};
use crate::espace_client::activation::{generate_six_digit_code, hash_espace_otp};
use crate::espace_client::config::{
    get_sync_config, is_espace_client_active, load_sync_secret, save_sync_config,
    EspaceClientSyncConfig,
};
use crate::espace_client::portal_api::{pull_espace_connexion_log, push_espace_acces_revoke};
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceActivationResult {
    pub acces: EspaceAcces,
    /// Code en clair, affiché une seule fois : le conseiller le dicte au client.
    pub activation_code: String,
}

#[tauri::command]
pub fn activate_espace_acces_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
    email: String,
) -> Result<EspaceActivationResult, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;

    let activation_code = generate_six_digit_code();
    let secret = load_sync_secret(&app, database)?;
    let code_hash = hash_espace_otp(&secret, &activation_code);
    let acces = database.activate_espace_acces(contact_id, &email, &code_hash)?;

    Ok(EspaceActivationResult {
        acces,
        activation_code,
    })
}

#[tauri::command]
pub fn revoke_espace_acces_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<EspaceAcces, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;

    // Le portail d'abord : c'est lui qui détient les sessions ouvertes et les
    // codes valides. Marquer l'accès révoqué côté CRM alors que le portail
    // continue de servir le patrimoine donnerait une révocation de façade.
    let portal_configured = database
        .get_setting(crate::espace_client::config::PORTAL_URL_SETTING_KEY)
        .ok()
        .flatten()
        .is_some_and(|url| !url.trim().is_empty());
    if portal_configured {
        push_espace_acces_revoke(&app, database, contact_id).map_err(|error| {
            format!("Révocation refusée : le portail n'a pas pu être joint ({error}). L'accès reste actif, réessayez.")
        })?;
    }

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

#[tauri::command]
pub fn get_espace_connexion_log_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<Vec<EspaceConnexionLogEntry>, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;

    match pull_espace_connexion_log(&app, database, contact_id, 50) {
        Ok(lines) => {
            for line in &lines {
                database
                    .insert_espace_connexion_log_if_new(
                        contact_id,
                        &line.event,
                        line.detail.as_deref(),
                        line.ip.as_deref(),
                        line.user_agent.as_deref(),
                        line.created_at,
                    )
                    .map_err(|e| e.to_string())?;
            }
            Ok(lines
                .into_iter()
                .map(|line| EspaceConnexionLogEntry {
                    id: line.id,
                    contact_id: line.contact_id,
                    event: line.event,
                    detail: line.detail,
                    ip: line.ip,
                    user_agent: line.user_agent,
                    created_at: line.created_at,
                })
                .collect())
        }
        Err(_) => database
            .list_espace_connexion_log(contact_id, 50)
            .map_err(|e| e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use crate::espace_client::config::PORTAL_URL_SETTING_KEY;

    #[test]
    fn portal_url_setting_key_is_stable() {
        assert_eq!(PORTAL_URL_SETTING_KEY, "espace_client_portal_url");
    }
}
