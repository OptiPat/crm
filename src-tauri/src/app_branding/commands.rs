use super::{normalize_config, os, AppBrandingConfig, AppBrandingManager, LogoMode};
use super::os::OsBrandingResult;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBrandingResponse {
    pub display_name: String,
    pub logo_mode: LogoMode,
    /// Chemin absolu du logo sur disque ; absent = logo embarque par defaut.
    pub logo_path: Option<String>,
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
    })
}

#[tauri::command]
pub fn save_app_branding(
    app: AppHandle,
    display_name: String,
    logo_mode: LogoMode,
    logo_path: Option<String>,
) -> Result<AppBrandingResponse, String> {
    let manager = AppBrandingManager::new(&app)?;
    let config = normalize_config(&AppBrandingConfig {
        display_name,
        logo_mode,
        logo_path,
    });

    if config.logo_mode == LogoMode::Custom {
        let path = config.logo_path.as_deref().unwrap_or("");
        if path.is_empty() || !std::path::Path::new(path).is_file() {
            return Err("Logo personnalisé introuvable — choisissez une image.".to_string());
        }
    }

    manager.save(&config)?;
    manager.clear_os_branding_cache();

    let app_bg = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = tauri::async_runtime::spawn_blocking(move || os::apply_os_branding(&app_bg))
            .await
            .map_err(|e| format!("Tâche branding OS interrompue : {e}"))
            .and_then(|r| r)
        {
            eprintln!("⚠️ branding OS après enregistrement : {e}");
        }
    });

    let logo_path = manager
        .resolve_logo_path(&config)
        .map(|p| p.to_string_lossy().into_owned());

    Ok(AppBrandingResponse {
        display_name: manager.effective_display_name(&config),
        logo_mode: config.logo_mode,
        logo_path,
    })
}

#[tauri::command]
pub async fn apply_app_branding_os(app: AppHandle) -> Result<OsBrandingResult, String> {
    tauri::async_runtime::spawn_blocking(move || os::apply_os_branding(&app))
        .await
        .map_err(|e| format!("Tâche branding OS interrompue : {e}"))?
}
