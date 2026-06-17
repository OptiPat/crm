//! Stockage local des pièces jointes (dossier `documents/` sous AppData).

use std::fs;
use std::path::{Path, PathBuf};

pub fn documents_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("documents")
}

/// Nom du dossier de sauvegarde documents jumelé à une copie `.db` :
/// `patrimoine-crm_{timestamp}.db` → `patrimoine-crm_{timestamp}_documents`
pub fn paired_documents_backup_dir_name(db_backup_filename: &str) -> Option<String> {
    let stem = db_backup_filename.strip_suffix(".db")?;
    if !stem.starts_with("patrimoine-crm_") {
        return None;
    }
    Some(format!("{stem}_documents"))
}

fn normalize_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// Vrai si le fichier est déjà sous `{app_data}/documents/`.
pub fn is_managed_document_path(app_data_dir: &Path, file_path: &Path) -> bool {
    let docs = normalize_path(&documents_dir(app_data_dir));
    let target = normalize_path(file_path);
    target.starts_with(&docs)
}

/// Copie le fichier dans `documents/` s'il n'y est pas déjà. Retourne (chemin, taille).
pub fn ensure_document_stored(app_data_dir: &Path, source: &Path) -> std::io::Result<(PathBuf, u64)> {
    if !source.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Fichier introuvable : {}", source.display()),
        ));
    }

    if is_managed_document_path(app_data_dir, source) {
        let size = fs::metadata(source)?.len();
        return Ok((source.to_path_buf(), size));
    }

    let dest_dir = documents_dir(app_data_dir);
    fs::create_dir_all(&dest_dir)?;

    let file_name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document".to_string());
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let dest = dest_dir.join(format!("{stamp}_{file_name}"));
    fs::copy(source, &dest)?;
    let size = fs::metadata(&dest)?.len();
    Ok((dest, size))
}

/// Supprime le fichier s'il est géré par l'application (sous `documents/`).
pub fn delete_managed_document_file(app_data_dir: &Path, file_path: &Path) -> std::io::Result<()> {
    if !is_managed_document_path(app_data_dir, file_path) {
        return Ok(());
    }
    if file_path.is_file() {
        fs::remove_file(file_path)?;
    }
    Ok(())
}

pub fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Copie `documents/` vers `backups/patrimoine-crm_{timestamp}_documents`.
pub fn backup_documents_dir(
    app_data_dir: &Path,
    backups_dir: &Path,
    db_backup_stem: &str,
) -> std::io::Result<Option<PathBuf>> {
    let src = documents_dir(app_data_dir);
    if !src.is_dir() {
        return Ok(None);
    }
    let has_files = fs::read_dir(&src)?.any(|e| {
        e.ok()
            .map(|entry| entry.path().is_file())
            .unwrap_or(false)
    });
    if !has_files {
        return Ok(None);
    }

    let dest = backups_dir.join(format!("{db_backup_stem}_documents"));
    if dest.exists() {
        fs::remove_dir_all(&dest)?;
    }
    copy_dir_all(&src, &dest)?;
    Ok(Some(dest))
}

/// Restaure `documents/` depuis une sauvegarde jumelée (remplace le dossier live).
pub fn restore_documents_from_backup(
    app_data_dir: &Path,
    backup_documents_dir: &Path,
) -> std::io::Result<()> {
    if !backup_documents_dir.is_dir() {
        return Ok(());
    }

    let live = documents_dir(app_data_dir);
    if live.exists() {
        fs::remove_dir_all(&live)?;
    }
    copy_dir_all(backup_documents_dir, &live)
}

fn safe_dir_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

/// Supprime les dossiers `_documents` jumelés aux `.db` les plus anciens lors de la rotation.
pub fn prune_paired_documents_backups(backups_dir: &Path, db_files_to_remove: &[PathBuf]) {
    for db_path in db_files_to_remove {
        let Some(name) = db_path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(dir_name) = paired_documents_backup_dir_name(name) else {
            continue;
        };
        if !safe_dir_name(&dir_name) {
            continue;
        }
        let dir_path = backups_dir.join(&dir_name);
        if dir_path.is_dir() {
            let _ = fs::remove_dir_all(&dir_path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "patrimoine_crm_docs_storage_test_{}_{}",
            std::process::id(),
            n
        ))
    }

    #[test]
    fn ensure_document_stored_copies_external_file_once() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let external = app_data.join("external.pdf");
        fs::write(&external, b"pdf-content").expect("write external");

        let (first, size) = ensure_document_stored(&app_data, &external).expect("first copy");
        assert!(is_managed_document_path(&app_data, &first));
        assert_eq!(size, 11);

        let (second, _) = ensure_document_stored(&app_data, &first).expect("already managed");
        assert_eq!(first, second);

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn delete_managed_document_file_only_removes_managed_paths() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let external = app_data.join("keep.pdf");
        fs::write(&external, b"x").expect("write external");

        let (managed, _) = ensure_document_stored(&app_data, &external).expect("copy");
        delete_managed_document_file(&app_data, &managed).expect("delete managed");
        assert!(!managed.exists());
        assert!(external.exists());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn paired_documents_backup_dir_name_matches_db_backup() {
        assert_eq!(
            paired_documents_backup_dir_name("patrimoine-crm_20250615_120000_123.db"),
            Some("patrimoine-crm_20250615_120000_123_documents".to_string())
        );
        assert_eq!(paired_documents_backup_dir_name("evil.db"), None);
    }

    #[test]
    fn backup_and_restore_documents_roundtrip() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let docs = documents_dir(&app_data);
        fs::create_dir_all(&docs).expect("docs");
        fs::write(docs.join("rio.pdf"), b"rio").expect("write doc");

        let backups = app_data.join("backups");
        fs::create_dir_all(&backups).expect("backups");
        let stem = "patrimoine-crm_20250615_120000_123";
        let saved = backup_documents_dir(&app_data, &backups, stem)
            .expect("backup docs")
            .expect("some docs");
        assert!(saved.join("rio.pdf").is_file());

        fs::write(docs.join("rio.pdf"), b"changed").expect("mutate live");
        restore_documents_from_backup(&app_data, &saved).expect("restore");
        let content = fs::read(docs.join("rio.pdf")).expect("read restored");
        assert_eq!(content, b"rio");

        let _ = fs::remove_dir_all(&app_data);
    }
}
