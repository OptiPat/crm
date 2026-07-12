use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use super::prefs::load_runtime_prefs;
use super::shutdown::automation_should_stop;

const TICK_SECS: u64 = 180;
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
    let prefs = load_runtime_prefs(app);
    if prefs.tray_tick_enabled() {
        wake_main_webview(app);
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
                for _ in 0..TICK_SECS {
                    if automation_should_stop() {
                        return;
                    }
                    thread::sleep(Duration::from_secs(1));
                }
                if automation_should_stop() {
                    return;
                }
                emit_tick_if_enabled(&app);
            }
        })
        .ok();
}
