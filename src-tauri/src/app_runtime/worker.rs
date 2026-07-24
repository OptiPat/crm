use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use tauri::{AppHandle, Emitter, Manager};
use rand::RngCore;

use crate::auth::session::{UiSessionState, UI_SESSION_LOCKED_EVENT};
use crate::commands::DbState;

use super::prefs::load_runtime_prefs;
use super::shutdown::automation_should_stop;

const TICK_SECS: u64 = 180;
const UI_LOCK_CHECK_SECS: u64 = 30;
const RESUME_GAP_SECS: u64 = 5;
const BACKGROUND_AUTOMATION_TICK: &str = "background-automation-tick";

static WORKER_STARTED: AtomicBool = AtomicBool::new(false);
static AUTOMATION_INSTANCE_ID: OnceLock<String> = OnceLock::new();

/// Distingue deux postes/processus connectés avec le même compte Microsoft.
fn automation_instance_id() -> &'static str {
    AUTOMATION_INSTANCE_ID.get_or_init(|| {
        let mut value = [0_u8; 16];
        rand::thread_rng().fill_bytes(&mut value);
        value.iter().map(|byte| format!("{byte:02x}")).collect()
    })
}

/// Réveille la boucle JS du webview (limité throttling macOS / veille).
fn wake_main_webview(app: &AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval("void 0");
        }
    });
}

pub(super) fn automation_tick_allowed(app: &AppHandle) -> bool {
    let db = app.state::<DbState>();
    let config = {
        let Ok(guard) = db.try_lock() else {
            return false;
        };
        let Some(database) = guard.as_ref() else {
            return false;
        };
        match database.get_workspace_config() {
            Ok(config) => config,
            Err(error) => {
                eprintln!("⚠️ Lecture du workspace pour le bail d'automatisation : {error}");
                return false;
            }
        }
    };
    if !config.mode.is_team() {
        return true;
    }
    match crate::workspace::collaboration::team_acquire_lock_with_ttl_as(
        app,
        &config,
        "automation",
        "background-workers",
        420,
        Some(automation_instance_id()),
    ) {
        Ok(response) => response.acquired,
        Err(error) => {
            eprintln!("⚠️ Bail SharePoint des automatisations indisponible : {error}");
            false
        }
    }
}

fn emit_tick_if_enabled(app: &AppHandle) {
    create_daily_backup_if_due(app);
    let prefs = load_runtime_prefs(app);
    if !prefs.tray_tick_enabled() {
        return;
    }
    wake_main_webview(app);
    let _ = app.emit(BACKGROUND_AUTOMATION_TICK, ());
}

fn create_daily_backup_if_due(app: &AppHandle) {
    let db = app.state::<DbState>();
    if crate::workspace::require_export_permission_state(app, db.inner()).is_err() {
        return;
    }
    let guard = match db.try_lock() {
        Ok(guard) => guard,
        Err(std::sync::TryLockError::WouldBlock) => return,
        Err(std::sync::TryLockError::Poisoned(_)) => {
            eprintln!("⚠️ État de la base inaccessible pour la sauvegarde tray.");
            return;
        }
    };
    if guard.is_none() {
        return;
    }
    drop(guard);
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return;
    };
    let prefs = load_runtime_prefs(app);
    let _operation_guard = match crate::backup::lock_backup_operations() {
        Ok(guard) => guard,
        Err(error) => {
            if prefs.external_backup_directory.is_some() {
                crate::backup::record_external_backup_error(
                    &app_data_dir,
                    &error.to_string(),
                );
            }
            return;
        }
    };
    let db_path = match crate::workspace::cache::active_database_path(app) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("⚠️ Résolution de la base active pour sauvegarde tray : {error}");
            return;
        }
    };
    let source = match rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(source) => source,
        Err(error) => {
            if prefs.external_backup_directory.is_some() {
                crate::backup::record_external_backup_error(
                    &app_data_dir,
                    &error.to_string(),
                );
            }
            eprintln!("⚠️ Ouverture de la base pour sauvegarde tray : {error}");
            return;
        }
    };
    if let Err(error) =
        crate::backup::create_daily_backup_if_needed(&app_data_dir, &source)
    {
        eprintln!("⚠️ Sauvegarde quotidienne tray échouée : {error}");
    }
    if let Some(directory) = prefs.external_backup_directory {
        match crate::export_archive::export_automatic_archive_if_due(
            crate::export_archive::ExportArchiveInput {
                source_db: &source,
                app_data_dir: &app_data_dir,
                destination_dir: std::path::Path::new(&directory),
            },
            false,
        ) {
            Ok(Some(output)) => {
                crate::backup::record_external_backup_success(
                    &app_data_dir,
                    &output.zip_path,
                );
            }
            Ok(None) => {}
            Err(error) => {
                crate::backup::record_external_backup_error(&app_data_dir, &error);
                eprintln!("⚠️ Sauvegarde externe quotidienne échouée : {error}");
            }
        }
    }
}

fn lock_ui_if_due(app: &AppHandle) {
    let prefs = load_runtime_prefs(app);
    if prefs.auto_lock_minutes == 0 {
        return;
    }
    let timeout = Duration::from_secs(u64::from(prefs.auto_lock_minutes) * 60);
    if app.state::<UiSessionState>().lock_if_idle(timeout) {
        if let Err(error) =
            crate::auth::commands::close_database(app, app.state::<DbState>().inner())
        {
            eprintln!("⚠️ Scellement du cache au verrouillage automatique : {error}");
        }
        let _ = app.emit(UI_SESSION_LOCKED_EVENT, ());
    }
}

/// Émet `background-automation-tick` toutes les 3 min (orchestrateur côté UI).
pub fn start_background_automation_worker(app: AppHandle) {
    if WORKER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    thread::Builder::new()
        .name("background-automation".into())
        .spawn(move || {
            emit_tick_if_enabled(&app);
            let mut last_lock_check = Instant::now();
            let mut last_iteration = Instant::now();
            let mut last_wall_iteration = SystemTime::now();
            loop {
                for _ in 0..TICK_SECS {
                    if automation_should_stop() {
                        return;
                    }
                    thread::sleep(Duration::from_secs(1));
                    let now = Instant::now();
                    let wall_now = SystemTime::now();
                    let resumed = now.saturating_duration_since(last_iteration)
                        >= Duration::from_secs(RESUME_GAP_SECS)
                        || wall_now
                            .duration_since(last_wall_iteration)
                            .unwrap_or(Duration::ZERO)
                            >= Duration::from_secs(RESUME_GAP_SECS);
                    last_iteration = now;
                    last_wall_iteration = wall_now;
                    if resumed
                        || now.saturating_duration_since(last_lock_check)
                            >= Duration::from_secs(UI_LOCK_CHECK_SECS)
                    {
                        lock_ui_if_due(&app);
                        last_lock_check = now;
                    }
                }
                if automation_should_stop() {
                    return;
                }
                emit_tick_if_enabled(&app);
            }
        })
        .ok();
}
