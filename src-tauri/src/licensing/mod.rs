mod commands;
mod gate;
mod keys;
mod registry;
mod registry_sync;
mod state;

pub use commands::{
    activate_license_cmd, get_license_status_cmd, needs_license_activation_cmd,
    start_license_trial_cmd,
};
pub use gate::{install_authorizer, refresh_write_gate};
pub use state::{LicenseState, LicenseStatus, LicenseStatusView, LICENSE_LEGACY_MIGRATED_KEY, LICENSE_STATE_KEY};

use crate::database::Database;
use gate::bypass_authorizer;
use keys::{attach_state_integrity, signing_secret, validate_license_key, verify_state_integrity};
use rand::Rng;
use registry::{is_registry_configured, os_label, post_registry_event, RegistryPayload};
use registry_sync::{try_sync_and_apply};
use state::{mask_license_key, MAX_TRIAL_RESTARTS, TRIAL_DAYS, TRIAL_OPEN_ACCESS};
use std::thread;

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

pub(crate) fn load_state_for_gate(db: &Database) -> Result<Option<LicenseState>, String> {
    bypass_authorizer(|| {
        match db
            .get_setting(LICENSE_STATE_KEY)
            .map_err(|e| format!("Lecture licence : {e}"))?
        {
            Some(json) => {
                serde_json::from_str(&json).map_err(|e| format!("Licence corrompue : {e}"))
            }
            None => Ok(None),
        }
    })
}

fn load_state(db: &Database) -> Result<Option<LicenseState>, String> {
    let raw = load_state_for_gate(db)?;
    match raw {
        Some(state) if verify_state_integrity(&state) => Ok(Some(state)),
        Some(state) if signing_secret().is_none() => Ok(Some(state)),
        Some(_) => Ok(None),
        None => Ok(None),
    }
}

fn save_state(db: &Database, state: &LicenseState) -> Result<(), String> {
    let mut to_save = state.clone();
    attach_state_integrity(&mut to_save);
    bypass_authorizer(|| {
        let json =
            serde_json::to_string(&to_save).map_err(|e| format!("Sérialisation licence : {e}"))?;
        db.set_setting(LICENSE_STATE_KEY, &json)
            .map_err(|e| format!("Enregistrement licence : {e}"))
    })
}

fn persist_and_refresh_gate(db: &Database, state: &LicenseState) -> Result<(), String> {
    save_state(db, state)?;
    refresh_write_gate(db);
    Ok(())
}

fn new_installation_id() -> String {
    let mut rng = rand::thread_rng();
    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        rng.gen::<u32>(),
        rng.gen::<u16>(),
        rng.gen::<u16>() | 0x4000,
        rng.gen::<u16>() | 0x8000,
        rng.gen::<u64>() & 0x0000_FFFF_FFFF_FFFF
    )
}

fn normalize_email(email: &str) -> Result<String, String> {
    let trimmed = email.trim();
    if trimmed.is_empty() || !trimmed.contains('@') {
        return Err("Adresse email invalide.".to_string());
    }
    Ok(trimmed.to_string())
}

fn registry_license_type(state: &LicenseState) -> String {
    if state.status == LicenseStatus::Expired {
        return "expired".to_string();
    }
    state.license_type.clone().unwrap_or_else(|| match state.status {
        LicenseStatus::Legacy => "legacy".to_string(),
        LicenseStatus::Trial => "trial".to_string(),
        LicenseStatus::Active => "active".to_string(),
        LicenseStatus::Expired => "expired".to_string(),
    })
}

