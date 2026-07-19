use crate::auth::session::{require_ui_session, UiSessionState};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_fs::FsExt;

const MAX_LOCAL_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
pub(crate) const MAX_DOCUMENT_BYTES: u64 = 100 * 1024 * 1024;
const DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "doc", "docx", "xls", "xlsx", "txt", "jpg", "jpeg", "png", "webp",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedDocumentFile {
    path: String,
    name: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalImageFile {
    bytes: Vec<u8>,
    mime: String,
}

pub(crate) fn require_scoped_file(
    app: &AppHandle,
    source_path: &str,
) -> Result<PathBuf, String> {
    let path = PathBuf::from(source_path.trim());
    if !path.is_file() {
        return Err("Fichier introuvable sur ce PC.".into());
    }
    if !app.fs_scope().is_allowed(&path) {
        return Err("Accès refusé : sélectionnez d'abord ce fichier depuis le CRM.".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Chemin de fichier invalide : {error}"))?;
    if !app.fs_scope().is_allowed(&canonical) {
        return Err("Accès refusé : la cible réelle du fichier est hors périmètre.".into());
    }
    Ok(canonical)
}

fn file_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
}

fn detect_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn read_validated_image(path: &Path) -> Result<LocalImageFile, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("Lecture image impossible : {error}"))?;
    if metadata.len() > MAX_LOCAL_IMAGE_BYTES {
        return Err("Image trop volumineuse (10 Mo maximum).".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("Lecture image impossible : {error}"))?;
    let mime = detect_image_mime(&bytes)
        .ok_or("Format image invalide ou contenu non reconnu.")?
        .to_string();
    Ok(LocalImageFile { bytes, mime })
}

pub(crate) fn ensure_file_size(path: &Path, maximum: u64) -> Result<u64, String> {
    let size = fs::metadata(path)
        .map_err(|error| format!("Métadonnées du fichier inaccessibles : {error}"))?
        .len();
    if size == 0 {
        return Err("Le fichier est vide.".into());
    }
    if size > maximum {
        return Err(format!(
            "Fichier trop volumineux ({} Mo maximum).",
            maximum / (1024 * 1024)
        ));
    }
    Ok(size)
}

fn logo_basename(kind: &str) -> Result<&'static str, String> {
    match kind {
        "app" => Ok("app-branding"),
        "cabinet" => Ok("cabinet-logo"),
        _ => Err("Type de logo non autorisé.".into()),
    }
}

pub(crate) fn validate_public_logo_path(
    app_data_dir: &Path,
    file_path: &str,
) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path.trim());
    if !path.is_file() {
        return Err("Logo introuvable.".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Chemin de logo invalide : {error}"))?;
    let logos_dir = app_data_dir
        .join("logos")
        .canonicalize()
        .map_err(|error| format!("Dossier logos inaccessible : {error}"))?;
    let file_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let allowed_name = ["app-branding", "cabinet-logo"].iter().any(|basename| {
        ["png", "jpg", "webp"]
            .iter()
            .any(|extension| file_name == format!("{basename}.{extension}"))
    });
    if canonical.parent() != Some(logos_dir.as_path()) || !allowed_name {
        return Err("Accès refusé : logo public non autorisé.".into());
    }
    Ok(canonical)
}

fn is_allowed_app_data_image(app_data_dir: &Path, file_path: &Path) -> bool {
    crate::documents_storage::is_managed_document_path(app_data_dir, file_path)
        || validate_public_logo_path(app_data_dir, &file_path.to_string_lossy()).is_ok()
}

#[tauri::command]
pub fn stage_document_file_cmd(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    source_path: String,
) -> Result<StagedDocumentFile, String> {
    require_ui_session(&session)?;
    let source = require_scoped_file(&app, &source_path)?;
    let extension = file_extension(&source).ok_or("Extension de document manquante.")?;
    if !DOCUMENT_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Type de document non autorisé.".into());
    }
    ensure_file_size(&source, MAX_DOCUMENT_BYTES)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document")
        .to_string();
    let (path, size) = crate::documents_storage::stage_document_file(&app_data_dir, &source)
        .map_err(|error| format!("Import du document impossible : {error}"))?;
    Ok(StagedDocumentFile {
        path: path.to_string_lossy().into_owned(),
        name,
        size,
    })
}

