//! Application du branding sur l'OS : icône fenêtre / barre des tâches, raccourcis Windows.

use super::AppBrandingManager;
use image::{Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
#[cfg(windows)]
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

const BRANDING_ICO_FILENAME: &str = "branding-window.ico";
const OS_STATE_FILENAME: &str = "branding-os-state.json";
/// Limite de decodage — evite OOM / freeze sur logos tres lourds (ex. PNG 4000+ px).
const MAX_SOURCE_PX: u32 = 512;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsBrandingResult {
    pub window_icon_applied: bool,
    pub shortcuts_updated: u32,
    pub skipped_unchanged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OsBrandingState {
    display_name: String,
    logo_fingerprint: Option<String>,
}

pub fn apply_os_branding(app: &AppHandle) -> Result<OsBrandingResult, String> {
    let manager = AppBrandingManager::new(app)?;
    let config = manager.load();
    let display_name = manager.effective_display_name(&config);

    if let Some(window) = app.get_webview_window("main") {
        window
            .set_title(&display_name)
            .map_err(|e| format!("Impossible de définir le titre : {e}"))?;
    }

    let icons_dir = manager.app_data_dir.join("icons");
    fs::create_dir_all(&icons_dir)
        .map_err(|e| format!("Impossible de créer le dossier icons : {e}"))?;
    let ico_path = icons_dir.join(BRANDING_ICO_FILENAME);
    let state_path = manager.app_data_dir.join(OS_STATE_FILENAME);

    let logo_source = manager.resolve_logo_path(&config);
    let logo_fingerprint = logo_source
        .as_ref()
        .and_then(|p| file_fingerprint(p.as_path()));

    let desired_state = OsBrandingState {
        display_name: display_name.clone(),
        logo_fingerprint: logo_fingerprint.clone(),
    };

    if is_os_state_unchanged(&state_path, &ico_path, &desired_state, logo_source.is_some()) {
        let window_icon_applied = apply_icon_from_cache(app, logo_source.is_some(), &ico_path)?;
        return Ok(OsBrandingResult {
            window_icon_applied,
            shortcuts_updated: 0,
            skipped_unchanged: true,
        });
    }

    let window_icon_applied = if let Some(source) = logo_source.as_ref() {
        let rgba = decode_and_downscale(source, MAX_SOURCE_PX)?;
        write_ico_from_rgba(&rgba, &ico_path)?;
        set_main_window_icon_from_rgba(app, &rgba)?
    } else {
        let _ = fs::remove_file(&ico_path);
        reset_main_window_icon(app)?
    };

    #[cfg(windows)]
    let shortcuts_updated =
        update_windows_shortcuts(app, logo_source.as_deref(), &ico_path)?;

    #[cfg(not(windows))]
    let shortcuts_updated = 0;

    save_os_state(&state_path, &desired_state)?;

    Ok(OsBrandingResult {
        window_icon_applied,
        shortcuts_updated,
        skipped_unchanged: false,
    })
}

fn file_fingerprint(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    Some(format!("{}:{}:{modified}", path.display(), meta.len()))
}

fn is_os_state_unchanged(
    state_path: &Path,
    ico_path: &Path,
    desired: &OsBrandingState,
    has_logo: bool,
) -> bool {
    if !state_path.is_file() {
        return false;
    }
    if has_logo && !ico_path.is_file() {
        return false;
    }
    let raw = match fs::read_to_string(state_path) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let stored: OsBrandingState = match serde_json::from_str(&raw) {
        Ok(s) => s,
        Err(_) => return false,
    };
    stored.display_name == desired.display_name
        && stored.logo_fingerprint == desired.logo_fingerprint
}

fn save_os_state(path: &Path, state: &OsBrandingState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Sérialisation état OS : {e}"))?;
    fs::write(path, json).map_err(|e| format!("Écriture état OS : {e}"))
}

fn apply_icon_from_cache(
    app: &AppHandle,
    has_logo: bool,
    ico_path: &Path,
) -> Result<bool, String> {
    if has_logo && ico_path.is_file() {
        set_main_window_icon_from_ico(app, ico_path)
    } else {
        reset_main_window_icon(app)
    }
}

fn decode_and_downscale(source: &Path, max_px: u32) -> Result<RgbaImage, String> {
    let img = image::ImageReader::open(source)
        .map_err(|e| format!("Impossible d'ouvrir l'image : {e}"))?
        .decode()
        .map_err(|e| format!("Image invalide : {e}"))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    if w <= max_px && h <= max_px {
        return Ok(rgba);
    }
    let scale = max_px as f32 / w.max(h) as f32;
    let nw = ((w as f32 * scale).round() as u32).max(1);
    let nh = ((h as f32 * scale).round() as u32).max(1);
    Ok(image::imageops::resize(
        &rgba,
        nw,
        nh,
        image::imageops::FilterType::Triangle,
    ))
}

fn set_main_window_icon_from_rgba(app: &AppHandle, rgba: &RgbaImage) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Fenêtre principale introuvable")?;
    let icon = rgba_to_window_icon(rgba, 32)?;
    window
        .set_icon(icon)
        .map_err(|e| format!("Impossible d'appliquer l'icône : {e}"))?;
    Ok(true)
}

fn set_main_window_icon_from_ico(app: &AppHandle, ico_path: &Path) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Fenêtre principale introuvable")?;
    let icon = load_tauri_icon_from_ico(ico_path)?;
    window
        .set_icon(icon)
        .map_err(|e| format!("Impossible d'appliquer l'icône : {e}"))?;
    Ok(true)
}

