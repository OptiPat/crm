use super::state::LicenseState;
use super::state::LicenseStatus;
use super::sync_registry_event;

pub fn initial_registry_event(state: &LicenseState) -> &'static str {
    match state.status {
        LicenseStatus::Trial => "trial_start",
        LicenseStatus::Active => "activate",
        LicenseStatus::Legacy => "register_existing",
        LicenseStatus::Expired => "heartbeat",
    }
}

pub fn apply_registry_sync_result(state: &mut LicenseState, synced: bool, now: i64) {
    if synced {
        state.registry_synced = true;
        state.last_heartbeat_at = Some(now);
    }
}

pub fn try_sync_and_apply(
    app: &tauri::AppHandle,
    state: &LicenseState,
    event: &str,
    license_key: Option<&str>,
    now: i64,
) -> (LicenseState, bool) {
    let synced = sync_registry_event(app, state, event, license_key);
    let mut updated = state.clone();
    apply_registry_sync_result(&mut updated, synced, now);
    (updated, synced)
}
