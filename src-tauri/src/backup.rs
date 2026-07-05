use crate::documents_storage;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_BACKUPS: usize = 10;

/// Copie la base avant les migrations au démarrage (si elle existait déjà).
/// Duplique aussi le dossier `documents/` (PDF) avec le même horodatage.
pub fn create_pre_migration_backup(app_data_dir: &Path, db_path: &Path) -> std::io::Result<PathBuf> {
    let backups_dir = app_data_dir.join("backups");
    fs::create_dir_all(&backups_dir)?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let stem = format!("patrimoine-crm_{timestamp}");
    let dest = backups_dir.join(format!("{stem}.db"));
    fs::copy(db_path, &dest)?;
    if let Some(docs_dest) = documents_storage::backup_documents_dir(app_data_dir, &backups_dir, &stem)? {
        println!("✅ Backup documents créé : {:?}", docs_dest);
    }
    if let Some(cfg_dest) =
        crate::backup_sidecar::backup_app_config_files(app_data_dir, &backups_dir, &stem)?
    {
        println!("✅ Backup config créé : {:?}", cfg_dest);
    }
    println!("✅ Backup créé : {:?}", dest);

    prune_old_backups(&backups_dir)?;
    Ok(dest)
}

fn prune_old_backups(backups_dir: &Path) -> std::io::Result<()> {
    let mut entries: Vec<PathBuf> = fs::read_dir(backups_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .is_some_and(|ext| ext == "db")
                && p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("patrimoine-crm_"))
        })
        .collect();

    // Tri par horodatage dans le nom (fs::copy recopie le mtime de la source)
    entries.sort_by(|a, b| backup_sort_key(a).cmp(&backup_sort_key(b)));
    let mut removed: Vec<PathBuf> = Vec::new();
    while entries.len() > MAX_BACKUPS {
        if let Some(oldest) = entries.first() {
            removed.push(oldest.clone());
            let _ = fs::remove_file(oldest);
            entries.remove(0);
        }
    }
    documents_storage::prune_paired_documents_backups(backups_dir, &removed);
    crate::backup_sidecar::prune_paired_config_backups(backups_dir, &removed);
    Ok(())
}

pub fn list_backups(app_data_dir: &Path) -> std::io::Result<Vec<(String, u64)>> {
    let backups_dir = app_data_dir.join("backups");
    if !backups_dir.exists() {
        return Ok(vec![]);
    }

    let mut items: Vec<(String, u64)> = fs::read_dir(&backups_dir)?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_string_lossy().into_owned();
            if path.extension()? != "db" || !name.starts_with("patrimoine-crm_") {
                return None;
            }
            let size = fs::metadata(&path).ok()?.len();
            Some((name, size))
        })
        .collect();

    items.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(items)
}

fn backup_sort_key(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Copie manuelle de la base (Parametres -> Donnees).
pub fn create_manual_backup(app_data_dir: &Path, db_path: &Path) -> std::io::Result<PathBuf> {
    create_pre_migration_backup(app_data_dir, db_path)
}

/// Sauvegarde automatique régulière : crée une copie horodatée au plus une fois
/// par jour. La rotation (MAX_BACKUPS dernières) est gérée par
/// `create_pre_migration_backup`. Retourne `None` si une copie du jour existe déjà.
pub fn create_daily_backup_if_needed(
    app_data_dir: &Path,
    db_path: &Path,
) -> std::io::Result<Option<PathBuf>> {
    if !db_path.exists() {
        return Ok(None);
    }

    let backups_dir = app_data_dir.join("backups");
    let today_prefix = format!("patrimoine-crm_{}", chrono::Local::now().format("%Y%m%d"));

    if backups_dir.exists() {
        let already_today = fs::read_dir(&backups_dir)?
            .filter_map(|e| e.ok())
            .any(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(&today_prefix)
            });
        if already_today {
            return Ok(None);
        }
    }

    Ok(Some(create_pre_migration_backup(app_data_dir, db_path)?))
}

