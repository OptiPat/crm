use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use super::prefs::load_runtime_prefs;

const TICK_SECS: u64 = 180;

static WORKER_STARTED: AtomicBool = AtomicBool::new(false);

fn emit_tick_if_enabled(app: &AppHandle) {
    let prefs = load_runtime_prefs(app);
    if prefs.background_pipe_rdv_reminders {
        let _ = app.emit("pipe-rdv-reminder-tick", ());
    }
}

/// Émet `pipe-rdv-reminder-tick` toutes les 3 min (traitement email côté UI déverrouillée).
pub fn start_pipe_rdv_reminder_worker(app: AppHandle) {
    if WORKER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    thread::Builder::new()
        .name("pipe-rdv-reminder".into())
        .spawn(move || {
            emit_tick_if_enabled(&app);
            loop {
                thread::sleep(Duration::from_secs(TICK_SECS));
                emit_tick_if_enabled(&app);
            }
        })
        .ok();
}
