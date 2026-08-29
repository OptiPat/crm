use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow,
};

use super::prefs::{load_runtime_prefs, save_runtime_prefs, AppRuntimePrefs};
use super::shutdown::request_force_quit;

const MENU_OPEN_ID: &str = "tray-open";
const MENU_QUIT_ID: &str = "tray-quit";
pub const TRAY_ID: &str = "main";

/// Émis côté frontend quand la fenêtre principale passe en arrière-plan (tray / --minimized).
pub const MAIN_WINDOW_BACKGROUND_EVENT: &str = "main-window-background";

fn emit_main_window_background(app: &AppHandle) {
    let _ = app.emit(MAIN_WINDOW_BACKGROUND_EVENT, ());
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open_i = MenuItem::with_id(app, MENU_OPEN_ID, "Ouvrir CRM W.Y.S", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, MENU_QUIT_ID, "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

    let icon = app
        .default_window_icon()
        .ok_or("Icône tray introuvable")?
        .clone();

    let app_handle = app.clone();
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("CRM W.Y.S")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            MENU_OPEN_ID => focus_main_window(app),
            MENU_QUIT_ID => {
                if let Err(error) = quit_app_fully(app) {
                    eprintln!("⚠️ Fermeture sécurisée refusée : {error}");
                }
            }
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

fn tray_open_label(display_name: &str) -> String {
    format!("Ouvrir {}", display_name.replace('&', "&&"))
}

/// Met à jour l'icône, l'infobulle et le libellé « Ouvrir » du tiroir.
pub fn apply_tray_branding(
    app: &AppHandle,
    display_name: &str,
    icon: tauri::image::Image<'static>,
) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    tray.set_icon(Some(icon))
        .map_err(|e| format!("Icône tiroir : {e}"))?;
    tray.set_tooltip(Some(display_name))
        .map_err(|e| format!("Infobulle tiroir : {e}"))?;

    match build_tray_menu(app, display_name) {
        Ok(menu) => {
            if let Err(e) = tray.set_menu(Some(menu)) {
                eprintln!("⚠️ Menu tiroir : {e}");
            }
        }
        Err(e) => eprintln!("⚠️ Menu tiroir : {e}"),
    }
    Ok(())
}

fn build_tray_menu(
    app: &AppHandle,
    display_name: &str,
) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let open_i = MenuItem::with_id(
        app,
        MENU_OPEN_ID,
        tray_open_label(display_name),
        true,
        None::<&str>,
    )?;
    let quit_i = MenuItem::with_id(app, MENU_QUIT_ID, "Quitter", true, None::<&str>)?;
    Ok(Menu::with_items(app, &[&open_i, &quit_i])?)
}

pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn quit_app_fully(app: &AppHandle) -> Result<(), String> {
    crate::auth::commands::close_database(app, app.state::<crate::commands::DbState>().inner())?;
    request_force_quit();
    app.exit(0);
    Ok(())
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
                    emit_main_window_background(&app_handle);
                }
            } else {
                if let Err(error) = quit_app_fully(&app_handle) {
                    eprintln!("⚠️ Fermeture sécurisée refusée : {error}");
                }
            }
        }
    });
}

pub fn apply_startup_launch_prefs(app: &AppHandle) -> Result<(), String> {
    if super::prefs::is_dev_executable() {
        super::prefs::cleanup_dev_autostart_entry(app);
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
        emit_main_window_background(app);
    }
}

pub fn save_prefs_and_sync(
    app: &AppHandle,
    mut prefs: AppRuntimePrefs,
) -> Result<AppRuntimePrefs, String> {
    prefs.normalize_intervals();
    if super::prefs::is_dev_executable() {
        prefs.launch_at_startup = false;
    }
    save_runtime_prefs(app, &prefs)?;
    if super::prefs::is_dev_executable() {
        super::prefs::cleanup_dev_autostart_entry(app);
        return Ok(prefs);
    }
    sync_autostart_from_prefs(app, &prefs)?;
    Ok(prefs)
}

#[cfg(test)]
mod tests {
    use super::tray_open_label;

    #[test]
    fn tray_open_label_escapes_ampersand_mnemonic() {
        assert_eq!(tray_open_label("CRM W.Y.S"), "Ouvrir CRM W.Y.S");
        assert_eq!(tray_open_label("A&B"), "Ouvrir A&&B");
    }
}