fn load_tauri_icon_from_ico(ico_path: &Path) -> Result<tauri::image::Image<'static>, String> {
    use ico::IconDir;
    use std::io::BufReader;

    let file = fs::File::open(ico_path)
        .map_err(|e| format!("Ouverture ICO : {e}"))?;
    let dir = IconDir::read(&mut BufReader::new(file))
        .map_err(|e| format!("Lecture ICO : {e}"))?;
    let entry = dir
        .entries()
        .iter()
        .max_by_key(|e| e.width())
        .ok_or("ICO vide")?;
    let img = entry
        .decode()
        .map_err(|e| format!("Décodage ICO : {e}"))?;
    Ok(tauri::image::Image::new_owned(
        img.rgba_data().to_vec(),
        img.width(),
        img.height(),
    ))
}

fn rgba_to_window_icon(
    rgba: &RgbaImage,
    size: u32,
) -> Result<tauri::image::Image<'static>, String> {
    let square = letterbox_rgba_to_square(rgba, size);
    Ok(tauri::image::Image::new_owned(
        square.into_raw(),
        size,
        size,
    ))
}

const ICON_LETTERBOX_BG: Rgba<u8> = Rgba([255, 255, 255, 255]);

/// Contient le logo dans un carre (comme object-contain) — evite l'ecrasement barre des taches.
fn letterbox_rgba_to_square(rgba: &RgbaImage, size: u32) -> RgbaImage {
    let (w, h) = rgba.dimensions();
    if w == 0 || h == 0 {
        return RgbaImage::from_pixel(size, size, ICON_LETTERBOX_BG);
    }
    let scale = (size as f32 / w as f32).min(size as f32 / h as f32);
    let nw = ((w as f32 * scale).round() as u32).clamp(1, size);
    let nh = ((h as f32 * scale).round() as u32).clamp(1, size);
    let fitted = image::imageops::resize(
        rgba,
        nw,
        nh,
        image::imageops::FilterType::Triangle,
    );
    let mut canvas = RgbaImage::from_pixel(size, size, ICON_LETTERBOX_BG);
    let x = (size - nw) / 2;
    let y = (size - nh) / 2;
    image::imageops::overlay(&mut canvas, &fitted, i64::from(x), i64::from(y));
    canvas
}

fn reset_main_window_icon(app: &AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Fenêtre principale introuvable")?;
    let icon = app
        .default_window_icon()
        .ok_or("Icône par défaut indisponible")?
        .clone();
    window
        .set_icon(icon)
        .map_err(|e| format!("Impossible de restaurer l'icône : {e}"))?;
    Ok(true)
}