/// Restaure la base depuis une copie du dossier backups (nom de fichier uniquement).
/// Cree d'abord une copie de securite de la base actuelle si elle existe.
pub fn restore_db_from_backup(
    app_data_dir: &Path,
    db_path: &Path,
    backup_filename: &str,
) -> std::io::Result<(PathBuf, Option<PathBuf>)> {
    let backups_dir = app_data_dir.join("backups");
    let file_name = Path::new(backup_filename)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Nom de fichier invalide")
        })?;
    if !file_name.starts_with("patrimoine-crm_") || !file_name.ends_with(".db") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Fichier de sauvegarde non reconnu",
        ));
    }
    let src = backups_dir.join(file_name);
    if !src.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Copie introuvable",
        ));
    }
    let safety = if db_path.exists() {
        Some(create_pre_migration_backup(app_data_dir, db_path)?)
    } else {
        None
    };
    fs::copy(&src, db_path)?;

    if let Some(dir_name) = documents_storage::paired_documents_backup_dir_name(file_name) {
        let docs_backup = backups_dir.join(&dir_name);
        if docs_backup.is_dir() {
            documents_storage::restore_documents_from_backup(app_data_dir, &docs_backup)?;
            println!("✅ Documents restaurés depuis {:?}", docs_backup);
        }
    }

    if let Some(dir_name) = crate::backup_sidecar::paired_config_backup_dir_name(file_name) {
        let config_backup = backups_dir.join(&dir_name);
        if config_backup.is_dir() {
            crate::backup_sidecar::restore_app_config_from_backup(app_data_dir, &config_backup)?;
            println!("✅ Config restaurée depuis {:?}", config_backup);
        }
    }

    Ok((src, safety))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "patrimoine_crm_backup_test_{}_{}",
            std::process::id(),
            n
        ))
    }

    fn write_marker_db(path: &Path, value: &str) {
        let conn = Connection::open(path).expect("open db");
        conn.execute("CREATE TABLE marker (v TEXT NOT NULL)", [])
            .expect("create marker");
        conn.execute("INSERT INTO marker (v) VALUES (?1)", [value])
            .expect("insert marker");
    }

    fn read_marker(path: &Path) -> String {
        Connection::open(path)
            .expect("open restored db")
            .query_row("SELECT v FROM marker", [], |row| row.get(0))
            .expect("read marker")
    }

    #[test]
    fn create_pre_migration_backup_includes_documents_dir() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("temp dir");
        let db_path = app_data.join("patrimoine-crm.db");
        write_marker_db(&db_path, "live");

        let docs = app_data.join("documents");
        fs::create_dir_all(&docs).expect("docs");
        fs::write(docs.join("test.pdf"), b"pdf").expect("write pdf");
        fs::write(app_data.join("secrets.key"), b"key").expect("secrets");

        let backup_path =
            create_pre_migration_backup(&app_data, &db_path).expect("backup with docs");
        let stem = backup_path
            .file_stem()
            .and_then(|s| s.to_str())
            .expect("stem");
        let docs_backup = app_data.join("backups").join(format!("{stem}_documents"));
        assert!(docs_backup.join("test.pdf").is_file());

        let cfg_backup = app_data.join("backups").join(format!("{stem}_config"));
        assert!(cfg_backup.join("secrets.key").is_file());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn restore_db_from_backup_replaces_database_and_creates_safety_copy() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("temp dir");
        let db_path = app_data.join("patrimoine-crm.db");
        write_marker_db(&db_path, "live");

        let backups_dir = app_data.join("backups");
        fs::create_dir_all(&backups_dir).expect("backups dir");
        let backup_name = "patrimoine-crm_test_restore.db";
        let backup_path = backups_dir.join(backup_name);
        write_marker_db(&backup_path, "backup");

        let (restored, safety) =
            restore_db_from_backup(&app_data, &db_path, backup_name).expect("restore");
        assert_eq!(restored, backup_path);
        assert!(safety.is_some());
        assert_eq!(read_marker(&db_path), "backup");

        let backup_count = fs::read_dir(&backups_dir)
            .expect("list backups")
            .filter_map(|e| e.ok())
            .count();
        assert!(backup_count >= 2, "expected backup + safety copy");

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn create_daily_backup_runs_once_per_day() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("temp dir");
        let db_path = app_data.join("patrimoine-crm.db");
        write_marker_db(&db_path, "live");

        let first =
            create_daily_backup_if_needed(&app_data, &db_path).expect("première sauvegarde");
        assert!(first.is_some(), "la première sauvegarde du jour doit être créée");

        let second =
            create_daily_backup_if_needed(&app_data, &db_path).expect("seconde sauvegarde");
        assert!(
            second.is_none(),
            "aucune seconde sauvegarde le même jour ne doit être créée"
        );

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn create_daily_backup_skips_when_db_absent() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("temp dir");
        let db_path = app_data.join("patrimoine-crm.db");

        let result =
            create_daily_backup_if_needed(&app_data, &db_path).expect("pas d'erreur sans base");
        assert!(result.is_none(), "aucune sauvegarde si la base n'existe pas");

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn restore_db_from_backup_rejects_invalid_filename() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("temp dir");
        let db_path = app_data.join("patrimoine-crm.db");
        write_marker_db(&db_path, "live");

        let err = restore_db_from_backup(&app_data, &db_path, "../evil.db")
            .expect_err("must reject path traversal");
        assert!(err.kind() == std::io::ErrorKind::InvalidInput);

        let _ = fs::remove_dir_all(&app_data);
    }
}
