//! Toast Windows avec activation (clic sur le corps) + nav persistée pour reprise après verrouillage.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

pub const AUTOMATION_NOTIFICATION_ACTIVATED_EVENT: &str = "automation-notification-activated";
const PENDING_FILE: &str = "pending_automation_notification.json";
const PENDING_MAX_AGE_MS: u64 = 24 * 60 * 60 * 1000;

#[derive(Clone, Serialize, Deserialize)]
struct PendingAutomationNotification {
    nav: String,
    sent_at_ms: u64,
    activated: bool,
}

#[derive(Clone, Serialize)]
struct AutomationToastActivatedPayload {
    nav: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn pending_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join(PENDING_FILE))
        .map_err(|e| e.to_string())
}

fn write_pending(app: &AppHandle, nav: &str, activated: bool) -> Result<(), String> {
    let payload = PendingAutomationNotification {
        nav: nav.to_string(),
        sent_at_ms: now_ms(),
        activated,
    };
    let path = pending_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(
        &path,
        serde_json::to_string(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn read_pending(app: &AppHandle) -> Result<Option<PendingAutomationNotification>, String> {
    let path = pending_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string()).map(Some)
}

fn clear_pending(app: &AppHandle) -> Result<(), String> {
    let path = pending_path(app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(windows)]
fn toast_app_id(app: &AppHandle) -> String {
    let identifier = app.config().identifier.clone();
    if let Ok(exe) = tauri::utils::platform::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let curr_dir = exe_dir.display().to_string();
            let sep = std::path::MAIN_SEPARATOR;
            let debug_suffix = format!("{sep}target{sep}debug");
            let release_suffix = format!("{sep}target{sep}release");
            if curr_dir.ends_with(&debug_suffix) || curr_dir.ends_with(&release_suffix) {
                return tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string();
            }
        }
    }
    identifier
}

#[cfg(windows)]
pub fn send_automation_desktop_toast(
    app: AppHandle,
    title: String,
    body: String,
    nav_json: String,
) -> Result<(), String> {
    use tauri_winrt_notification::{Duration, Toast};

    write_pending(&app, &nav_json, false)?;

    let app_for_callback = app.clone();
    let nav_for_callback = nav_json.clone();

    // Pas de add_button : tauri-winrt-notification 0.8.0 n'attache pas les actions au XML.
    // Le clic sur le corps déclenche on_activated.
    let toast = Toast::new(&toast_app_id(&app))
        .title(&title)
        .text1(&body.replace('\n', "\r\n"))
        .duration(Duration::Long)
        .on_activated(move |_action| {
            let _ = write_pending(&app_for_callback, &nav_for_callback, true);
            let _ = app_for_callback.emit(
                AUTOMATION_NOTIFICATION_ACTIVATED_EVENT,
                AutomationToastActivatedPayload {
                    nav: nav_for_callback.clone(),
                },
            );
            focus_main_window(&app_for_callback);
            Ok(())
        });

    toast
        .show()
        .map_err(|e| format!("Toast Windows : {e}"))
}

#[cfg(not(windows))]
pub fn send_automation_desktop_toast(
    _app: AppHandle,
    _title: String,
    _body: String,
    _nav_json: String,
) -> Result<(), String> {
    Err("Toast interactif réservé à Windows".into())
}

#[tauri::command]
pub fn send_automation_desktop_toast_cmd(
    app: AppHandle,
    title: String,
    body: String,
    nav_json: String,
) -> Result<(), String> {
    send_automation_desktop_toast(app, title, body, nav_json)
}

/// Nav en attente après clic toast (fichier app_data, survit au verrouillage).
#[tauri::command]
pub fn take_pending_automation_notification_nav_cmd(
    app: AppHandle,
) -> Result<Option<String>, String> {
    let pending = read_pending(&app)?;
    let Some(p) = pending else {
        return Ok(None);
    };
    if !p.activated {
        return Ok(None);
    }
    if now_ms().saturating_sub(p.sent_at_ms) > PENDING_MAX_AGE_MS {
        clear_pending(&app)?;
        return Ok(None);
    }
    clear_pending(&app)?;
    Ok(Some(p.nav))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_payload_roundtrip_json() {
        let payload = PendingAutomationNotification {
            nav: r#"{"page":"agenda"}"#.to_string(),
            sent_at_ms: 1_700_000_000_000,
            activated: true,
        };
        let json = serde_json::to_string(&payload).unwrap();
        let back: PendingAutomationNotification = serde_json::from_str(&json).unwrap();
        assert!(back.activated);
        assert_eq!(back.nav, r#"{"page":"agenda"}"#);
    }
}
