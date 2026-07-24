use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::workspace::{validate_workspace_config_save_with_authority, WorkspaceConfig};
use crate::database::workspace_sync::{build_team_migration_preview, TeamMigrationPreview};
use crate::email::oauth_flow::{disconnect_microsoft_team_oauth, run_oauth_connect};
use crate::email::oauth_store::EmailOAuthStore;
use crate::workspace::collaboration::require_provisioned_team_workspace;
use crate::workspace::enrollment::validate_workspace_enrollment;
use crate::workspace::migration::{
    upload_team_migration_snapshot, validate_team_remote_snapshot, TeamMigrationUploadReport,
    TeamMigrationValidateReport,
};
use crate::workspace::guard::{
    require_export_permission, require_team_management_permission, resolve_sharepoint_site_ref,
    workspace_config_from_db,
};
use crate::workspace::identity::{
    clear_authoritative_identity_cache, require_sensitive_team_authority,
    resolve_authoritative_team_identity,
};
use crate::workspace::oauth::microsoft_team_flow_provider;
use crate::workspace::sharepoint::{SharePointConnectionTestResult, SharePointGraphClient};
use crate::workspace::team::{TeamCapabilities, TeamRole};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftTeamConnectionStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfigResponse {
    pub config: WorkspaceConfig,
    pub capabilities: TeamCapabilities,
    pub team_configured: bool,
    pub effective_role: TeamRole,
    pub identity_email: Option<String>,
    pub identity_display_name: Option<String>,
    pub authority_error: Option<String>,
    pub sync_activated: bool,
}

pub fn resolve_microsoft_team_connection(
    app: &AppHandle,
) -> Result<Option<crate::email::oauth_store::EmailOAuthConnection>, String> {
    crate::workspace::team_connection::resolve_microsoft_team_connection(app)
}

fn workspace_response(
    app: &AppHandle,
    config: WorkspaceConfig,
) -> Result<WorkspaceConfigResponse, String> {
    let sync_activated = crate::workspace::enrollment::load_workspace_enrollment(app)?
        .is_some_and(|enrollment| enrollment.sync_activated);
    let authority = if config.mode.is_team() {
        match require_sensitive_team_authority(app, &config) {
            Ok(authority) => authority,
            Err(error) => {
                return Ok(WorkspaceConfigResponse {
                    config,
                    capabilities: TeamCapabilities {
                        can_export: false,
                        can_manage_members: false,
                        can_use_personal_mailbox: false,
                    },
                    team_configured: true,
                    effective_role: TeamRole::Secretary,
                    identity_email: None,
                    identity_display_name: None,
                    authority_error: Some(error),
                    sync_activated,
                });
            }
        }
    } else {
        resolve_authoritative_team_identity(app, &config)?
    };
    let identity_email = authority
        .identity
        .as_ref()
        .map(|identity| identity.email.clone());
    let identity_display_name = authority
        .identity
        .as_ref()
        .and_then(|identity| identity.display_name.clone());
    let team_configured = config.is_team_configured();
    Ok(WorkspaceConfigResponse {
        config,
        capabilities: authority.capabilities,
        team_configured,
        effective_role: authority.role,
        identity_email,
        identity_display_name,
        authority_error: None,
        sync_activated,
    })
}

#[tauri::command]
pub fn get_workspace_config_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<WorkspaceConfigResponse, String> {
    require_ui_session(&session)?;
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    workspace_response(
        &app_handle,
        database
            .get_workspace_config()
            .map_err(|error| format!("Configuration workspace inaccessible : {error}"))?,
    )
}

#[tauri::command]
pub fn save_workspace_config_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    config: WorkspaceConfig,
) -> Result<WorkspaceConfigResponse, String> {
    require_ui_session(&session)?;
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    let current = workspace_config_from_db(database)?;
    validate_workspace_enrollment(&app_handle, &current)?;
    let authority = require_sensitive_team_authority(&app_handle, &current)?;
    validate_workspace_config_save_with_authority(&current, &config, Some(authority.role))?;
    database
        .save_workspace_config(&config)
        .map_err(|error| error.to_string())?;
    clear_authoritative_identity_cache();
    let saved = database
        .get_workspace_config()
        .map_err(|error| format!("Configuration workspace inaccessible : {error}"))?;
    workspace_response(&app_handle, saved)
}

#[tauri::command]
pub fn get_microsoft_team_connection_status(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<MicrosoftTeamConnectionStatus, String> {
    require_ui_session(&session)?;
    let store = EmailOAuthStore::load(&app_handle)?;
    if let Some(ref conn) = store.microsoft_team_connection {
        return Ok(MicrosoftTeamConnectionStatus {
            connected: true,
            email: Some(conn.email.clone()),
            expires_at: Some(conn.expires_at),
        });
    }
    Ok(MicrosoftTeamConnectionStatus {
        connected: false,
        email: None,
        expires_at: None,
    })
}

#[tauri::command]
pub async fn connect_microsoft_team_oauth_cmd(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
    force_consent: Option<bool>,
) -> Result<MicrosoftTeamConnectionStatus, String> {
    require_ui_session(&session)?;
    let force = force_consent.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        run_oauth_connect(&app_handle, microsoft_team_flow_provider(), force)?;
        clear_authoritative_identity_cache();
        let store = EmailOAuthStore::load(&app_handle)?;
        Ok(MicrosoftTeamConnectionStatus {
            connected: store.microsoft_team_connection.is_some(),
            email: store
                .microsoft_team_connection
                .as_ref()
                .map(|connection| connection.email.clone()),
            expires_at: store
                .microsoft_team_connection
                .as_ref()
                .map(|connection| connection.expires_at),
        })
    })
    .await
    .map_err(|e| format!("OAuth mode équipe interrompu: {e}"))?
}

