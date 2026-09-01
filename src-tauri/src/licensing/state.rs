use serde::{Deserialize, Serialize};

pub const LICENSE_STATE_KEY: &str = "license_state";
pub const LICENSE_LEGACY_MIGRATED_KEY: &str = "license_legacy_migrated";
pub const TRIAL_DAYS: i64 = 30;
/// V1 sans facturation : essai sans date d'expiration (passer à `false` quand la facturation est active).
pub const TRIAL_OPEN_ACCESS: bool = true;
/// Affichage UI de la licence payante. `false` = écran / Paramètres / bannière masqués
/// (le code d'activation reste). Remettre à `true` ici **et** dans `src/lib/licensing/license-ui.ts`.
pub const LICENSE_UI_VISIBLE: bool = false;
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

    pub fn migrate_open_access_if_needed(&mut self) {
        if !TRIAL_OPEN_ACCESS {
            return;
        }
        if self.legacy {
            self.expires_at = None;
            if self.status == LicenseStatus::Expired {
                self.status = LicenseStatus::Legacy;
                self.license_type = Some("legacy".to_string());
            }
            return;
        }
        if self.status == LicenseStatus::Trial && self.expires_at.is_some() {
            self.expires_at = None;
        }
    }

    /// Migration open-access + expiration + rétablissement si l'UI licence est masquée.
    pub fn apply_runtime_access(&mut self, now: i64, ui_visible: bool) {
        self.migrate_open_access_if_needed();
        self.refresh_validity(now);
        self.restore_access_for_hidden_ui(now, ui_visible);
    }

    pub fn needs_activation(&self) -> bool {
        if self.status == LicenseStatus::Expired {
            return true;
        }
        !self.is_valid_at(chrono::Utc::now().timestamp())
            || (self.status == LicenseStatus::Trial
                && self.client_email.as_deref().unwrap_or("").trim().is_empty())
    }

    /// Essai semé sans email (UI masquée) : on peut y attacher l'identité sans relancer l'essai.
    pub fn is_silent_trial(&self, now: i64) -> bool {
        self.status == LicenseStatus::Trial
            && self.is_valid_at(now)
            && self
                .client_email
                .as_deref()
                .unwrap_or("")
                .trim()
                .is_empty()
    }

    /// Quand l'UI licence est masquée, une installation expirée ou sans date
    /// d'accès ne doit pas bloquer l'app (pas d'écran de renouvellement).
    pub fn restore_access_for_hidden_ui(&mut self, now: i64, ui_visible: bool) {
        if ui_visible {
            return;
        }
        if self.status == LicenseStatus::Expired || !self.is_valid_at(now) {
            self.status = LicenseStatus::Trial;
            self.license_type = Some("trial".to_string());
            self.expires_at = None;
            return;
        }
        if matches!(self.status, LicenseStatus::Trial | LicenseStatus::Legacy)
            && self.expires_at.is_some()
        {
            self.expires_at = None;
        }
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

    fn expired_fixture() -> LicenseState {
        LicenseState {
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
        }
    }

    #[test]
    fn hidden_ui_restores_expired_to_open_trial() {
        let mut state = expired_fixture();
        state.restore_access_for_hidden_ui(9_999_999_999, false);
        assert_eq!(state.status, LicenseStatus::Trial);
        assert!(state.expires_at.is_none());
        assert!(state.is_valid_at(9_999_999_999));
    }

    #[test]
    fn visible_ui_leaves_expired_unchanged() {
        let mut state = expired_fixture();
        state.restore_access_for_hidden_ui(9_999_999_999, true);
        assert_eq!(state.status, LicenseStatus::Expired);
        assert_eq!(state.expires_at, Some(1));
    }

    #[test]
    fn apply_runtime_access_restores_expired_when_ui_hidden() {
        let mut state = expired_fixture();
        state.apply_runtime_access(9_999_999_999, false);
        assert_eq!(state.status, LicenseStatus::Trial);
        assert!(state.expires_at.is_none());
        assert!(state.is_valid_at(9_999_999_999));
    }

    #[test]
    fn apply_runtime_access_keeps_expired_when_ui_visible() {
        let mut state = expired_fixture();
        state.apply_runtime_access(9_999_999_999, true);
        assert_eq!(state.status, LicenseStatus::Expired);
        assert!(!state.is_valid_at(9_999_999_999));
    }

    #[test]
    fn silent_trial_without_email_can_attach_identity() {
        let state = LicenseState {
            installation_id: "id".into(),
            status: LicenseStatus::Trial,
            license_type: Some("trial".into()),
            license_key_masked: None,
            client_email: None,
            client_name: None,
            cabinet: None,
            activated_at: 0,
            expires_at: None,
            installed_at: 0,
            legacy: false,
            registry_synced: false,
            last_heartbeat_at: None,
            trial_restart_count: 0,
            state_integrity: None,
        };
        assert!(state.is_silent_trial(1_000));
        assert!(state.needs_activation());
    }

    #[test]
    fn trial_with_email_is_not_silent() {
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
        assert!(!state.is_silent_trial(1_000));
        assert!(!state.needs_activation());
    }
}
