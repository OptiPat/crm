//! Stockage local des pièces jointes (dossier `documents/` sous AppData).
//! Chaque contact dispose de son sous-dossier : `documents/{contact_id}/`.

use std::fs;
use std::path::{Path, PathBuf};

pub const ORPHAN_CONTACT_DIR: &str = "_sans_client";

pub fn documents_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("documents")
}

pub fn contact_documents_dir(app_data_dir: &Path, contact_id: i64) -> PathBuf {
    documents_dir(app_data_dir).join(contact_id.to_string())
}

pub fn orphan_documents_dir(app_data_dir: &Path) -> PathBuf {
    documents_dir(app_data_dir).join(ORPHAN_CONTACT_DIR)
}

pub fn team_documents_cache_dir(app_data_dir: &Path) -> PathBuf {
    documents_dir(app_data_dir).join("_team_cache")
}

fn target_documents_dir(app_data_dir: &Path, contact_id: Option<i64>) -> PathBuf {
    match contact_id {
        Some(id) if id > 0 => contact_documents_dir(app_data_dir, id),
        _ => orphan_documents_dir(app_data_dir),
    }
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

pub fn validate_managed_document_file(
    app_data_dir: &Path,
    file_path: &Path,
) -> Result<PathBuf, String> {
    if !file_path.is_file() {
        return Err("Fichier introuvable sur ce PC.".into());
    }
    if !is_managed_document_path(app_data_dir, file_path) {
        return Err(
            "Accès refusé : ce fichier n'appartient pas au stockage documentaire du CRM.".into(),
        );
    }
    file_path
        .canonicalize()
        .map_err(|error| format!("Chemin de document invalide : {error}"))
}

pub fn validate_document_or_compta_cache_file(
    app_data_dir: &Path,
    app_cache_dir: &Path,
    file_path: &Path,
) -> Result<PathBuf, String> {
    if let Ok(managed) = validate_managed_document_file(app_data_dir, file_path) {
        return Ok(managed);
    }
    if !file_path.is_file() {
        return Err("Fichier introuvable sur ce PC.".into());
    }
    let cache_root = app_cache_dir
        .join("compta-drive")
        .canonicalize()
        .map_err(|_| "Cache comptable introuvable.".to_string())?;
    let target = file_path
        .canonicalize()
        .map_err(|error| format!("Chemin de cache invalide : {error}"))?;
    if !target.starts_with(&cache_root) {
        return Err("Accès refusé : fichier hors documents et cache comptable gérés.".into());
    }
    Ok(target)
}

fn is_in_target_dir(app_data_dir: &Path, file_path: &Path, contact_id: Option<i64>) -> bool {
    let target = normalize_path(&target_documents_dir(app_data_dir, contact_id));
    let path = normalize_path(file_path);
    path.starts_with(&target)
}

fn unique_dest_path(dest_dir: &Path, file_name: &str) -> PathBuf {
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    dest_dir.join(format!("{stamp}_{file_name}"))
}

fn store_file_in_dir(
    source: &Path,
    dest_dir: &Path,
    move_if_possible: bool,
) -> std::io::Result<(PathBuf, u64)> {
    fs::create_dir_all(dest_dir)?;

    let file_name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document".to_string());
    let dest = unique_dest_path(dest_dir, &file_name);

    if move_if_possible && fs::rename(source, &dest).is_ok() {
        let size = fs::metadata(&dest)?.len();
        return Ok((dest, size));
    }

    fs::copy(source, &dest)?;
    let size = fs::metadata(&dest)?.len();
    Ok((dest, size))
}

pub fn stage_document_file(app_data_dir: &Path, source: &Path) -> std::io::Result<(PathBuf, u64)> {
    if !source.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Fichier introuvable : {}", source.display()),
        ));
    }
    store_file_in_dir(source, &documents_dir(app_data_dir), false)
}

