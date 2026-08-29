use super::{normalize_config, os, AppBrandingConfig, AppBrandingManager, LogoMode};
use super::os::OsBrandingResult;
use crate::auth::session::{require_ui_session, UiSessionState};
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBrandingResponse {
    pub display_name: String,
    pub logo_mode: LogoMode,
    /// Chemin absolu du logo sur disque ; absent = logo embarque par defaut.
    pub logo_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcuts_updated: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_error: Option<String>,
}

#[tauri::command]
pub fn get_app_branding(app: AppHandle) -> Result<AppBrandingResponse, String> {
    let manager = AppBrandingManager::new(&app)?;
    let config = manager.load();
    let logo_path = manager
        .resolve_logo_path(&config)
        .map(|p| p.to_string_lossy().into_owned());

    Ok(AppBrandingResponse {
        display_name: manager.effective_display_name(&config),
        logo_mode: config.logo_mode,
        logo_path,
        shortcuts_updated: None,
        os_error: None,
    })
}

#[tauri::command]
pub fn save_app_branding(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    display_name: String,
    logo_mode: LogoMode,
    logo_path: Option<String>,
) -> Result<AppBrandingResponse, String> {
    require_ui_session(&session)?;
    let manager = AppBrandingManager::new(&app)?;
    let config = normalize_config(&AppBrandingConfig {
        display_name,
        logo_mode,
        logo_path,
    });

    if config.logo_mode == LogoMode::Custom {
        let path = config.logo_path.as_deref().unwrap_or("");
        if crate::secure_files::validate_public_logo_path(&manager.app_data_dir, path).is_err() {
            return Err("Logo personnalisé introuvable — choisissez une image.".to_string());
        }
    }

    manager.save(&config)?;
    manager.clear_os_branding_cache();
    let os_result = os::apply_os_branding(&app);

    let logo_path = manager
        .resolve_logo_path(&config)
        .map(|p| p.to_string_lossy().into_owned());

    match os_result {
        Ok(os) => Ok(AppBrandingResponse {
            display_name: manager.effective_display_name(&config),
            logo_mode: config.logo_mode,
            logo_path,
            shortcuts_updated: Some(os.shortcuts_updated),
            os_error: None,
        }),
        Err(e) => {
            eprintln!("⚠️ branding OS après enregistrement : {e}");
            Ok(AppBrandingResponse {
                display_name: manager.effective_display_name(&config),
                logo_mode: config.logo_mode,
                logo_path,
                shortcuts_updated: Some(0),
                os_error: Some(e),
            })
        }
    }
}

#[tauri::command]
pub async fn apply_app_branding_os(app: AppHandle) -> Result<OsBrandingResult, String> {
    tauri::async_runtime::spawn_blocking(move || os::apply_os_branding(&app))
        .await
        .map_err(|e| format!("Tâche branding OS interrompue : {e}"))?
}