#[tauri::command]
pub fn import_managed_logo_file_cmd(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    source_path: String,
    kind: String,
) -> Result<String, String> {
    require_ui_session(&session)?;
    let source = require_scoped_file(&app, &source_path)?;
    let image = read_validated_image(&source)?;
    let basename = logo_basename(&kind)?;
    let extension = match image.mime.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => return Err("Format de logo non autorisé.".into()),
    };
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let logos_dir = app_data_dir.join("logos");
    fs::create_dir_all(&logos_dir)
        .map_err(|error| format!("Création du dossier logos impossible : {error}"))?;
    let destination = logos_dir.join(format!("{basename}.{extension}"));
    crate::atomic_file::write(&destination, image.bytes)
        .map_err(|error| format!("Enregistrement du logo impossible : {error}"))?;
    for old_extension in ["png", "jpg", "webp"] {
        if old_extension == extension {
            continue;
        }
        let old_path = logos_dir.join(format!("{basename}.{old_extension}"));
        if old_path.is_file() {
            fs::remove_file(&old_path)
                .map_err(|error| format!("Remplacement de l'ancien logo impossible : {error}"))?;
        }
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn remove_managed_logo_file_cmd(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    kind: String,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let basename = logo_basename(&kind)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let logos_dir = app_data_dir.join("logos");
    for extension in ["png", "jpg", "webp"] {
        let path = logos_dir.join(format!("{basename}.{extension}"));
        if path.is_file() {
            fs::remove_file(path)
                .map_err(|error| format!("Suppression du logo impossible : {error}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn read_local_image_file_cmd(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    file_path: String,
) -> Result<LocalImageFile, String> {
    require_ui_session(&session)?;
    let path = require_scoped_file(&app, &file_path)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let canonical_app_data = app_data_dir
        .canonicalize()
        .unwrap_or_else(|_| app_data_dir.clone());
    if path.starts_with(&canonical_app_data)
        && !is_allowed_app_data_image(&app_data_dir, &path)
    {
        return Err("Accès refusé : image AppData hors documents et logos gérés.".into());
    }
    read_validated_image(&path)
}

#[tauri::command]
pub fn read_public_branding_logo_file_cmd(
    app: AppHandle,
    file_path: String,
) -> Result<LocalImageFile, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let path = validate_public_logo_path(&app_data_dir, &file_path)?;
    read_validated_image(&path)
}

#[cfg(test)]
mod tests {
    use super::{
        detect_image_mime, ensure_file_size, file_extension, is_allowed_app_data_image,
        logo_basename, validate_public_logo_path, MAX_DOCUMENT_BYTES,
    };
    use std::fs;
    use std::path::Path;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir() -> std::path::PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "patrimoine_crm_secure_files_test_{}_{}",
            std::process::id(),
            n
        ))
    }

    #[test]
    fn recognizes_only_supported_image_signatures() {
        assert_eq!(detect_image_mime(b"\x89PNG\r\n\x1a\nrest"), Some("image/png"));
        assert_eq!(detect_image_mime(b"\xff\xd8\xffrest"), Some("image/jpeg"));
        assert_eq!(detect_image_mime(b"GIF89arest"), Some("image/gif"));
        assert_eq!(
            detect_image_mime(b"RIFFxxxxWEBPrest"),
            Some("image/webp")
        );
        assert_eq!(detect_image_mime(b"<script>alert(1)</script>"), None);
    }

    #[test]
    fn validates_logo_kind_and_normalizes_extensions() {
        assert!(logo_basename("app").is_ok());
        assert!(logo_basename("cabinet").is_ok());
        assert!(logo_basename("../auth.json").is_err());
        assert_eq!(file_extension(Path::new("TEST.PDF")).as_deref(), Some("pdf"));
    }

    #[test]
    fn public_logo_reader_accepts_only_fixed_branding_files() {
        let app_data = unique_temp_dir();
        let logos = app_data.join("logos");
        fs::create_dir_all(logos.join("nested")).unwrap();
        let allowed = logos.join("app-branding.png");
        let unrelated = logos.join("auth.png");
        let nested = logos.join("nested").join("cabinet-logo.png");
        fs::write(&allowed, b"image").unwrap();
        fs::write(&unrelated, b"image").unwrap();
        fs::write(&nested, b"image").unwrap();

        assert!(validate_public_logo_path(&app_data, &allowed.to_string_lossy()).is_ok());
        assert!(validate_public_logo_path(&app_data, &unrelated.to_string_lossy()).is_err());
        assert!(validate_public_logo_path(&app_data, &nested.to_string_lossy()).is_err());
        assert!(is_allowed_app_data_image(&app_data, &allowed));
        assert!(!is_allowed_app_data_image(&app_data, &unrelated));

        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn document_size_limit_rejects_empty_and_oversized_files() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("document.pdf");
        let file = fs::File::create(&path).unwrap();
        assert!(ensure_file_size(&path, MAX_DOCUMENT_BYTES).is_err());
        file.set_len(MAX_DOCUMENT_BYTES + 1).unwrap();
        assert!(ensure_file_size(&path, MAX_DOCUMENT_BYTES).is_err());
        file.set_len(1).unwrap();
        assert_eq!(ensure_file_size(&path, MAX_DOCUMENT_BYTES).unwrap(), 1);
        drop(file);
        let _ = fs::remove_dir_all(dir);
    }
}