/// Copie ou déplace le fichier dans le dossier client approprié. Retourne (chemin, taille).
/// Si `remove_previous_managed` est faux, l'ancien fichier géré n'est pas supprimé (migration sûre).
pub fn ensure_document_stored(
    app_data_dir: &Path,
    source: &Path,
    contact_id: Option<i64>,
    remove_previous_managed: bool,
) -> std::io::Result<(PathBuf, u64)> {
    if !source.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Fichier introuvable : {}", source.display()),
        ));
    }

    if is_in_target_dir(app_data_dir, source, contact_id) {
        let size = fs::metadata(source)?.len();
        return Ok((source.to_path_buf(), size));
    }

    let dest_dir = target_documents_dir(app_data_dir, contact_id);
    let was_managed = is_managed_document_path(app_data_dir, source);
    let (dest, size) = store_file_in_dir(source, &dest_dir, was_managed)?;

    if was_managed && remove_previous_managed && source != dest.as_path() {
        let _ = fs::remove_file(source);
    }

    Ok((dest, size))
}

pub fn ensure_team_document_stored(
    app_data_dir: &Path,
    source: &Path,
) -> std::io::Result<(PathBuf, u64)> {
    if !source.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Fichier introuvable : {}", source.display()),
        ));
    }
    let was_managed = is_managed_document_path(app_data_dir, source);
    store_file_in_dir(source, &team_documents_cache_dir(app_data_dir), was_managed)
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

/// Fichier directement sous `documents/` (staging FE), pas dans un sous-dossier client.
pub fn is_flat_staging_path(app_data_dir: &Path, file_path: &Path) -> bool {
    if !file_path.is_file() || !is_managed_document_path(app_data_dir, file_path) {
        return false;
    }
    let docs = normalize_path(&documents_dir(app_data_dir));
    file_path
        .parent()
        .map(|parent| normalize_path(parent) == docs)
        .unwrap_or(false)
}

/// Supprime un fichier de staging à la racine de `documents/` (import annulé).
pub fn discard_staged_document_file(app_data_dir: &Path, file_path: &Path) -> std::io::Result<()> {
    if !is_flat_staging_path(app_data_dir, file_path) {
        return Ok(());
    }
    fs::remove_file(file_path)
}

/// Retire les fichiers plats orphelins (staging abandonné, non référencés en base).
pub fn prune_orphan_staging_files(
    app_data_dir: &Path,
    referenced_paths: &std::collections::HashSet<String>,
) -> std::io::Result<usize> {
    let docs = documents_dir(app_data_dir);
    if !docs.is_dir() {
        return Ok(0);
    }

    let mut removed = 0usize;
    for entry in fs::read_dir(&docs)? {
        let entry = entry?;
        let path = entry.path();
        if !is_flat_staging_path(app_data_dir, &path) {
            continue;
        }
        let canonical = path
            .canonicalize()
            .unwrap_or_else(|_| path.clone())
            .to_string_lossy()
            .into_owned();
        let raw = path.to_string_lossy().into_owned();
        if referenced_paths.contains(&canonical) || referenced_paths.contains(&raw) {
            continue;
        }
        fs::remove_file(&path)?;
        removed += 1;
    }
    Ok(removed)
}

pub fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        if entry.file_name() == "_team_cache" {
            continue;
        }
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

fn dir_has_files(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        if entry.file_name() == "_team_cache" {
            continue;
        }
        let p = entry.path();
        if p.is_file() {
            return true;
        }
        if p.is_dir() && dir_has_files(&p) {
            return true;
        }
    }
    false
}

