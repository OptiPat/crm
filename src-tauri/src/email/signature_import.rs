//! Import signature email depuis fichier local (image ou Outlook `.htm`).

use super::oauth_send::ImportedGmailSignature;
use super::signature_html::{
    extract_signature_html_fragment, finalize_signature_html, html_to_plain_signature,
    image_path_to_data_url, normalize_signature_html,
};
use crate::secure_files::require_scoped_file;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const MAX_SIGNATURE_FILE_BYTES: usize = 512_000;

pub fn outlook_signatures_directory() -> Option<String> {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(|appdata| {
            PathBuf::from(appdata)
                .join("Microsoft")
                .join("Signatures")
                .to_string_lossy()
                .into_owned()
        })
    }
    #[cfg(not(windows))]
    {
        None
    }
}

pub fn import_signature_from_file(
    app: &AppHandle,
    file_path: &str,
) -> Result<ImportedGmailSignature, String> {
    let path = require_scoped_file(app, file_path)?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase());

    match ext.as_deref() {
        Some("png") | Some("jpg") | Some("jpeg") | Some("webp") | Some("gif") => {
            let data_url = image_path_to_data_url(&path)
                .ok_or("Image invalide, trop volumineuse (512 Ko max) ou format non supporté.")?;
            let html = format!(
                "<p><img src=\"{data_url}\" alt=\"Signature\" style=\"max-width:520px;height:auto;\" /></p>"
            );
            let plain = html_to_plain_signature(&html);
            Ok(ImportedGmailSignature { html, plain })
        }
        Some("htm") | Some("html") => {
            let bytes = fs::read(&path)
                .map_err(|e| format!("Lecture du fichier Outlook impossible : {e}"))?;
            if bytes.len() > MAX_SIGNATURE_FILE_BYTES {
                return Err("Fichier signature trop volumineux (512 Ko maximum).".into());
            }
            let raw = String::from_utf8_lossy(&bytes);
            let fragment = extract_signature_html_fragment(&raw);
            if fragment.trim().is_empty() {
                return Err("Fichier Outlook vide ou illisible.".into());
            }
            let normalized = normalize_signature_html(&fragment);
            let base_dir = path.parent().unwrap_or(Path::new(""));
            let html = finalize_signature_html(&normalized, Some(base_dir));
            if !html.contains("<img") && html_to_plain_signature(&html).trim().is_empty() {
                return Err("Aucun contenu de signature trouvé dans ce fichier.".into());
            }
            let plain = html_to_plain_signature(&html);
            Ok(ImportedGmailSignature { html, plain })
        }
        _ => Err(
            "Choisissez une image (PNG, JPG, GIF, WebP) ou un fichier Outlook (.htm).".into(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outlook_signatures_directory_points_to_microsoft_signatures_on_windows() {
        if std::env::var_os("APPDATA").is_none() {
            return;
        }
        let dir = outlook_signatures_directory().expect("appdata");
        assert!(dir.contains("Microsoft"));
        assert!(dir.contains("Signatures"));
    }
}