#[tauri::command]
pub fn disconnect_microsoft_team_oauth_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<(), String> {
    require_ui_session(&session)?;
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        require_team_management_permission(&app_handle, database)?;
    }
    disconnect_microsoft_team_oauth(&app_handle)?;
    clear_authoritative_identity_cache();
    Ok(())
}

pub fn test_microsoft_team_sharepoint_connection(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<SharePointConnectionTestResult, String> {
    let connection = resolve_microsoft_team_connection(app)?
        .ok_or_else(|| "Connectez d'abord un compte Microsoft équipe.".to_string())?;
    let site = resolve_sharepoint_site_ref(config)?;
    let client = SharePointGraphClient::new(site);
    client.test_connection_blocking(&connection.access_token)
}

fn apply_sharepoint_test_overrides(
    mut config: WorkspaceConfig,
    site_hostname: Option<String>,
    site_path: Option<String>,
) -> WorkspaceConfig {
    if let Some(hostname) = site_hostname
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        config.site_hostname = Some(hostname);
    }
    if let Some(path) = site_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        config.site_path = Some(path);
    }
    config
}

#[tauri::command]
pub async fn test_microsoft_team_sharepoint_connection_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    site_hostname: Option<String>,
    site_path: Option<String>,
) -> Result<SharePointConnectionTestResult, String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        require_team_management_permission(&app_handle, database)?;
        apply_sharepoint_test_overrides(
            workspace_config_from_db(database)?,
            site_hostname,
            site_path,
        )
    };
    tauri::async_runtime::spawn_blocking(move || {
        test_microsoft_team_sharepoint_connection(&app_handle, &config)
    })
    .await
    .map_err(|error| format!("Test SharePoint interrompu : {error}"))?
}

#[tauri::command]
pub async fn upload_team_migration_snapshot_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    expected_checksum: String,
) -> Result<TeamMigrationUploadReport, String> {
    require_ui_session(&session)?;
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        require_team_management_permission(&app_handle, database)?;
        require_export_permission(&app_handle, database)?;
        let config = workspace_config_from_db(database)?;
        require_provisioned_team_workspace(&config)?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let db = app_handle.state::<DbState>();
        let config = {
            let guard = db
                .lock()
                .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
            let database = guard.as_ref().ok_or("Base non initialisée")?;
            workspace_config_from_db(database)?
        };
        upload_team_migration_snapshot(&app_handle, &db, &config, &expected_checksum)
    })
    .await
    .map_err(|error| format!("Upload migration interrompu : {error}"))?
}

#[tauri::command]
pub fn preview_team_migration_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<TeamMigrationPreview, String> {
    require_ui_session(&session)?;
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    require_team_management_permission(&app_handle, database)?;
    require_export_permission(&app_handle, database)?;
    let config = workspace_config_from_db(database)?;
    require_provisioned_team_workspace(&config)?;
    build_team_migration_preview(database)
        .map_err(|error| format!("Prévisualisation migration impossible : {error}"))
}

#[tauri::command]
pub async fn validate_team_remote_snapshot_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    expected_checksum: String,
) -> Result<TeamMigrationValidateReport, String> {
    require_ui_session(&session)?;
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        require_team_management_permission(&app_handle, database)?;
        require_export_permission(&app_handle, database)?;
        let config = workspace_config_from_db(database)?;
        require_provisioned_team_workspace(&config)?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let db = app_handle.state::<DbState>();
        let config = {
            let guard = db
                .lock()
                .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
            let database = guard.as_ref().ok_or("Base non initialisée")?;
            workspace_config_from_db(database)?
        };
        validate_team_remote_snapshot(&app_handle, &config, &expected_checksum)
    })
    .await
    .map_err(|error| format!("Validation restauration interrompue : {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::mode::WorkspaceMode;
    use crate::workspace::team::TeamRole;

    #[test]
    fn apply_sharepoint_test_overrides_prefers_form_values() {
        let base = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("old.sharepoint.com".into()),
            site_path: Some("/sites/old".into()),
            site_id: None,
            site_name: None,
            office_mailbox_email: None,
            ..Default::default()
        };
        let updated = apply_sharepoint_test_overrides(
            base,
            Some("new.sharepoint.com".into()),
            Some("/sites/new".into()),
        );
        assert_eq!(updated.site_hostname.as_deref(), Some("new.sharepoint.com"));
        assert_eq!(updated.site_path.as_deref(), Some("/sites/new"));
    }

    #[test]
    fn resolve_sharepoint_site_ref_requires_hostname_and_path() {
        let config = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: None,
            site_id: None,
            site_name: None,
            office_mailbox_email: None,
            ..Default::default()
        };
        assert!(resolve_sharepoint_site_ref(&config).is_err());
    }
}
