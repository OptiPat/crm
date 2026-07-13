//! Pièces jointes des modèles email — stockage local sous AppData.

use std::fs;
use std::path::{Path, PathBuf};
use rand::Rng;

fn new_attachment_id() -> String {
    format!("{:016x}", rand::thread_rng().gen::<u64>())
}

pub const MAX_ATTACHMENT_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_ATTACHMENTS_PER_TEMPLATE: usize = 10;
pub const MAX_MICROSOFT_ATTACHMENT_BYTES: u64 = 4 * 1024 * 1024;
pub const TEMPLATE_ATTACHMENTS_KEY: &str = "attachments";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct TemplateEmailAttachmentRecord {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub stored_name: String,
}

pub fn attachments_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("email-template-attachments")
}

pub fn template_attachments_dir(app_data_dir: &Path, template_id: i64) -> PathBuf {
    attachments_root(app_data_dir).join(template_id.to_string())
}

fn normalize_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

pub fn is_managed_attachment_path(app_data_dir: &Path, file_path: &Path) -> bool {
    let root = normalize_path(&attachments_root(app_data_dir));
    let target = normalize_path(file_path);
    target.starts_with(&root)
}

pub fn guess_mime_type(filename: &str) -> &'static str {
    match Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => "application/pdf",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xls") => "application/vnd.ms-excel",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("ppt") => "application/vnd.ms-powerpoint",
        Some("pptx") => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("txt") => "text/plain",
        Some("csv") => "text/csv",
        Some("zip") => "application/zip",
        _ => "application/octet-stream",
    }
}

fn sanitize_stored_filename(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "attachment".to_string()
    } else {
        out
    }
}

pub fn sanitize_attachment_filename(filename: &str) -> Result<String, String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        return Err("Nom de pièce jointe invalide.".into());
    }
    if trimmed.chars().any(|c| c.is_control() || c == '\r' || c == '\n') {
        return Err("Nom de pièce jointe invalide.".into());
    }
    Ok(trimmed.replace('"', "_"))
}

pub fn sanitize_mime_type(mime_type: &str) -> Result<String, String> {
    let trimmed = mime_type.trim();
    if trimmed.is_empty() {
        return Ok("application/octet-stream".to_string());
    }
    if trimmed.chars().any(|c| c.is_control() || c == '\r' || c == '\n') {
        return Err("Type MIME invalide.".into());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | '+' | '-' | '_'))
    {
        return Err("Type MIME invalide.".into());
    }
    Ok(trimmed.to_string())
}

