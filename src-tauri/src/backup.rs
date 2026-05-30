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
