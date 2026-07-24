//! Garde central des opérations sensibles (export / sauvegarde / restauration).

use crate::commands::DbState;
use crate::database::workspace::WorkspaceConfig;
use crate::database::Database;
use crate::workspace::identity::{
    can_export_with_resolved_role, can_manage_team_with_resolved_role,
    require_sensitive_team_authority,
};
use crate::workspace::sharepoint::SharePointSiteRef;
use tauri::AppHandle;

const EXPORT_DENIED_MESSAGE: &str =
    "Export et sauvegarde complets interdits en mode secrétaire équipe.";

pub fn require_export_permission(app: &AppHandle, db: &Database) -> Result<(), String> {
    let config = workspace_config_from_db(db)?;
    let authority = require_sensitive_team_authority(app, &config)?;
    if can_export_with_resolved_role(authority.role) {
        Ok(())
    } else {
        Err(EXPORT_DENIED_MESSAGE.into())
    }
}

pub fn require_export_permission_state(app: &AppHandle, db: &DbState) -> Result<(), String> {
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    require_export_permission(app, database)
}

pub fn workspace_config_from_db(db: &Database) -> Result<WorkspaceConfig, String> {
    db.get_workspace_config()
        .map_err(|error| format!("Configuration workspace inaccessible : {error}"))
}

pub fn resolve_sharepoint_site_ref(config: &WorkspaceConfig) -> Result<SharePointSiteRef, String> {
    let hostname = config
        .site_hostname
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "Configurez le hostname SharePoint avant d'utiliser le mode équipe.".to_string()
        })?;
    let site_path = config
        .site_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "Configurez le chemin du site SharePoint avant d'utiliser le mode équipe.".to_string()
        })?;
    Ok(SharePointSiteRef {
        hostname: hostname.to_string(),
        site_path: site_path.to_string(),
    })
}

pub fn require_team_management_permission(app: &AppHandle, db: &Database) -> Result<(), String> {
    let config = workspace_config_from_db(db)?;
    let authority = require_sensitive_team_authority(app, &config)?;
    if can_manage_team_with_resolved_role(authority.role) {
        Ok(())
    } else {
        Err("Action réservée au conseiller en mode équipe.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::identity::can_export_with_resolved_role;
    use crate::workspace::mode::WorkspaceMode;
    use crate::workspace::team::TeamRole;

    #[test]
    fn guard_export_with_resolved_role_matches_capabilities() {
        assert!(can_export_with_resolved_role(TeamRole::Advisor));
        assert!(!can_export_with_resolved_role(TeamRole::Secretary));
    }

    #[test]
    fn local_mode_config_allows_export_via_resolved_advisor_role() {
        let config = WorkspaceConfig::default();
        assert_eq!(config.mode, WorkspaceMode::Local);
        assert!(can_export_with_resolved_role(config.effective_role()));
    }
}