pub(crate) fn sync_registry_event(
    app: &tauri::AppHandle,
    state: &LicenseState,
    event: &str,
    license_key: Option<&str>,
) -> bool {
    if !is_registry_configured() {
        return false;
    }
    let token = match registry::registry_token() {
        Some(value) => value,
        None => return false,
    };
    let version = app.package_info().version.to_string();
    let license_type = registry_license_type(state);
    let payload = RegistryPayload {
        token,
        event,
        installation_id: &state.installation_id,
        license_key,
        license_type: &license_type,
        client_email: state.client_email.as_deref(),
        client_name: state.client_name.as_deref(),
        cabinet: state.cabinet.as_deref(),
        app_version: &version,
        os: &os_label(),
        activated_at: state.activated_at,
        expires_at: state.expires_at,
        installed_at: state.installed_at,
        legacy: state.legacy,
    };
    match post_registry_event(&payload) {
        Ok(()) => true,
        Err(err) => {
            eprintln!("⚠️ Registre licences : {err}");
            false
        }
    }
}

fn spawn_registry_sync(app: tauri::AppHandle, state: LicenseState, event: String, license_key: Option<String>) {
    thread::spawn(move || {
        sync_registry_event(
            &app,
            &state,
            &event,
            license_key.as_deref(),
        );
    });
}

fn migrate_open_access_if_needed(state: &mut LicenseState) {
    if !TRIAL_OPEN_ACCESS {
        return;
    }
    if state.legacy {
        state.expires_at = None;
        if state.status == LicenseStatus::Expired {
            state.status = LicenseStatus::Legacy;
            state.license_type = Some("legacy".to_string());
        }
        return;
    }
    if state.status == LicenseStatus::Trial && state.expires_at.is_some() {
        state.expires_at = None;
    }
}

fn sync_registry_if_pending(
    app: &tauri::AppHandle,
    db: &Database,
    state: &LicenseState,
    now: i64,
) -> Result<LicenseState, String> {
    if state.registry_synced {
        let due = state
            .last_heartbeat_at
            .map(|last| now - last >= 86_400)
            .unwrap_or(true);
        if due {
            let (updated, synced) = try_sync_and_apply(app, state, "heartbeat", None, now);
            if synced {
                persist_and_refresh_gate(db, &updated)?;
                return Ok(updated);
            }
        }
        return Ok(state.clone());
    }
    let event = registry_sync::initial_registry_event(state);
    let (updated, synced) = try_sync_and_apply(app, state, event, None, now);
    if synced {
        persist_and_refresh_gate(db, &updated)?;
        Ok(updated)
    } else {
        eprintln!(
            "⚠️ Registre licences : envoi impossible (vérifiez LICENSE_REGISTRY_* à la compilation et le token Apps Script)."
        );
        spawn_registry_sync(
            app.clone(),
            state.clone(),
            event.to_string(),
            None,
        );
        Ok(state.clone())
    }
}

pub fn get_status(db: &Database) -> Result<state::LicenseStatusView, String> {
    let now = now_ts();
    let configured = is_registry_configured();
    let view = match load_state(db)? {
        Some(mut state) => {
            let had_open_access_expiry = (state.legacy || state.status == LicenseStatus::Trial)
                && state.expires_at.is_some();
            migrate_open_access_if_needed(&mut state);
            let before = state.status;
            state.refresh_validity(now);
            if state.status != before || had_open_access_expiry {
                persist_and_refresh_gate(db, &state)?;
            } else {
                refresh_write_gate(db);
            }
            state.to_view(now, configured)
        }
        None => {
            refresh_write_gate(db);
            state::LicenseStatusView {
                installation_id: String::new(),
                status: LicenseStatus::Expired,
                license_type: None,
                license_key_masked: None,
                client_email: None,
                client_name: None,
                cabinet: None,
                activated_at: 0,
                expires_at: None,
                installed_at: 0,
                legacy: false,
                is_valid: false,
                days_remaining: None,
                needs_activation: true,
                registry_configured: configured,
                registry_synced: false,
                trial_restart_count: 0,
                can_restart_trial: true,
            }
        }
    };
    refresh_write_gate(db);
    Ok(view)
}

pub fn needs_activation_screen(db: &Database) -> Result<bool, String> {
    let view = get_status(db)?;
    Ok(view.needs_activation)
}

