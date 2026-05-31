use std::fs;
use std::path::{Path, PathBuf};

const MAX_BACKUPS: usize = 10;

/// Copie la base avant les migrations au démarrage (si elle existait déjà).
pub fn create_pre_migration_backup(app_data_dir: &Path, db_path: &Path) -> std::io::Result<PathBuf> {
    let backups_dir = app_data_dir.join("backups");
    fs::create_dir_all(&backups_dir)?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let dest = backups_dir.join(format!("patrimoine-crm_{timestamp}.db"));
    fs::copy(db_path, &dest)?;
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
    while entries.len() > MAX_BACKUPS {
        if let Some(oldest) = entries.first() {
            let _ = fs::remove_file(oldest);
            entries.remove(0);
        }
    }
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
