//! Enrôlement équipe scellé hors SQLite.
//!
//! Ce marqueur empêche qu'une simple suppression de `workspace_config` dans la
//! base locale fasse retomber silencieusement l'application en mode conseiller.

use crate::database::workspace::WorkspaceConfig;
use crate::email::oauth_secrets::{decrypt_secret, encrypt_secret, load_storage_key};
use crate::workspace::mode::WorkspaceMode;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const ENROLLMENT_FILE: &str = "workspace_enrollment.sealed";
const ENROLLMENT_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEnrollment {
    pub version: u32,
    pub workspace_id: String,
    pub site_id: String,
    pub site_hostname: String,
    pub site_path: String,
    #[serde(default)]
    pub site_name: Option<String>,
    #[serde(default)]
    pub office_mailbox_email: Option<String>,
    pub advisor_group_id: String,
    pub secretary_group_id: String,
    #[serde(default)]
    pub sync_activated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorkspaceEnrollment {
    version: u32,
    payload_enc: String,
}

fn required(value: Option<&str>, label: &str) -> Result<String, String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Enrôlement équipe incomplet : {label} manquant."))
}

fn normalize_path(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

fn random_workspace_id() -> String {
    let mut bytes = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

impl WorkspaceEnrollment {
    pub fn from_config(config: &WorkspaceConfig) -> Result<Self, String> {
        if config.mode != WorkspaceMode::TeamSharepoint {
            return Err("L'enrôlement scellé requiert le mode équipe.".into());
        }
        Ok(Self {
            version: ENROLLMENT_VERSION,
            workspace_id: random_workspace_id(),
            site_id: required(config.site_id.as_deref(), "site SharePoint")?,
            site_hostname: required(config.site_hostname.as_deref(), "hostname SharePoint")?
                .to_lowercase(),
            site_path: normalize_path(&required(
                config.site_path.as_deref(),
                "chemin SharePoint",
            )?),
            site_name: config.site_name.clone(),
            office_mailbox_email: config.office_mailbox_email.clone(),
            advisor_group_id: required(
                config.advisor_group_id.as_deref(),
                "groupe conseiller",
            )?
            .to_lowercase(),
            secretary_group_id: required(
                config.secretary_group_id.as_deref(),
                "groupe secrétaire",
            )?
            .to_lowercase(),
            sync_activated: false,
        })
    }

    pub fn matches_config(&self, config: &WorkspaceConfig) -> bool {
        config.mode == WorkspaceMode::TeamSharepoint
            && config
                .site_id
                .as_deref()
                .is_some_and(|value| value.trim() == self.site_id)
            && config.site_hostname.as_deref().is_some_and(|value| {
                value.trim().eq_ignore_ascii_case(&self.site_hostname)
            })
            && config.site_path.as_deref().is_some_and(|value| {
                normalize_path(value).eq_ignore_ascii_case(&self.site_path)
            })
            && config.advisor_group_id.as_deref().is_some_and(|value| {
                value
                    .trim()
                    .eq_ignore_ascii_case(&self.advisor_group_id)
            })
            && config.secretary_group_id.as_deref().is_some_and(|value| {
                value
                    .trim()
                    .eq_ignore_ascii_case(&self.secretary_group_id)
            })
    }
}

fn enrollment_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(dir.join(ENROLLMENT_FILE))
}

pub fn load_workspace_enrollment(
    app: &AppHandle,
) -> Result<Option<WorkspaceEnrollment>, String> {
    let path = enrollment_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Lecture enrôlement équipe impossible : {error}"))?;
    let persisted: PersistedWorkspaceEnrollment = serde_json::from_str(&raw)
        .map_err(|error| format!("Enrôlement équipe illisible : {error}"))?;
    if persisted.version != ENROLLMENT_VERSION {
        return Err(format!(
            "Version d'enrôlement équipe non supportée : {}.",
            persisted.version
        ));
    }
    let key = load_storage_key(app)?
        .ok_or_else(|| "Clé locale de l'enrôlement équipe indisponible.".to_string())?;
    let payload = decrypt_secret(&persisted.payload_enc, &key)
        .map_err(|error| format!("Enrôlement équipe invalide ou altéré : {error}"))?;
    let enrollment: WorkspaceEnrollment = serde_json::from_str(&payload)
        .map_err(|error| format!("Contenu enrôlement équipe invalide : {error}"))?;
    if enrollment.version != ENROLLMENT_VERSION {
        return Err("Version interne de l'enrôlement équipe incohérente.".into());
    }
    Ok(Some(enrollment))
}

pub fn save_workspace_enrollment(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<WorkspaceEnrollment, String> {
    let enrollment = WorkspaceEnrollment::from_config(config)?;
    let payload = serde_json::to_string(&enrollment)
        .map_err(|error| format!("Sérialisation enrôlement équipe : {error}"))?;
    let key = load_storage_key(app)?
        .ok_or_else(|| "Clé locale de l'enrôlement équipe indisponible.".to_string())?;
    let persisted = PersistedWorkspaceEnrollment {
        version: ENROLLMENT_VERSION,
        payload_enc: encrypt_secret(&payload, &key)?,
    };
    let path = enrollment_path(app)?;
    let raw = serde_json::to_vec_pretty(&persisted)
        .map_err(|error| format!("Sérialisation fichier d'enrôlement : {error}"))?;
    crate::atomic_file::write(&path, &raw)
        .map_err(|error| format!("Écriture enrôlement équipe impossible : {error}"))?;
    Ok(enrollment)
}

pub fn mark_workspace_sync_activated(
    app: &AppHandle,
) -> Result<WorkspaceEnrollment, String> {
    set_workspace_sync_activated(app, true)
}

pub fn set_workspace_sync_activated(
    app: &AppHandle,
    activated: bool,
) -> Result<WorkspaceEnrollment, String> {
    let mut enrollment = load_workspace_enrollment(app)?
        .ok_or_else(|| "Enrôlement équipe absent lors de l'activation.".to_string())?;
    enrollment.sync_activated = activated;
    let payload = serde_json::to_string(&enrollment)
        .map_err(|error| format!("Sérialisation enrôlement équipe : {error}"))?;
    let key = load_storage_key(app)?
        .ok_or_else(|| "Clé locale de l'enrôlement équipe indisponible.".to_string())?;
    let persisted = PersistedWorkspaceEnrollment {
        version: ENROLLMENT_VERSION,
        payload_enc: encrypt_secret(&payload, &key)?,
    };
    let path = enrollment_path(app)?;
    let raw = serde_json::to_vec_pretty(&persisted)
        .map_err(|error| format!("Sérialisation fichier d'enrôlement : {error}"))?;
    crate::atomic_file::write(&path, &raw)
        .map_err(|error| format!("Écriture enrôlement équipe impossible : {error}"))?;
    Ok(enrollment)
}

pub fn validate_workspace_enrollment(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<(), String> {
    let Some(enrollment) = load_workspace_enrollment(app)? else {
        return Ok(());
    };
    if enrollment.matches_config(config) {
        Ok(())
    } else {
        Err(
            "Enrôlement équipe incohérent ou configuration locale altérée. \
             L'accès aux données et aux exports reste bloqué."
                .into(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::team::TeamRole;

    fn config() -> WorkspaceConfig {
        WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("Contoso.SharePoint.com".into()),
            site_path: Some("sites/crm".into()),
            site_id: Some("site-1".into()),
            site_name: Some("CRM".into()),
            office_mailbox_email: Some("cabinet@example.com".into()),
            advisor_group_id: Some("11111111-1111-1111-1111-111111111111".into()),
            secretary_group_id: Some("22222222-2222-2222-2222-222222222222".into()),
            ..WorkspaceConfig::default()
        }
    }

    #[test]
    fn enrollment_matches_normalized_team_config() {
        let config = config();
        let enrollment = WorkspaceEnrollment::from_config(&config).unwrap();
        assert!(enrollment.matches_config(&config));
        assert_eq!(enrollment.site_name.as_deref(), Some("CRM"));
        assert_eq!(
            enrollment.office_mailbox_email.as_deref(),
            Some("cabinet@example.com")
        );
    }

    #[test]
    fn enrollment_rejects_local_fallback_and_group_tampering() {
        let config = config();
        let enrollment = WorkspaceEnrollment::from_config(&config).unwrap();
        assert!(!enrollment.matches_config(&WorkspaceConfig::default()));

        let mut tampered = config;
        tampered.secretary_group_id =
            Some("33333333-3333-3333-3333-333333333333".into());
        assert!(!enrollment.matches_config(&tampered));
    }
}
