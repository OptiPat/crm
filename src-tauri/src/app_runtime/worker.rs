use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use tauri::{AppHandle, Emitter, Manager};

use crate::auth::session::{UiSessionState, UI_SESSION_LOCKED_EVENT};
use crate::commands::DbState;

use super::prefs::load_runtime_prefs;
use super::shutdown::automation_should_stop;

const TICK_SECS: u64 = 180;
const UI_LOCK_CHECK_SECS: u64 = 30;
const RESUME_GAP_SECS: u64 = 5;
const BACKGROUND_AUTOMATION_TICK: &str = "background-automation-tick";

static WORKER_STARTED: AtomicBool = AtomicBool::new(false);

/// Réveille la boucle JS du webview (limité throttling macOS / veille).
fn wake_main_webview(app: &AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval("void 0");
        }
    });
}

fn emit_tick_if_enabled(app: &AppHandle) {
    create_daily_backup_if_due(app);
    let prefs = load_runtime_prefs(app);
    if prefs.tray_tick_enabled() {
        wake_main_webview(app);
        let _ = app.emit(BACKGROUND_AUTOMATION_TICK, ());
    }
}

fn create_daily_backup_if_due(app: &AppHandle) {
    let db = app.state::<DbState>();
    let Ok(guard) = db.try_lock() else {
        return;
    };
    if guard.is_none() {
        return;
    }
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return;
    };
    let db_path = app_data_dir.join("patrimoine-crm.db");
    if let Err(error) = crate::backup::create_daily_backup_if_needed(&app_data_dir, &db_path) {
        eprintln!("⚠️ Sauvegarde quotidienne tray échouée : {error}");
    }
}

fn lock_ui_if_due(app: &AppHandle) {
    let prefs = load_runtime_prefs(app);
    if prefs.auto_lock_minutes == 0 {
        return;
    }
    let timeout = Duration::from_secs(u64::from(prefs.auto_lock_minutes) * 60);
    if app.state::<UiSessionState>().lock_if_idle(timeout) {
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