/// Copie `documents/` vers `backups/patrimoine-crm_{timestamp}_documents`.
pub fn backup_documents_dir(
    app_data_dir: &Path,
    backups_dir: &Path,
    db_backup_stem: &str,
) -> std::io::Result<Option<PathBuf>> {
    let src = documents_dir(app_data_dir);
    if !dir_has_files(&src) {
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
    if live.exists() && !live.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Le chemin documents actif n'est pas un dossier.",
        ));
    }
    let nonce = format!(
        "{}-{}",
        std::process::id(),
        chrono::Local::now()
            .timestamp_nanos_opt()
            .unwrap_or_default()
    );
    let staged = app_data_dir.join(format!(".documents-restore-{nonce}"));
    let previous = app_data_dir.join(format!(".documents-rollback-{nonce}"));
    let _ = fs::remove_dir_all(&staged);
    let _ = fs::remove_dir_all(&previous);

    if let Err(error) = copy_dir_all(backup_documents_dir, &staged) {
        let _ = fs::remove_dir_all(&staged);
        return Err(error);
    }

    let had_live = live.is_dir();
    if had_live {
        fs::rename(&live, &previous)?;
    }
    if let Err(error) = fs::rename(&staged, &live) {
        let rollback_error = had_live
            .then(|| fs::rename(&previous, &live).err())
            .flatten();
        let _ = fs::remove_dir_all(&staged);
        return match rollback_error {
            Some(rollback_error) => Err(std::io::Error::new(
                error.kind(),
                format!(
                    "Publication des documents échouée ({error}) et rollback incomplet ({rollback_error})"
                ),
            )),
            None => Err(error),
        };
    }
    if had_live {
        let _ = fs::remove_dir_all(previous);
    }
    Ok(())
}

pub fn remove_documents_for_restore(app_data_dir: &Path) -> std::io::Result<()> {
    let live = documents_dir(app_data_dir);
    if !live.exists() {
        return Ok(());
    }
    if !live.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Le chemin documents actif n'est pas un dossier.",
        ));
    }
    let removed = app_data_dir.join(format!(
        ".documents-removed-{}-{}",
        std::process::id(),
        chrono::Local::now()
            .timestamp_nanos_opt()
            .unwrap_or_default()
    ));
    fs::rename(&live, &removed)?;
    fs::remove_dir_all(removed)
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

fn referenced_document_paths(
    database: &crate::database::Database,
) -> Result<std::collections::HashSet<String>, String> {
    let documents = database
        .get_all_documents()
        .map_err(|e| format!("Lecture documents : {e}"))?;
    Ok(documents
        .into_iter()
        .flat_map(|doc| {
            let chemin = doc.chemin_fichier.clone();
            let path = Path::new(&chemin);
            let mut paths = vec![doc.chemin_fichier];
            if let Ok(canonical) = path.canonicalize() {
                paths.push(canonical.to_string_lossy().into_owned());
            }
            paths
        })
        .collect())
}

/// Nettoie les fichiers de staging orphelins (appel au démarrage).
pub fn prune_orphan_staging_files_on_open(
    app_data_dir: &Path,
    database: &crate::database::Database,
) -> Result<usize, String> {
    let referenced = referenced_document_paths(database)?;
    prune_orphan_staging_files(app_data_dir, &referenced).map_err(|e| e.to_string())
}

