use serde::{Deserialize, Serialize};

pub const LICENSE_STATE_KEY: &str = "license_state";
pub const LICENSE_LEGACY_MIGRATED_KEY: &str = "license_legacy_migrated";
pub const TRIAL_DAYS: i64 = 30;
/// V1 sans facturation : essai sans date d'expiration (passer à `false` quand la facturation est active).
pub const TRIAL_OPEN_ACCESS: bool = true;
pub const MAX_TRIAL_RESTARTS: i64 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LicenseStatus {
    Trial,
    Active,
    Legacy,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseState {
    pub installation_id: String,
    pub status: LicenseStatus,
    pub license_type: Option<String>,
    pub license_key_masked: Option<String>,
    pub client_email: Option<String>,
    pub client_name: Option<String>,
    pub cabinet: Option<String>,
    pub activated_at: i64,
    pub expires_at: Option<i64>,
    pub installed_at: i64,
    pub legacy: bool,
    pub registry_synced: bool,
    pub last_heartbeat_at: Option<i64>,
    #[serde(default)]
    pub trial_restart_count: i64,
    #[serde(default)]
    pub state_integrity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatusView {
    pub installation_id: String,
    pub status: LicenseStatus,
    pub license_type: Option<String>,
    pub license_key_masked: Option<String>,
    pub client_email: Option<String>,
    pub client_name: Option<String>,
    pub cabinet: Option<String>,
    pub activated_at: i64,
    pub expires_at: Option<i64>,
    pub installed_at: i64,
    pub legacy: bool,
    pub is_valid: bool,
    pub days_remaining: Option<i64>,
    pub needs_activation: bool,
    pub registry_configured: bool,
    pub registry_synced: bool,
    pub trial_restart_count: i64,
    pub can_restart_trial: bool,
}

impl LicenseState {
    pub fn is_valid_at(&self, now: i64) -> bool {
        match self.status {
            LicenseStatus::Expired => false,
            LicenseStatus::Active => self
                .expires_at
                .map(|exp| now <= exp)
                .unwrap_or(true),
            LicenseStatus::Trial => self
                .expires_at
                .map(|exp| now <= exp)
                .unwrap_or(super::TRIAL_OPEN_ACCESS),
            LicenseStatus::Legacy => self
                .expires_at
                .map(|exp| now <= exp)
                .unwrap_or(true),
        }
    }

    pub fn days_remaining_at(&self, now: i64) -> Option<i64> {
        self.expires_at.map(|exp| {
            let secs = exp - now;
            if secs <= 0 {
                0
            } else {
                (secs + 86_399) / 86_400
            }
        })
    }

    pub fn refresh_validity(&mut self, now: i64) {
        if !self.is_valid_at(now)
            && matches!(
                self.status,
                LicenseStatus::Trial | LicenseStatus::Legacy | LicenseStatus::Active
            )
        {
            self.status = LicenseStatus::Expired;
            self.license_type = Some("expired".to_string());
        }
    }

    pub fn needs_activation(&self) -> bool {
        if self.status == LicenseStatus::Expired {
            return true;
        }
        !self.is_valid_at(chrono::Utc::now().timestamp())
            || (self.status == LicenseStatus::Trial
                && self.client_email.as_deref().unwrap_or("").trim().is_empty())
    }

    pub fn to_view(&self, now: i64, registry_configured: bool) -> LicenseStatusView {
        let mut copy = self.clone();
        copy.refresh_validity(now);
        let needs_activation = copy.needs_activation();
        LicenseStatusView {
            installation_id: copy.installation_id.clone(),
            status: copy.status,
            license_type: copy.license_type.clone(),
            license_key_masked: copy.license_key_masked.clone(),
            client_email: copy.client_email.clone(),
            client_name: copy.client_name.clone(),
            cabinet: copy.cabinet.clone(),
            activated_at: copy.activated_at,
            expires_at: copy.expires_at,
            installed_at: copy.installed_at,
            legacy: copy.legacy,
            is_valid: copy.is_valid_at(now),
            days_remaining: copy.days_remaining_at(now),
            needs_activation,
            registry_configured,
            registry_synced: copy.registry_synced,
            trial_restart_count: copy.trial_restart_count,
            can_restart_trial: copy.trial_restart_count < MAX_TRIAL_RESTARTS,
        }
    }
}

pub fn mask_license_key(key: &str) -> String {
    let compact: String = key.chars().filter(|c| *c != '-').collect();
    if compact.len() <= 4 {
        return "****".to_string();
    }
    let visible = &compact[compact.len() - 4..];
    format!("****-****-****-{visible}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trial_open_access_without_expiry_is_valid() {
        let state = LicenseState {
            installation_id: "id".into(),
            status: LicenseStatus::Trial,
            license_type: Some("trial".into()),
            license_key_masked: None,
            client_email: Some("a@example.com".into()),
            client_name: None,
            cabinet: None,
            activated_at: 0,
            expires_at: None,
            installed_at: 0,
            legacy: false,
            registry_synced: true,
            last_heartbeat_at: None,
            trial_restart_count: 0,
            state_integrity: None,
        };
        assert!(state.is_valid_at(9_999_999_999));
        assert!(!state.needs_activation());
    }

    #[test]
    fn legacy_without_expiry_is_always_valid() {
        let state = LicenseState {
            installation_id: "id".into(),
            status: LicenseStatus::Legacy,
            license_type: Some("legacy".into()),
            license_key_masked: None,
            client_email: Some("a@example.com".into()),
            client_name: None,
            cabinet: None,
            activated_at: 0,
            expires_at: None,
            installed_at: 0,
            legacy: true,
            registry_synced: true,
            last_heartbeat_at: None,
            trial_restart_count: 0,
            state_integrity: None,
        };
        assert!(state.is_valid_at(9_999_999_999));
        assert!(!state.needs_activation());
    }

    #[test]
    fn expired_status_needs_activation() {
        let state = LicenseState {
            installation_id: "id".into(),
            status: LicenseStatus::Expired,
            license_type: Some("expired".into()),
            license_key_masked: None,
            client_email: Some("a@example.com".into()),
            client_name: None,
            cabinet: None,
            activated_at: 0,
            expires_at: Some(1),
            installed_at: 0,
            legacy: false,
            registry_synced: true,
            last_heartbeat_at: None,
            trial_restart_count: 0,
            state_integrity: None,
        };
        assert!(state.needs_activation());
    }

    #[test]
    fn refresh_validity_persists_expired_type() {
        let mut state = LicenseState {
            installation_id: "id".into(),
            status: LicenseStatus::Trial,
            license_type: Some("trial".into()),
            license_key_masked: None,
            client_email: Some("a@example.com".into()),
            client_name: None,
            cabinet: None,
            activated_at: 0,
            expires_at: Some(1),
            installed_at: 0,
            legacy: false,
            registry_synced: true,
            last_heartbeat_at: None,
            trial_restart_count: 0,
            state_integrity: None,
        };
        state.refresh_validity(9_999_999_999);
        assert_eq!(state.status, LicenseStatus::Expired);
        assert_eq!(state.license_type.as_deref(), Some("expired"));
    }
}