pub fn ensure_on_database_open(
    app: &tauri::AppHandle,
    db: &Database,
    installed_at: Option<i64>,
) -> Result<(), String> {
    let now = now_ts();
    let installed_at = installed_at.unwrap_or(now);

    if let Some(mut state) = load_state(db)? {
        migrate_open_access_if_needed(&mut state);
        state.refresh_validity(now);
        persist_and_refresh_gate(db, &state)?;
        if state.legacy {
            let marker = bypass_authorizer(|| {
                db.get_setting(LICENSE_LEGACY_MIGRATED_KEY)
                    .map_err(|e| format!("Lecture migration licence : {e}"))
            })?;
            if marker.is_none() {
                bypass_authorizer(|| {
                    db.set_setting(LICENSE_LEGACY_MIGRATED_KEY, "1")
                        .map_err(|e| format!("Marqueur migration licence : {e}"))
                })?;
            }
        }
        let _ = sync_registry_if_pending(app, db, &state, now)?;
        return Ok(());
    }

    let wizard_done = db.is_wizard_completed().unwrap_or(false);
    if !wizard_done {
        refresh_write_gate(db);
        return Ok(());
    }

    let already_migrated = bypass_authorizer(|| {
        db.get_setting(LICENSE_LEGACY_MIGRATED_KEY)
            .map_err(|e| format!("Lecture migration licence : {e}"))
    })?;
    if already_migrated.is_some() {
        refresh_write_gate(db);
        return Ok(());
    }

    let cgp = db.get_cgp_config().unwrap_or_default();
    let state = LicenseState {
        installation_id: new_installation_id(),
        status: LicenseStatus::Legacy,
        license_type: Some("legacy".to_string()),
        license_key_masked: None,
        client_email: cgp.email.clone(),
        client_name: match (&cgp.prenom, &cgp.nom) {
            (Some(p), Some(n)) if !p.trim().is_empty() || !n.trim().is_empty() => {
                Some(format!("{} {}", p.trim(), n.trim()).trim().to_string())
            }
            _ => None,
        },
        cabinet: cgp.cabinet.clone(),
        activated_at: now,
        expires_at: None,
        installed_at,
        legacy: true,
        registry_synced: false,
        last_heartbeat_at: None,
        trial_restart_count: 0,
        state_integrity: None,
    };

    persist_and_refresh_gate(db, &state)?;
    bypass_authorizer(|| {
        db.set_setting(LICENSE_LEGACY_MIGRATED_KEY, "1")
            .map_err(|e| format!("Marqueur migration licence : {e}"))
    })?;
    let _ = sync_registry_if_pending(app, db, &state, now)?;
    Ok(())
}

pub fn start_trial(
    app: &tauri::AppHandle,
    db: &Database,
    client_email: String,
    client_name: Option<String>,
    cabinet: Option<String>,
    installed_at: Option<i64>,
    allow_restart: bool,
) -> Result<state::LicenseStatusView, String> {
    let now = now_ts();
    let email = normalize_email(&client_email)?;
    let installed_at = installed_at.unwrap_or(now);

    let existing = load_state(db)?;
    if let Some(ref prev) = existing {
        if !allow_restart && prev.is_valid_at(now) {
            return Err("Une licence active est déjà enregistrée.".to_string());
        }
        if allow_restart {
            if prev.trial_restart_count >= MAX_TRIAL_RESTARTS {
                return Err("Nombre maximum de relances d'essai atteint.".to_string());
            }
            if prev.is_valid_at(now) {
                return Err("L'essai ne peut être relancé qu'après expiration.".to_string());
            }
        }
    }

    let mut state = existing.unwrap_or(LicenseState {
        installation_id: new_installation_id(),
        status: LicenseStatus::Trial,
        license_type: None,
        license_key_masked: None,
        client_email: None,
        client_name: None,
        cabinet: None,
        activated_at: now,
        expires_at: None,
        installed_at,
        legacy: false,
        registry_synced: false,
        last_heartbeat_at: None,
        trial_restart_count: 0,
        state_integrity: None,
    });

    if allow_restart {
        state.trial_restart_count += 1;
    }

    state.client_email = Some(email);
    state.client_name = client_name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    state.cabinet = cabinet.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    state.status = LicenseStatus::Trial;
    state.license_type = Some("trial".to_string());
    state.license_key_masked = None;
    state.activated_at = now;
    state.expires_at = if TRIAL_OPEN_ACCESS {
        None
    } else {
        Some(now + TRIAL_DAYS * 86_400)
    };
    state.legacy = false;
    state.registry_synced = false;

    persist_and_refresh_gate(db, &state)?;
    let (updated, synced) = try_sync_and_apply(app, &state, "trial_start", None, now);
    if synced {
        persist_and_refresh_gate(db, &updated)?;
    } else {
        spawn_registry_sync(app.clone(), state, "trial_start".to_string(), None);
    }
    get_status(db)
}

