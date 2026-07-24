use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::workspace::WorkspaceConfig;
use crate::workspace::collaboration::{
    provision_team_workspace, team_acquire_lock, team_append_audit, team_list_audit,
    team_list_presence, team_presence_heartbeat, team_release_lock, team_renew_lock,
    TeamAuditView, TeamLockAcquireResponse, TeamPresenceView,
};
use crate::workspace::guard::{require_team_management_permission, workspace_config_from_db};
use crate::workspace::identity::{
    entra_groups_configured, require_sensitive_team_authority, ENTRA_GROUPS_REQUIRED_MESSAGE,
};
use crate::workspace::mode::WorkspaceMode;
use crate::workspace::sharepoint::{SharePointGraphClient, TEAM_WORKSPACE_LISTS};
use tauri::{AppHandle, State};

fn require_team_collaboration_config(
    db: &DbState,
    session: &State<'_, UiSessionState>,
) -> Result<WorkspaceConfig, String> {
    require_ui_session(session)?;
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    let config = workspace_config_from_db(database)?;
    if !config.mode.is_team() {
        return Err("Collaboration équipe disponible uniquement en mode équipe.".into());
    }
    Ok(config)
}

#[tauri::command]
pub async fn provision_team_workspace_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<WorkspaceConfig, String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        require_team_management_permission(&app_handle, database)?;
        let config = workspace_config_from_db(database)?;
        if !entra_groups_configured(&config) {
            return Err(ENTRA_GROUPS_REQUIRED_MESSAGE.to_string());
        }
        config
    };
    let enrollment_app = app_handle.clone();
    let updated = tauri::async_runtime::spawn_blocking(move || {
        provision_team_workspace(&app_handle, &config)
    })
    .await
    .map_err(|error| format!("Provisionnement SharePoint interrompu : {error}"))??;
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        database
            .save_workspace_config(&updated)
            .map_err(|error| error.to_string())?;
    }
    crate::workspace::enrollment::save_workspace_enrollment(&enrollment_app, &updated)?;
    Ok(updated)
}

#[tauri::command]
pub async fn join_team_workspace_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<WorkspaceConfig, String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        let config = workspace_config_from_db(database)?;
        if !config.mode.is_team() || !entra_groups_configured(&config) {
            return Err(ENTRA_GROUPS_REQUIRED_MESSAGE.to_string());
        }
        config
    };
    let authority = require_sensitive_team_authority(&app_handle, &config)?;
    if authority.identity.is_none() {
        return Err("Identité Microsoft équipe indisponible.".into());
    }
    let enrollment_app = app_handle.clone();
    let checked_config = config.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = crate::workspace::commands::resolve_microsoft_team_connection(&app_handle)?
            .ok_or_else(|| "Connexion Microsoft équipe absente.".to_string())?;
        let site = crate::workspace::guard::resolve_sharepoint_site_ref(&checked_config)?;
        let site_id = checked_config
            .site_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Identifiant du site SharePoint absent.".to_string())?;
        let client = SharePointGraphClient::new(site);
        for list in TEAM_WORKSPACE_LISTS {
            if client
                .find_list_by_display_name_blocking(
                    &connection.access_token,
                    site_id,
                    list.display_name,
                )?
                .is_none()
            {
                return Err(format!(
                    "Espace équipe incomplet : liste {} absente.",
                    list.display_name
                ));
            }
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|error| format!("Vérification de l'espace équipe interrompue : {error}"))??;
    crate::workspace::enrollment::save_workspace_enrollment(&enrollment_app, &config)?;
    Ok(config)
}

#[tauri::command]
pub async fn team_presence_heartbeat_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    entity_type: String,
    entity_id: String,
) -> Result<TeamPresenceView, String> {
    let config = require_team_collaboration_config(&db, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        team_presence_heartbeat(&app_handle, &config, &entity_type, &entity_id)
    })
    .await
    .map_err(|error| format!("Heartbeat présence interrompu : {error}"))?
}

#[tauri::command]
pub async fn team_list_presence_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    entity_type: String,
    entity_id: String,
) -> Result<Vec<TeamPresenceView>, String> {
    let config = require_team_collaboration_config(&db, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        team_list_presence(&app_handle, &config, &entity_type, &entity_id)
    })
    .await
    .map_err(|error| format!("Lecture présence interrompue : {error}"))?
}

#[tauri::command]
pub async fn team_acquire_lock_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    entity_type: String,
    entity_id: String,
) -> Result<TeamLockAcquireResponse, String> {
    let config = require_team_collaboration_config(&db, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        team_acquire_lock(&app_handle, &config, &entity_type, &entity_id)
    })
    .await
    .map_err(|error| format!("Acquisition verrou interrompue : {error}"))?
}

#[tauri::command]
pub async fn team_renew_lock_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    entity_type: String,
    entity_id: String,
    etag: String,
) -> Result<TeamLockAcquireResponse, String> {
    let config = require_team_collaboration_config(&db, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        team_renew_lock(&app_handle, &config, &entity_type, &entity_id, &etag)
    })
    .await
    .map_err(|error| format!("Renouvellement verrou interrompu : {error}"))?
}

#[tauri::command]
pub async fn team_release_lock_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    entity_type: String,
    entity_id: String,
) -> Result<(), String> {
    let config = require_team_collaboration_config(&db, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        team_release_lock(&app_handle, &config, &entity_type, &entity_id)
    })
    .await
    .map_err(|error| format!("Libération verrou interrompue : {error}"))?
}

#[tauri::command]
pub async fn team_append_audit_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    entity_type: String,
    entity_id: String,
    action: String,
    detail: Option<String>,
) -> Result<TeamAuditView, String> {
    let config = require_team_collaboration_config(&db, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        team_append_audit(
            &app_handle,
            &config,
            &entity_type,
            &entity_id,
            &action,
            detail.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("Écriture audit interrompue : {error}"))?
}

#[tauri::command]
pub async fn team_list_audit_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    entity_type: String,
    entity_id: String,
    limit: Option<u32>,
) -> Result<Vec<TeamAuditView>, String> {
    let config = require_team_collaboration_config(&db, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        team_list_audit(&app_handle, &config, &entity_type, &entity_id, limit)
    })
    .await
    .map_err(|error| format!("Lecture audit interrompue : {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn team_mode_constant_matches_sharepoint_variant() {
        assert!(WorkspaceMode::TeamSharepoint.is_team());
    }
}
