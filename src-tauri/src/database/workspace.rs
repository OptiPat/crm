//! Configuration locale du workspace (mode individuel / équipe SharePoint).
//! Extrait de `operations.rs` — persistance clé/valeur `workspace_config`.

use super::Database;
use crate::workspace::mode::WorkspaceMode;
use crate::workspace::team::TeamRole;
#[cfg(test)]
use crate::workspace::team::{capabilities_for_role, TeamCapabilities};
use rusqlite::Result;
use serde::{Deserialize, Serialize};

pub const WORKSPACE_CONFIG_SETTING_KEY: &str = "workspace_config";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    #[serde(default)]
    pub mode: WorkspaceMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<TeamRole>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub site_hostname: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub site_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub site_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub site_name: Option<String>,
    /// Boîte partagée Microsoft 365 du cabinet (envoi secrétaire / option conseiller).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub office_mailbox_email: Option<String>,
    /// Groupe Microsoft Entra des conseillers (UUID) — source d'autorité distante du rôle.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub advisor_group_id: Option<String>,
    /// Groupe Microsoft Entra des secrétaires (UUID) — source d'autorité distante du rôle.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secretary_group_id: Option<String>,
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            mode: WorkspaceMode::default(),
            role: None,
            site_hostname: None,
            site_path: None,
            site_id: None,
            site_name: None,
            office_mailbox_email: None,
            advisor_group_id: None,
            secretary_group_id: None,
        }
    }
}

impl WorkspaceConfig {
    pub fn is_team_configured(&self) -> bool {
        self.mode.is_team()
    }

    pub fn effective_role(&self) -> TeamRole {
        match self.mode {
            WorkspaceMode::Local => TeamRole::Advisor,
            WorkspaceMode::TeamSharepoint => self.role.unwrap_or(TeamRole::Advisor),
        }
    }

    #[cfg(test)]
    pub fn effective_capabilities(&self) -> TeamCapabilities {
        capabilities_for_role(self.effective_role())
    }
}

fn validate_entra_group_ids(config: &WorkspaceConfig) -> Result<(), String> {
    use crate::workspace::identity::{is_valid_uuid, role_resolution_error_message, RoleResolutionError};

    if let Some(ref id) = config.advisor_group_id {
        if !id.trim().is_empty() && !is_valid_uuid(id) {
            return Err(role_resolution_error_message(
                RoleResolutionError::InvalidAdvisorGroupId,
            ));
        }
    }
    if let Some(ref id) = config.secretary_group_id {
        if !id.trim().is_empty() && !is_valid_uuid(id) {
            return Err(role_resolution_error_message(
                RoleResolutionError::InvalidSecretaryGroupId,
            ));
        }
    }
    if let (Some(advisor), Some(secretary)) = (
        config
            .advisor_group_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty()),
        config
            .secretary_group_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty()),
    ) {
        if advisor.eq_ignore_ascii_case(secretary) {
            return Err(role_resolution_error_message(
                RoleResolutionError::IdenticalGroupIds,
            ));
        }
    }
    Ok(())
}

fn secretary_restricted_fields_changed(current: &WorkspaceConfig, next: &WorkspaceConfig) -> bool {
    current.site_hostname != next.site_hostname
        || current.site_path != next.site_path
        || current.site_id != next.site_id
        || current.site_name != next.site_name
        || current.office_mailbox_email != next.office_mailbox_email
        || current.advisor_group_id != next.advisor_group_id
        || current.secretary_group_id != next.secretary_group_id
}

fn enrollment_identity_changed(current: &WorkspaceConfig, next: &WorkspaceConfig) -> bool {
    current.site_hostname != next.site_hostname
        || current.site_path != next.site_path
        || current.site_id != next.site_id
        || current.advisor_group_id != next.advisor_group_id
        || current.secretary_group_id != next.secretary_group_id
}