/// Déplace les fichiers existants vers `documents/{contact_id}/` (migration one-shot).
pub fn migrate_documents_to_contact_folders(
    app_data_dir: &Path,
    database: &crate::database::Database,
) -> Result<(), String> {
    if database
        .get_setting("migration_documents_contact_folders_v1")
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Ok(());
    }

    let documents = database
        .get_all_documents()
        .map_err(|e| format!("Lecture documents : {e}"))?;

    let mut moved = 0usize;
    for doc in documents {
        let source = Path::new(&doc.chemin_fichier);
        if !source.is_file() {
            continue;
        }
        let (stored_path, size) =
            ensure_document_stored(app_data_dir, source, doc.contact_id, false)
                .map_err(|e| format!("Migration document #{} : {e}", doc.id))?;
        if stored_path != source {
            database
                .update_document_file_path(doc.id, &stored_path.to_string_lossy(), size as i64)
                .map_err(|e| format!("Mise à jour chemin document #{} : {e}", doc.id))?;
            if is_managed_document_path(app_data_dir, source) {
                let _ = fs::remove_file(source);
            }
            moved += 1;
        }
    }

    database
        .set_setting("migration_documents_contact_folders_v1", "1")
        .map_err(|e| e.to_string())?;

    if moved > 0 {
        println!("✅ Migration documents : {moved} fichier(s) déplacé(s) vers un dossier client");
    }

    Ok(())
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
    fn managed_document_validation_rejects_external_and_prefix_sibling_files() {
        let app_data = unique_temp_dir();
        let app_cache = unique_temp_dir();
        let docs = documents_dir(&app_data);
        let sibling = app_data.join("documents-export");
        let compta_cache = app_cache.join("compta-drive");
        fs::create_dir_all(&docs).unwrap();
        fs::create_dir_all(&sibling).unwrap();
        fs::create_dir_all(&compta_cache).unwrap();
        let managed = docs.join("managed.pdf");
        let external = app_data.join("external.pdf");
        let prefixed = sibling.join("prefixed.pdf");
        let cached = compta_cache.join("invoice.pdf");
        fs::write(&managed, b"managed").unwrap();
        fs::write(&external, b"external").unwrap();
        fs::write(&prefixed, b"prefixed").unwrap();
        fs::write(&cached, b"cached").unwrap();

        assert!(validate_managed_document_file(&app_data, &managed).is_ok());
        assert!(validate_managed_document_file(&app_data, &external).is_err());
        assert!(validate_managed_document_file(&app_data, &prefixed).is_err());
        assert!(validate_document_or_compta_cache_file(&app_data, &app_cache, &managed).is_ok());
        assert!(validate_document_or_compta_cache_file(&app_data, &app_cache, &cached).is_ok());
        assert!(validate_document_or_compta_cache_file(&app_data, &app_cache, &external).is_err());

        let _ = fs::remove_dir_all(app_data);
        let _ = fs::remove_dir_all(app_cache);
    }

    #[test]
    fn ensure_document_stored_copies_external_file_into_contact_folder() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let external = app_data.join("external.pdf");
        fs::write(&external, b"pdf-content").expect("write external");

        let (stored, size) = ensure_document_stored(&app_data, &external, Some(42), true)
            .expect("store for contact");
        assert!(is_in_target_dir(&app_data, &stored, Some(42)));
        assert!(stored.starts_with(contact_documents_dir(&app_data, 42)));
        assert_eq!(size, 11);
        assert!(external.exists());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn team_document_is_stored_only_in_the_purgeable_cache() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).unwrap();
        let external = app_data.join("source.pdf");
        fs::write(&external, b"contenu").unwrap();

        let (stored, _) = ensure_team_document_stored(&app_data, &external).unwrap();
        assert!(stored.starts_with(team_documents_cache_dir(&app_data)));
        assert!(external.exists());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn document_backups_skip_the_reconstructible_team_cache() {
        let source = unique_temp_dir();
        let destination = unique_temp_dir();
        fs::create_dir_all(team_documents_cache_dir(&source)).unwrap();
        fs::write(source.join("historique.pdf"), b"historique").unwrap();
        fs::write(
            team_documents_cache_dir(&source).join("cache.pdf"),
            b"cache",
        )
        .unwrap();

        copy_dir_all(&source, &destination).unwrap();
        assert!(destination.join("historique.pdf").is_file());
        assert!(!destination.join("_team_cache").exists());

        let _ = fs::remove_dir_all(source);
        let _ = fs::remove_dir_all(destination);
    }

    #[test]
    fn ensure_document_stored_moves_flat_managed_file_to_contact_folder() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let docs = documents_dir(&app_data);
        fs::create_dir_all(&docs).expect("docs dir");
        let flat = docs.join("20250718_rio.pdf");
        fs::write(&flat, b"rio").expect("write flat");

        let (stored, _) = ensure_document_stored(&app_data, &flat, Some(7), true)
            .expect("move to contact folder");
        assert!(is_in_target_dir(&app_data, &stored, Some(7)));
        assert!(!flat.exists());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn ensure_document_stored_keeps_file_already_in_contact_folder() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let contact_dir = contact_documents_dir(&app_data, 3);
        fs::create_dir_all(&contact_dir).expect("contact dir");
        let existing = contact_dir.join("cni.pdf");
        fs::write(&existing, b"cni").expect("write");

        let (stored, size) =
            ensure_document_stored(&app_data, &existing, Some(3), true).expect("already stored");
        assert_eq!(stored, existing);
        assert_eq!(size, 3);

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn ensure_document_stored_orphan_goes_to_sans_client_folder() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let external = app_data.join("orphan.pdf");
        fs::write(&external, b"x").expect("write");

        let (stored, _) =
            ensure_document_stored(&app_data, &external, None, true).expect("orphan store");
        assert!(stored.starts_with(orphan_documents_dir(&app_data)));

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn delete_managed_document_file_only_removes_managed_paths() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let external = app_data.join("keep.pdf");
        fs::write(&external, b"x").expect("write external");

        let (managed, _) =
            ensure_document_stored(&app_data, &external, Some(1), true).expect("copy");
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
    fn backup_and_restore_documents_roundtrip_with_nested_dirs() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let contact_dir = contact_documents_dir(&app_data, 5);
        fs::create_dir_all(&contact_dir).expect("contact dir");
        fs::write(contact_dir.join("rio.pdf"), b"rio").expect("write doc");

        let backups = app_data.join("backups");
        fs::create_dir_all(&backups).expect("backups");
        let stem = "patrimoine-crm_20250615_120000_123";
        let saved = backup_documents_dir(&app_data, &backups, stem)
            .expect("backup docs")
            .expect("some docs");
        assert!(saved.join("5").join("rio.pdf").is_file());

        fs::write(contact_dir.join("rio.pdf"), b"changed").expect("mutate live");
        restore_documents_from_backup(&app_data, &saved).expect("restore");
        let content = fs::read(contact_dir.join("rio.pdf")).expect("read restored");
        assert_eq!(content, b"rio");

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn migrate_documents_to_contact_folders_moves_flat_files() {
        use crate::database::models::{NewContact, NewDocument};
        use crate::database::Database;

        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let docs = documents_dir(&app_data);
        fs::create_dir_all(&docs).expect("docs dir");
        let flat = docs.join("20250718_rio.pdf");
        fs::write(&flat, b"rio").expect("write flat");

        let db = Database::open_in_memory_for_tests().expect("db");
        let contact_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "CLIENT".into(),
                ..Default::default()
            })
            .expect("contact")
            .id
            .expect("contact id");
        let flat_str = flat.to_string_lossy().into_owned();
        let created = db
            .create_document(NewDocument {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_document: "PATRIMOINE".to_string(),
                nom_fichier: "rio.pdf".to_string(),
                chemin_fichier: flat_str.clone(),
                taille_fichier: 3,
                mime_type: Some("application/pdf".to_string()),
                date_document: None,
                notes: None,
                sensibilite_extra_financiere: None,
                experience_investissement: None,
            })
            .expect("create doc");

        migrate_documents_to_contact_folders(&app_data, &db).expect("migrate");

        let updated = db.get_document_by_id(created.id).expect("read doc");
        let contact_dir = contact_documents_dir(&app_data, contact_id);
        assert!(Path::new(&updated.chemin_fichier).starts_with(&contact_dir));
        assert!(!flat.exists());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn prune_orphan_staging_files_removes_unreferenced_flat_files() {
        use crate::database::Database;

        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let docs = documents_dir(&app_data);
        fs::create_dir_all(&docs).expect("docs dir");
        let orphan = docs.join("1730000000000_orphan.pdf");
        fs::write(&orphan, b"x").expect("write orphan");

        let db = Database::open_in_memory_for_tests().expect("db");
        let removed = prune_orphan_staging_files_on_open(&app_data, &db).expect("prune");
        assert_eq!(removed, 1);
        assert!(!orphan.exists());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn discard_staged_document_file_only_removes_flat_staging() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let contact_dir = contact_documents_dir(&app_data, 2);
        fs::create_dir_all(&contact_dir).expect("contact dir");
        let managed = contact_dir.join("keep.pdf");
        fs::write(&managed, b"keep").expect("write managed");
        let staging = documents_dir(&app_data).join("1730000000000_staging.pdf");
        fs::write(&staging, b"staging").expect("write staging");

        discard_staged_document_file(&app_data, &staging).expect("discard staging");
        assert!(!staging.exists());
        assert!(managed.exists());

        let _ = fs::remove_dir_all(&app_data);
    }
}