pub fn activate_license(
    app: &tauri::AppHandle,
    db: &Database,
    license_key: String,
    client_email: String,
    client_name: Option<String>,
    cabinet: Option<String>,
    installed_at: Option<i64>,
) -> Result<state::LicenseStatusView, String> {
    let secret = signing_secret().ok_or(
        "Activation par clé indisponible : secret de signature non configuré à la compilation."
            .to_string(),
    )?;
    let validated = validate_license_key(&license_key, secret)?;
    let now = now_ts();
    if let Some(exp) = validated.expires_at {
        if now > exp {
            return Err("Cette clé de licence est expirée.".to_string());
        }
    }
    let email = normalize_email(&client_email)?;
    let installed_at = installed_at.unwrap_or(now);

    let mut state = load_state(db)?.unwrap_or(LicenseState {
        installation_id: new_installation_id(),
        status: LicenseStatus::Active,
        license_type: None,
        license_key_masked: None,
        client_email: None,
        client_name: None,
        cabinet: None,
        activated_at: now,
        expires_at: None,
        installed_at,
        legacy: false,
        registry_synced: false,
        last_heartbeat_at: None,
        trial_restart_count: 0,
        state_integrity: None,
    });

    state.client_email = Some(email);
    state.client_name = client_name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    state.cabinet = cabinet.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    state.status = LicenseStatus::Active;
    state.license_type = Some(validated.license_type);
    state.license_key_masked = Some(mask_license_key(&license_key));
    state.activated_at = now;
    state.expires_at = validated.expires_at;
    state.legacy = false;
    state.registry_synced = false;

    persist_and_refresh_gate(db, &state)?;
    let key_trimmed = license_key.trim().to_string();
    let (updated, synced) =
        try_sync_and_apply(app, &state, "activate", Some(&key_trimmed), now);
    if synced {
        persist_and_refresh_gate(db, &updated)?;
    } else {
        spawn_registry_sync(app.clone(), state, "activate".to_string(), Some(key_trimmed));
    }
    get_status(db)
}

/// État de licence minimal pour les tests SQLite en mémoire (autorise les écritures).
#[cfg(test)]
pub(crate) fn seed_in_memory_test_license(db: &Database) {
    let now = now_ts();
    let mut state = LicenseState {
        installation_id: "00000000-0000-4000-8000-000000000001".to_string(),
        status: LicenseStatus::Trial,
        license_type: Some("trial".to_string()),
        license_key_masked: None,
        client_email: Some("test@example.com".to_string()),
        client_name: Some("Test CRM".to_string()),
        cabinet: None,
        activated_at: now,
        expires_at: None,
        installed_at: now,
        legacy: false,
        registry_synced: false,
        last_heartbeat_at: None,
        trial_restart_count: 0,
        state_integrity: None,
    };
    attach_state_integrity(&mut state);
    bypass_authorizer(|| {
        if let Ok(json) = serde_json::to_string(&state) {
            let _ = db.set_setting(LICENSE_STATE_KEY, &json);
        }
    });
    refresh_write_gate(db);
}