fn write_ico_from_rgba(rgba: &RgbaImage, dest: &Path) -> Result<(), String> {
    use ico::{IconDir, IconDirEntry, IconImage};

    let mut dir = IconDir::new(ico::ResourceType::Icon);
    for size in [16u32, 32, 48, 256] {
        let square = letterbox_rgba_to_square(rgba, size);
        let entry = IconDirEntry::encode(&IconImage::from_rgba_data(
            size,
            size,
            square.into_raw(),
        ))
        .map_err(|e| format!("Encodage ICO {size}px : {e}"))?;
        dir.add_entry(entry);
    }

    let mut file =
        fs::File::create(dest).map_err(|e| format!("Impossible de créer l'ICO : {e}"))?;
    dir.write(&mut file)
        .map_err(|e| format!("Écriture ICO : {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn update_windows_shortcuts(
    app: &AppHandle,
    logo_source: Option<&Path>,
    generated_ico: &Path,
) -> Result<u32, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let product_name = app
        .config()
        .product_name
        .as_deref()
        .unwrap_or(super::DEFAULT_DISPLAY_NAME);
    let exe_path = std::env::current_exe().map_err(|e| format!("Exe introuvable : {e}"))?;

    let icon_location = if logo_source.is_some() && generated_ico.is_file() {
        generated_ico.to_string_lossy().into_owned()
    } else {
        format!("{},0", exe_path.to_string_lossy())
    };

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        candidates.push(PathBuf::from(&userprofile).join("Desktop"));
    }
    if let Ok(public) = std::env::var("PUBLIC") {
        candidates.push(PathBuf::from(&public).join("Desktop"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        candidates.push(
            PathBuf::from(&appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }

    let mut updated = 0u32;
    for dir in candidates {
        let lnk = dir.join(format!("{product_name}.lnk"));
        if !lnk.is_file() {
            continue;
        }
        let lnk_str = lnk.to_string_lossy().replace('\'', "''");
        let icon_str = icon_location.replace('\'', "''");
        let script = format!(
            "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{lnk_str}'); \
             $s.IconLocation = '{icon_str}'; $s.Save()"
        );
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("PowerShell raccourci : {e}"))?;
        if status.success() {
            updated += 1;
        } else {
            eprintln!("⚠️ Échec mise à jour raccourci : {}", lnk.display());
        }
    }

    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    #[test]
    fn write_ico_from_rgba_produces_file() {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("crm_ico_test_{n}"));
        fs::create_dir_all(&dir).unwrap();

        let rgba = image::RgbaImage::from_pixel(64, 64, image::Rgba([255, 0, 0, 255]));
        let ico = dir.join("out.ico");
        write_ico_from_rgba(&rgba, &ico).unwrap();
        assert!(ico.is_file());
        assert!(fs::metadata(&ico).unwrap().len() > 0);
    }

    #[test]
    fn downscale_limits_huge_dimensions() {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("crm_downscale_test_{n}"));
        fs::create_dir_all(&dir).unwrap();

        let png = dir.join("big.png");
        let img = image::RgbaImage::from_pixel(2000, 1500, image::Rgba([0, 128, 255, 255]));
        img.save(&png).unwrap();

        let out = decode_and_downscale(&png, MAX_SOURCE_PX).unwrap();
        assert!(out.width() <= MAX_SOURCE_PX);
        assert!(out.height() <= MAX_SOURCE_PX);
    }

    #[test]
    fn letterbox_preserves_wide_aspect_ratio() {
        let wide = image::RgbaImage::from_fn(200, 80, |_, _| image::Rgba([0, 0, 255, 255]));
        let square = letterbox_rgba_to_square(&wide, 32);
        assert_eq!(square.dimensions(), (32, 32));
        assert_eq!(square.get_pixel(16, 0)[0], 255);
        assert_eq!(square.get_pixel(16, 31)[0], 255);
        assert_eq!(square.get_pixel(16, 16)[2], 255);
    }
}
