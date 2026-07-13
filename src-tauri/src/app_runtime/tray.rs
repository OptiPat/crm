use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindow,
};

use super::prefs::{load_runtime_prefs, save_runtime_prefs, AppRuntimePrefs};
use super::shutdown::request_force_quit;

const MENU_OPEN_ID: &str = "tray-open";
const MENU_QUIT_ID: &str = "tray-quit";

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open_i = MenuItem::with_id(app, MENU_OPEN_ID, "Ouvrir CRM W.Y.S", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, MENU_QUIT_ID, "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

    let icon = app
        .default_window_icon()
        .ok_or("Icône tray introuvable")?
        .clone();

    let app_handle = app.clone();
    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("CRM W.Y.S")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            MENU_OPEN_ID => focus_main_window(app),
            MENU_QUIT_ID => quit_app_fully(app),
            _ => {}
        })
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    if let Some(window) = app_handle.get_webview_window("main") {
        attach_close_to_tray_handler(&app_handle, window);
    }

    Ok(())
}

pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn quit_app_fully(app: &AppHandle) {
    request_force_quit();
    app.exit(0);
}

fn attach_close_to_tray_handler(app: &AppHandle, window: WebviewWindow) {
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let prefs = load_runtime_prefs(&app_handle);
            if prefs.close_to_tray {
                api.prevent_close();
                if let Some(w) = app_handle.get_webview_window("main") {
                    let _ = w.hide();
                }
            } else {
                quit_app_fully(&app_handle);
            }
        }
    });
}

pub fn apply_startup_launch_prefs(app: &AppHandle) -> Result<(), String> {
    super::prefs::cleanup_dev_autostart_entry(app);
    if super::prefs::is_dev_executable() {
        return Ok(());
    }
    let prefs = load_runtime_prefs(app);
    sync_autostart_from_prefs(app, &prefs)
}

pub fn sync_autostart_from_prefs(app: &AppHandle, prefs: &AppRuntimePrefs) -> Result<(), String> {
    super::prefs::sync_autostart(app, prefs.launch_at_startup)
}

pub fn hide_main_window_if_minimized_arg(app: &AppHandle) {
    if !std::env::args().any(|a| a == "--minimized") {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn save_prefs_and_sync(app: &AppHandle, prefs: AppRuntimePrefs) -> Result<(), String> {
    save_runtime_prefs(app, &prefs)?;
    sync_autostart_from_prefs(app, &prefs)
}