pub fn parse_attachments_from_variables(
    variables: Option<&str>,
) -> Vec<TemplateEmailAttachmentRecord> {
    let Some(raw) = variables.filter(|v| !v.trim().is_empty()) else {
        return vec![];
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return vec![];
    };
    let Some(items) = value.get(TEMPLATE_ATTACHMENTS_KEY).and_then(|v| v.as_array()) else {
        return vec![];
    };
    let mut out = Vec::new();
    for item in items {
        let Some(row) = item.as_object() else {
            continue;
        };
        let id = row.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let filename = row
            .get("filename")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let mime_type = row
            .get("mime_type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let stored_name = row
            .get("stored_name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let size_bytes = row
            .get("size_bytes")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if id.is_empty() || filename.is_empty() || stored_name.is_empty() {
            continue;
        }
        out.push(TemplateEmailAttachmentRecord {
            id,
            filename,
            mime_type,
            size_bytes,
            stored_name,
        });
    }
    out
}

pub fn is_blocked_import_source(source: &Path, app_data_dir: &Path) -> bool {
    let blocked_names = [
        "patrimoine-crm.db",
        "auth.json",
        "secrets.key",
        "email_oauth.json",
    ];
    if let Some(name) = source.file_name().and_then(|n| n.to_str()) {
        if blocked_names.contains(&name) {
            return true;
        }
    }
    let app_root = normalize_path(app_data_dir);
    let src = normalize_path(source);
    src.starts_with(&app_root)
}

pub fn import_template_attachment(
    app_data_dir: &Path,
    template_id: i64,
    source: &Path,
    existing_count: usize,
) -> Result<TemplateEmailAttachmentRecord, String> {
    if template_id <= 0 {
        return Err("Enregistrez le modèle avant d'ajouter une pièce jointe.".into());
    }
    if existing_count >= MAX_ATTACHMENTS_PER_TEMPLATE {
        return Err(format!(
            "Maximum {MAX_ATTACHMENTS_PER_TEMPLATE} pièces jointes par modèle."
        ));
    }
    if is_blocked_import_source(source, app_data_dir) {
        return Err("Import interdit depuis le répertoire applicatif ou un fichier sensible.".into());
    }
    if !source.is_file() {
        return Err(format!("Fichier introuvable : {}", source.display()));
    }
    let size = fs::metadata(source)
        .map_err(|e| e.to_string())?
        .len();
    if size == 0 {
        return Err("Le fichier est vide.".into());
    }
    if size > MAX_ATTACHMENT_BYTES {
        return Err("Fichier trop volumineux (max 25 Mo).".into());
    }

    let original_name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "piece-jointe".to_string());
    let stored_name = format!(
        "{}_{}",
        chrono::Local::now().format("%Y%m%d_%H%M%S_%3f"),
        sanitize_stored_filename(&original_name)
    );
    let dest_dir = template_attachments_dir(app_data_dir, template_id);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = dest_dir.join(&stored_name);
    fs::copy(source, &dest).map_err(|e| e.to_string())?;

    Ok(TemplateEmailAttachmentRecord {
        id: new_attachment_id(),
        filename: original_name.clone(),
        mime_type: guess_mime_type(&original_name).to_string(),
        size_bytes: size,
        stored_name,
    })
}

pub fn remove_template_attachment(
    app_data_dir: &Path,
    template_id: i64,
    stored_name: &str,
) -> Result<(), String> {
    if stored_name.contains('/') || stored_name.contains('\\') || stored_name.contains("..") {
        return Err("Nom de fichier invalide.".into());
    }
    let path = template_attachments_dir(app_data_dir, template_id).join(stored_name);
    if path.is_file() && is_managed_attachment_path(app_data_dir, &path) {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn read_template_attachment_bytes(
    app_data_dir: &Path,
    template_id: i64,
    stored_name: &str,
) -> Result<Vec<u8>, String> {
    if stored_name.contains('/') || stored_name.contains('\\') || stored_name.contains("..") {
        return Err("Nom de fichier invalide.".into());
    }
    let path = template_attachments_dir(app_data_dir, template_id).join(stored_name);
    if !path.is_file() || !is_managed_attachment_path(app_data_dir, &path) {
        return Err("Pièce jointe introuvable.".into());
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    if data.len() as u64 > MAX_ATTACHMENT_BYTES {
        return Err("Pièce jointe trop volumineuse (max 25 Mo).".into());
    }
    Ok(data)
}

pub fn resolve_attachment_for_send(
    app_data_dir: &Path,
    template_id: i64,
    stored_name: &str,
    variables: Option<&str>,
) -> Result<(String, String, Vec<u8>), String> {
    let records = parse_attachments_from_variables(variables);
    let meta = records
        .iter()
        .find(|r| r.stored_name == stored_name)
        .ok_or_else(|| "Pièce jointe non référencée par le modèle.".to_string())?;
    let filename = sanitize_attachment_filename(&meta.filename)?;
    let mime_type = sanitize_mime_type(&meta.mime_type)?;
    let data = read_template_attachment_bytes(app_data_dir, template_id, stored_name)?;
    Ok((filename, mime_type, data))
}

pub fn copy_template_attachments(
    app_data_dir: &Path,
    from_template_id: i64,
    to_template_id: i64,
    source_records: &[TemplateEmailAttachmentRecord],
) -> Result<Vec<TemplateEmailAttachmentRecord>, String> {
    if from_template_id <= 0 || to_template_id <= 0 || source_records.is_empty() {
        return Ok(vec![]);
    }
    let src_dir = template_attachments_dir(app_data_dir, from_template_id);
    if !src_dir.is_dir() {
        return Ok(vec![]);
    }
    let dest_dir = template_attachments_dir(app_data_dir, to_template_id);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let mut copied = Vec::new();
    for source in source_records {
        if copied.len() >= MAX_ATTACHMENTS_PER_TEMPLATE {
            break;
        }
        let src_path = src_dir.join(&source.stored_name);
        if !src_path.is_file() {
            continue;
        }
        let dest_path = dest_dir.join(&source.stored_name);
        fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
        let size = fs::metadata(&dest_path).map_err(|e| e.to_string())?.len();
        copied.push(TemplateEmailAttachmentRecord {
            id: new_attachment_id(),
            filename: source.filename.clone(),
            mime_type: if source.mime_type.trim().is_empty() {
                guess_mime_type(&source.filename).to_string()
            } else {
                source.mime_type.clone()
            },
            size_bytes: size,
            stored_name: source.stored_name.clone(),
        });
    }
    Ok(copied)
}

pub fn delete_all_template_attachments(app_data_dir: &Path, template_id: i64) -> Result<(), String> {
    if template_id <= 0 {
        return Ok(());
    }
    let dir = template_attachments_dir(app_data_dir, template_id);
    if dir.is_dir() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guess_mime_type_maps_pdf() {
        assert_eq!(guess_mime_type("doc.pdf"), "application/pdf");
    }

    #[test]
    fn stored_name_traversal_rejected_on_remove() {
        let tmp = std::env::temp_dir().join("crm_attach_test");
        let _ = fs::create_dir_all(&tmp);
        assert!(remove_template_attachment(&tmp, 1, "../evil").is_err());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn parse_attachments_from_variables_roundtrip() {
        let vars = r#"{"attachments":[{"id":"a","filename":"f.pdf","mime_type":"application/pdf","size_bytes":10,"stored_name":"x.pdf"}]}"#;
        let parsed = parse_attachments_from_variables(Some(vars));
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].filename, "f.pdf");
    }

    #[test]
    fn sanitize_attachment_filename_rejects_crlf() {
        assert!(sanitize_attachment_filename("ok.pdf").is_ok());
        assert!(sanitize_attachment_filename("bad\r\n.pdf").is_err());
    }

    #[test]
    fn sanitize_mime_type_rejects_injection() {
        assert_eq!(
            sanitize_mime_type("application/pdf").unwrap(),
            "application/pdf"
        );
        assert!(sanitize_mime_type("application/pdf\r\nX: y").is_err());
    }
}