pub fn validate_workspace_config_save(
    current: &WorkspaceConfig,
    next: &WorkspaceConfig,
) -> Result<(), String> {
    validate_workspace_config_save_with_authority(current, next, None)
}

pub fn validate_workspace_config_save_with_authority(
    current: &WorkspaceConfig,
    next: &WorkspaceConfig,
    resolved_role: Option<TeamRole>,
) -> Result<(), String> {
    let current_is_provisioned = current.mode.is_team()
        && current
            .site_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty());
    if current_is_provisioned {
        if next.mode != WorkspaceMode::TeamSharepoint {
            return Err(
                "Un espace équipe provisionné ne peut pas redevenir local par une simple modification de réglage."
                    .into(),
            );
        }
        if enrollment_identity_changed(current, next) {
            return Err(
                "Le site et les groupes d'un espace enrôlé ne peuvent pas être modifiés sans procédure de migration dédiée."
                    .into(),
            );
        }
    }

    if let Some(TeamRole::Secretary) = resolved_role {
        if next.mode != WorkspaceMode::TeamSharepoint {
            return Err("En mode secrétaire, vous ne pouvez pas désactiver le mode équipe.".into());
        }
        if next.role != Some(TeamRole::Secretary) {
            return Err(
                "En mode secrétaire, vous ne pouvez pas vous attribuer le rôle conseiller.".into(),
            );
        }
        if secretary_restricted_fields_changed(current, next) {
            return Err(
                "En mode secrétaire, vous ne pouvez pas modifier la configuration équipe (groupes, site, boîte)."
                    .into(),
            );
        }
    } else if current.is_team_configured() && current.effective_role() == TeamRole::Secretary {
        if next.mode != WorkspaceMode::TeamSharepoint {
            return Err("En mode secrétaire, vous ne pouvez pas désactiver le mode équipe.".into());
        }
        if next.role != Some(TeamRole::Secretary) {
            return Err(
                "En mode secrétaire, vous ne pouvez pas vous attribuer le rôle conseiller.".into(),
            );
        }
    }

    validate_entra_group_ids(next)?;

    if next.mode.is_team() {
        let hostname = next
            .site_hostname
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let site_path = next
            .site_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if hostname.is_none() || site_path.is_none() {
            return Err(
                "Le mode équipe requiert le hostname SharePoint et le chemin du site.".into(),
            );
        }
        if next.role.is_none() {
            return Err("Le mode équipe requiert un rôle (conseiller ou secrétaire).".into());
        }
    }

    Ok(())
}

impl Database {
    pub fn get_workspace_config(&self) -> Result<WorkspaceConfig> {
        match self.get_setting(WORKSPACE_CONFIG_SETTING_KEY)? {
            Some(json) if !json.trim().is_empty() => serde_json::from_str(&json).map_err(|error| {
                rusqlite::Error::InvalidParameterName(format!(
                    "workspace_config JSON parse error: {error}"
                ))
            }),
            _ => Ok(WorkspaceConfig::default()),
        }
    }

