use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use super::prefs::load_runtime_prefs;

const TICK_SECS: u64 = 180;
const BACKGROUND_AUTOMATION_TICK: &str = "background-automation-tick";

static WORKER_STARTED: AtomicBool = AtomicBool::new(false);

fn emit_tick_if_enabled(app: &AppHandle) {
    let prefs = load_runtime_prefs(app);
    if prefs.tray_tick_enabled() {
        let _ = app.emit(BACKGROUND_AUTOMATION_TICK, ());
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
            loop {
                thread::sleep(Duration::from_secs(TICK_SECS));
                emit_tick_if_enabled(&app);
            }
        })
        .ok();
}
