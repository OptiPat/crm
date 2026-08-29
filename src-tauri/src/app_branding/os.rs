//! Application du branding sur l'OS : icône fenêtre / barre des tâches, raccourcis Windows.

use super::AppBrandingManager;
use image::{Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

const OS_STATE_FILENAME: &str = "branding-os-state.json";
/// Incrémente si le scan des raccourcis change — force une réapplication chez les installs existantes.
const OS_BRANDING_LAYOUT: u32 = 3;
static APPLY_OS_BRANDING_LOCK: Mutex<()> = Mutex::new(());
/// Limite de decodage — evite OOM / freeze sur logos tres lourds (ex. PNG 4000+ px).
const MAX_SOURCE_PX: u32 = 512;

#[cfg(windows)]
const UPDATE_SHORTCUTS_PS1: &str = include_str!("update_windows_shortcuts.ps1");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsBrandingResult {
    pub window_icon_applied: bool,
    pub shortcuts_updated: u32,
    pub skipped_unchanged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct OsBrandingState {
    display_name: String,
    logo_fingerprint: Option<String>,
    #[serde(default)]
    layout_version: u32,
}

pub fn apply_os_branding(app: &AppHandle) -> Result<OsBrandingResult, String> {
    let _guard = APPLY_OS_BRANDING_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    apply_os_branding_locked(app)
}

fn apply_os_branding_locked(app: &AppHandle) -> Result<OsBrandingResult, String> {
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
    let state_path = manager.app_data_dir.join(OS_STATE_FILENAME);

    let logo_source = manager.resolve_logo_path(&config);
    let logo_fingerprint = logo_source
        .as_ref()
        .and_then(|p| file_fingerprint(p.as_path()));
    let ico_path = match logo_fingerprint.as_ref() {
        Some(fp) => icons_dir.join(branding_ico_filename(fp)),
        None => icons_dir.join("branding-window.ico"),
    };

    let desired_state = OsBrandingState {
        display_name: display_name.clone(),
        logo_fingerprint: logo_fingerprint.clone(),
        layout_version: OS_BRANDING_LAYOUT,
    };

    if is_os_state_unchanged(&state_path, &ico_path, &desired_state, logo_source.is_some()) {
        let window_icon_applied =
            apply_icon_from_cache(app, logo_source.is_some(), &ico_path, &display_name)?;
        return Ok(OsBrandingResult {
            window_icon_applied,
            shortcuts_updated: 0,
            skipped_unchanged: true,
        });
    }

    let window_icon_applied = if let Some(source) = logo_source.as_ref() {
        let rgba = decode_and_downscale(source, MAX_SOURCE_PX)?;
        write_ico_from_rgba(&rgba, &ico_path)?;
        set_main_window_icon_from_rgba(app, &rgba, &display_name)?
    } else {
        reset_main_window_icon(app, &display_name)?
    };

    #[cfg(windows)]
    let shortcuts_updated =
        match update_windows_shortcuts(app, logo_source.as_deref(), &ico_path, &display_name) {
            Ok(n) => n,
            Err(e) => {
                eprintln!("⚠️ branding OS raccourcis : {e}");
                return Err(e);
            }
        };

    #[cfg(not(windows))]
    let shortcuts_updated = 0;

    let keep_ico = logo_source.is_some().then_some(ico_path.as_path());
    cleanup_old_branding_icos(&icons_dir, keep_ico);
    save_os_state(&state_path, &desired_state)?;

    Ok(OsBrandingResult {
        window_icon_applied,
        shortcuts_updated,
        skipped_unchanged: false,
    })
}

fn strip_verbatim_prefix(path: &str) -> &str {
    path.strip_prefix(r"\\?\").unwrap_or(path)
}

fn branding_ico_filename(fingerprint: &str) -> String {
    let digest = Sha256::digest(fingerprint.as_bytes());
    let short: String = digest.iter().take(8).map(|b| format!("{b:02x}")).collect();
    format!("branding-window-{short}.ico")
}

fn sanitize_shortcut_stem(name: &str, fallback: &str) -> String {
    let mapped: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let trimmed = mapped.trim().trim_end_matches('.').trim();
    let stem: String = trimmed.chars().take(80).collect();
    if stem.is_empty() {
        fallback.to_string()
    } else {
        stem
    }
}

fn cleanup_old_branding_icos(icons_dir: &Path, keep: Option<&Path>) {
    let Ok(entries) = fs::read_dir(icons_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.starts_with("branding-window") || !name.ends_with(".ico") {
            continue;
        }
        if keep.is_some_and(|kept| kept == path.as_path()) {
            continue;
        }
        let _ = fs::remove_file(path);
    }
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
        && stored.layout_version == OS_BRANDING_LAYOUT
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
    display_name: &str,
) -> Result<bool, String> {
    let icon = if has_logo && ico_path.is_file() {
        load_tauri_icon_from_ico(ico_path)?
    } else {
        app.default_window_icon()
            .ok_or("Icône par défaut indisponible")?
            .clone()
            .to_owned()
    };
    apply_window_and_tray_icon(app, display_name, icon)
}

fn apply_window_and_tray_icon(
    app: &AppHandle,
    display_name: &str,
    icon: tauri::image::Image<'static>,
) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_icon(icon.clone())
            .map_err(|e| format!("Impossible d'appliquer l'icône : {e}"))?;
    }
    crate::app_runtime::apply_tray_branding(app, display_name, icon)?;
    Ok(true)
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

fn set_main_window_icon_from_rgba(
    app: &AppHandle,
    rgba: &RgbaImage,
    display_name: &str,
) -> Result<bool, String> {
    let icon = rgba_to_window_icon(rgba, 32)?;
    apply_window_and_tray_icon(app, display_name, icon)
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

fn reset_main_window_icon(app: &AppHandle, display_name: &str) -> Result<bool, String> {
    let icon = app
        .default_window_icon()
        .ok_or("Icône par défaut indisponible")?
        .clone()
        .to_owned();
    apply_window_and_tray_icon(app, display_name, icon)
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
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutJob {
    exe_path: String,
    icon_location: String,
    display_stem: String,
    aumid: String,
}

#[cfg(windows)]
fn update_windows_shortcuts(
    app: &AppHandle,
    logo_source: Option<&Path>,
    generated_ico: &Path,
    display_name: &str,
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
    let exe_path = strip_verbatim_prefix(&exe_path.to_string_lossy()).to_string();
    let icons_dir = generated_ico
        .parent()
        .ok_or("Dossier icônes introuvable")?;

    let icon_location = if logo_source.is_some() && generated_ico.is_file() {
        format!("{},0", strip_verbatim_prefix(&generated_ico.to_string_lossy()))
    } else {
        format!("{exe_path},0")
    };

    let job = ShortcutJob {
        exe_path,
        icon_location,
        display_stem: sanitize_shortcut_stem(display_name, product_name),
        aumid: app.config().identifier.clone(),
    };
    let job_path = icons_dir.join("update-shortcuts-job.json");
    let script_path = icons_dir.join("update-windows-shortcuts.ps1");
    let job_json = serde_json::to_string(&job).map_err(|e| format!("Job raccourcis : {e}"))?;
    fs::write(&job_path, job_json).map_err(|e| format!("Écriture job raccourcis : {e}"))?;
    fs::write(&script_path, UPDATE_SHORTCUTS_PS1)
        .map_err(|e| format!("Écriture script raccourcis : {e}"))?;

    let powershell = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    let output = Command::new(if Path::new(powershell).is_file() {
        powershell
    } else {
        "powershell"
    })
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&script_path)
        .arg("-JobPath")
        .arg(&job_path)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("PowerShell raccourcis : {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        return Err(format!(
            "Impossible de mettre à jour les raccourcis Windows : {}",
            stderr.trim()
        ));
    }
    if !stderr.trim().is_empty() {
        eprintln!("⚠️ Raccourcis Windows : {stderr}");
    }

    let updated = stdout
        .lines()
        .rev()
        .find_map(|line| line.trim().parse::<u32>().ok())
        .unwrap_or(0);
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

    #[test]
    fn sanitize_shortcut_stem_replaces_invalid_chars() {
        assert_eq!(sanitize_shortcut_stem("Mon CRM", "CRM W.Y.S"), "Mon CRM");
        assert_eq!(sanitize_shortcut_stem("A:B", "x"), "A-B");
        assert_eq!(sanitize_shortcut_stem("  ...  ", "CRM W.Y.S"), "CRM W.Y.S");
        assert_eq!(sanitize_shortcut_stem("CRM W.Y.S", "x"), "CRM W.Y.S");
    }

    #[test]
    fn branding_ico_filename_is_stable_and_changes_with_fingerprint() {
        let a = branding_ico_filename("path:10:1");
        let b = branding_ico_filename("path:10:1");
        assert_eq!(a, b);
        assert!(a.starts_with("branding-window-"));
        assert!(a.ends_with(".ico"));
        assert_ne!(a, branding_ico_filename("path:10:2"));
    }

    #[test]
    fn old_os_state_without_layout_is_stale() {
        let stored: OsBrandingState =
            serde_json::from_str(r#"{"display_name":"X","logo_fingerprint":null}"#).unwrap();
        assert_eq!(stored.layout_version, 0);
        assert_ne!(stored.layout_version, OS_BRANDING_LAYOUT);
    }

    #[test]
    fn strip_verbatim_prefix_drops_extended_path() {
        assert_eq!(
            strip_verbatim_prefix(r"\\?\C:\Program Files\CRM W.Y.S\patrimoine-crm.exe"),
            r"C:\Program Files\CRM W.Y.S\patrimoine-crm.exe"
        );
        assert_eq!(strip_verbatim_prefix(r"C:\app.exe"), r"C:\app.exe");
    }
}
