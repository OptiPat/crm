use crate::database::models::CgpConfig;

use super::state::LicenseState;

fn trimmed_non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|entry| entry.trim().to_string())
        .filter(|entry| !entry.is_empty())
}

fn profile_display_name(cgp: &CgpConfig) -> Option<String> {
    let prenom = cgp.prenom.as_deref().unwrap_or("").trim();
    let nom = cgp.nom.as_deref().unwrap_or("").trim();
    let joined = format!("{prenom} {nom}").trim().to_string();
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

fn profile_email(cgp: &CgpConfig) -> Option<String> {
    trimmed_non_empty(cgp.email.clone()).filter(|email| email.contains('@'))
}

fn assign_if_present(slot: &mut Option<String>, incoming: Option<String>) -> bool {
    let Some(value) = incoming else {
        return false;
    };
    if slot.as_deref().map(str::trim) == Some(value.as_str()) {
        return false;
    }
    *slot = Some(value);
    true
}

fn identity_filled(value: &Option<String>) -> bool {
    value
        .as_deref()
        .is_some_and(|entry| !entry.trim().is_empty())
}

pub fn has_registry_identity(state: &LicenseState) -> bool {
    identity_filled(&state.client_email)
        || identity_filled(&state.client_name)
        || identity_filled(&state.cabinet)
}

/// Recopie email, nom et cabinet du profil CGP vers l'état licence.
/// Un profil vide ne vide pas une identité déjà enregistrée.
pub fn apply_profile_to_registry_identity(state: &mut LicenseState, cgp: &CgpConfig) -> bool {
    let email_changed = assign_if_present(&mut state.client_email, profile_email(cgp));
    let name_changed = assign_if_present(&mut state.client_name, profile_display_name(cgp));
    let cabinet_changed =
        assign_if_present(&mut state.cabinet, trimmed_non_empty(cgp.cabinet.clone()));
    email_changed || name_changed || cabinet_changed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_state() -> LicenseState {
        LicenseState {
            installation_id: "id".into(),
            status: super::super::state::LicenseStatus::Trial,
            license_type: Some("trial".into()),
            license_key_masked: None,
            client_email: None,
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
        }
    }

    #[test]
    fn profile_fills_empty_registry_identity() {
        let mut state = empty_state();
        let cgp = CgpConfig {
            prenom: Some("Paul".into()),
            nom: Some("LEGRAND".into()),
            cabinet: Some(" Cabinet Test ".into()),
            email: Some("paul@example.com".into()),
            ..CgpConfig::default()
        };
        assert!(apply_profile_to_registry_identity(&mut state, &cgp));
        assert_eq!(state.client_email.as_deref(), Some("paul@example.com"));
        assert_eq!(state.client_name.as_deref(), Some("Paul LEGRAND"));
        assert_eq!(state.cabinet.as_deref(), Some("Cabinet Test"));
    }

    #[test]
    fn empty_profile_keeps_existing_identity() {
        let mut state = empty_state();
        state.client_email = Some("a@example.com".into());
        state.client_name = Some("Paul LEGRAND".into());
        state.cabinet = Some("Cabinet Test".into());
        assert!(!apply_profile_to_registry_identity(
            &mut state,
            &CgpConfig::default()
        ));
        assert_eq!(state.client_email.as_deref(), Some("a@example.com"));
        assert_eq!(state.cabinet.as_deref(), Some("Cabinet Test"));
    }

    #[test]
    fn profile_email_without_at_is_ignored() {
        let mut state = empty_state();
        let cgp = CgpConfig {
            email: Some("pas-un-email".into()),
            ..CgpConfig::default()
        };
        assert!(!apply_profile_to_registry_identity(&mut state, &cgp));
        assert!(state.client_email.is_none());
    }
}