    pub fn save_workspace_config(&self, config: &WorkspaceConfig) -> Result<()> {
        let current = self.get_workspace_config()?;
        validate_workspace_config_save(&current, config)
            .map_err(|error| rusqlite::Error::InvalidParameterName(error))?;
        let json = serde_json::to_string(config).map_err(|error| {
            rusqlite::Error::InvalidParameterName(format!(
                "workspace_config JSON serialize error: {error}"
            ))
        })?;
        if config.mode.is_team() {
            self.set_setting(WORKSPACE_CONFIG_SETTING_KEY, &json)?;
        } else {
            self.delete_setting(WORKSPACE_CONFIG_SETTING_KEY)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory_for_tests().expect("in-memory db")
    }

    #[test]
    fn default_workspace_config_is_local_advisor() {
        let config = WorkspaceConfig::default();
        assert_eq!(config.mode, WorkspaceMode::Local);
        assert!(!config.is_team_configured());
        assert_eq!(config.effective_role(), TeamRole::Advisor);
        assert!(config.effective_capabilities().can_export);
    }

    #[test]
    fn absent_setting_returns_local_defaults() {
        let db = test_db();
        let config = db.get_workspace_config().unwrap();
        assert_eq!(config.mode, WorkspaceMode::Local);
    }

    #[test]
    fn secretary_cannot_disable_team_once_configured() {
        let current = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Secretary),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            site_id: None,
            site_name: Some("CRM équipe".into()),
            office_mailbox_email: None,
            ..Default::default()
        };
        let next = WorkspaceConfig {
            mode: WorkspaceMode::Local,
            ..Default::default()
        };
        let err = validate_workspace_config_save(&current, &next).unwrap_err();
        assert!(err.contains("désactiver"));
    }

    #[test]
    fn secretary_cannot_elevate_to_advisor() {
        let current = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Secretary),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            site_id: None,
            site_name: None,
            office_mailbox_email: None,
            ..Default::default()
        };
        let next = WorkspaceConfig {
            role: Some(TeamRole::Advisor),
            ..current.clone()
        };
        let err = validate_workspace_config_save(&current, &next).unwrap_err();
        assert!(err.contains("conseiller"));
    }

    #[test]
    fn team_mode_requires_site_and_role() {
        let current = WorkspaceConfig::default();
        let next = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            ..Default::default()
        };
        let err = validate_workspace_config_save(&current, &next).unwrap_err();
        assert!(err.contains("hostname"));
    }

    #[test]
    fn team_mode_rejects_identical_entra_group_ids() {
        let current = WorkspaceConfig::default();
        let next = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            advisor_group_id: Some("11111111-1111-1111-1111-111111111111".into()),
            secretary_group_id: Some("11111111-1111-1111-1111-111111111111".into()),
            ..Default::default()
        };
        let err = validate_workspace_config_save(&current, &next).unwrap_err();
        assert!(err.contains("distinct"));
    }

    #[test]
    fn save_and_load_team_config_roundtrip() {
        let db = test_db();
        let config = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm-team".into()),
            site_id: Some("site-123".into()),
            site_name: Some("CRM Patrimoine".into()),
            office_mailbox_email: Some("cabinet@example.com".into()),
            ..Default::default()
        };
        db.save_workspace_config(&config).unwrap();
        let loaded = db.get_workspace_config().unwrap();
        assert_eq!(loaded, config);
    }

    #[test]
    fn switching_back_to_local_deletes_setting() {
        let db = test_db();
        let team = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            site_id: None,
            site_name: None,
            office_mailbox_email: None,
            ..Default::default()
        };
        db.save_workspace_config(&team).unwrap();
        db.save_workspace_config(&WorkspaceConfig::default())
            .unwrap();
        assert!(db
            .get_setting(WORKSPACE_CONFIG_SETTING_KEY)
            .unwrap()
            .is_none());
        assert_eq!(
            db.get_workspace_config().unwrap().mode,
            WorkspaceMode::Local
        );
    }

    #[test]
    fn provisioned_workspace_cannot_fall_back_to_local_or_change_authority() {
        let current = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            site_id: Some("site-123".into()),
            advisor_group_id: Some("11111111-1111-1111-1111-111111111111".into()),
            secretary_group_id: Some("22222222-2222-2222-2222-222222222222".into()),
            ..Default::default()
        };

        let local_error =
            validate_workspace_config_save_with_authority(
                &current,
                &WorkspaceConfig::default(),
                Some(TeamRole::Advisor),
            )
            .unwrap_err();
        assert!(local_error.contains("provisionné"));

        let mut tampered = current.clone();
        tampered.secretary_group_id =
            Some("33333333-3333-3333-3333-333333333333".into());
        let group_error = validate_workspace_config_save_with_authority(
            &current,
            &tampered,
            Some(TeamRole::Advisor),
        )
        .unwrap_err();
        assert!(group_error.contains("groupes"));
    }
}
