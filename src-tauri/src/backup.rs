use crate::documents_storage;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

static BACKUP_OPERATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
const EXTERNAL_BACKUP_STATUS_FILE: &str = "external_backup_status.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExternalBackupStatus {
    pub last_attempt_at: Option<String>,
    pub last_success_path: Option<String>,
    pub last_error: Option<String>,
}

pub fn lock_backup_operations() -> std::io::Result<MutexGuard<'static, ()>> {
    match BACKUP_OPERATION_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
    {
        Ok(guard) => Ok(guard),
        Err(poisoned) => {
            eprintln!("⚠️ Verrou des sauvegardes récupéré après interruption.");
            Ok(poisoned.into_inner())
        }
    }
}

pub fn load_external_backup_status(app_data_dir: &Path) -> ExternalBackupStatus {
    let path = app_data_dir.join(EXTERNAL_BACKUP_STATUS_FILE);
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn record_external_backup_success(app_data_dir: &Path, path: &Path) {
    save_external_backup_status(
        app_data_dir,
        &ExternalBackupStatus {
            last_attempt_at: Some(chrono::Local::now().to_rfc3339()),
            last_success_path: Some(path.to_string_lossy().into_owned()),
            last_error: None,
        },
    );
}

pub fn record_external_backup_error(app_data_dir: &Path, error: &str) {
    let previous = load_external_backup_status(app_data_dir);
    save_external_backup_status(
        app_data_dir,
        &ExternalBackupStatus {
            last_attempt_at: Some(chrono::Local::now().to_rfc3339()),
            last_success_path: previous.last_success_path,
            last_error: Some(error.to_string()),
        },
    );
}

pub fn clear_external_backup_status(app_data_dir: &Path) {
    let path = app_data_dir.join(EXTERNAL_BACKUP_STATUS_FILE);
    if path.is_file() {
        let _ = fs::remove_file(path);
    }
}

fn save_external_backup_status(app_data_dir: &Path, status: &ExternalBackupStatus) {
    let Ok(json) = serde_json::to_vec_pretty(status) else {
        return;
    };
    if let Err(error) = crate::atomic_file::write(
        &app_data_dir.join(EXTERNAL_BACKUP_STATUS_FILE),
        &json,
    ) {
        eprintln!("⚠️ Écriture du statut de sauvegarde externe : {error}");
    }
}

pub fn spawn_external_backup_if_configured(app_data_dir: &Path, db_path: &Path) {
    let prefs_path = app_data_dir.join(crate::app_runtime::RUNTIME_PREFS_FILE);
    let prefs = crate::app_runtime::load_runtime_prefs_from_path(&prefs_path);
    let Some(directory) = prefs.external_backup_directory else {
        return;
    };
    let app_data_dir = app_data_dir.to_path_buf();
    let db_path = db_path.to_path_buf();
    let _ = std::thread::Builder::new()
        .name("external-backup".into())
        .spawn(move || {
            let _operation_guard = match lock_backup_operations() {
                Ok(guard) => guard,
                Err(error) => {
                    record_external_backup_error(&app_data_dir, &error.to_string());
                    return;
                }
            };
            let source = match Connection::open_with_flags(
                &db_path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
            ) {
                Ok(source) => source,
                Err(error) => {
                    record_external_backup_error(&app_data_dir, &error.to_string());
                    eprintln!("⚠️ Ouverture de la base pour sauvegarde externe : {error}");
                    return;
                }
            };
            match crate::export_archive::export_automatic_archive_if_due(
                crate::export_archive::ExportArchiveInput {
                    source_db: &source,
                    app_data_dir: &app_data_dir,
                    destination_dir: Path::new(&directory),
                },
                false,
            ) {
                Ok(Some(output)) => {
                    record_external_backup_success(&app_data_dir, &output.zip_path);
                }
                Ok(None) => {}
                Err(error) => {
                    record_external_backup_error(&app_data_dir, &error);
                    eprintln!("⚠️ Sauvegarde externe quotidienne échouée : {error}");
                }
            }
        });
}

const MAX_BACKUPS: usize = 10;

/// Copie la base avant les migrations au démarrage (si elle existait déjà).
/// Duplique aussi le dossier `documents/` (PDF) avec le même horodatage.
pub fn create_pre_migration_backup(app_data_dir: &Path, db_path: &Path) -> std::io::Result<PathBuf> {
    create_backup_with_writer(app_data_dir, |destination| {
        fs::copy(db_path, destination)?;
        crate::export_archive::validate_database_file(destination).map_err(io::Error::other)
    })
}

pub fn create_open_database_backup(
    app_data_dir: &Path,
    connection: &Connection,
) -> std::io::Result<PathBuf> {
    create_backup_with_writer(app_data_dir, |destination| {
        crate::export_archive::create_consistent_db_snapshot(connection, destination)
            .map_err(io::Error::other)
    })
}

fn create_backup_with_writer(
    app_data_dir: &Path,
    write_database: impl FnOnce(&Path) -> std::io::Result<()>,
) -> std::io::Result<PathBuf> {
    let backups_dir = app_data_dir.join("backups");
    fs::create_dir_all(&backups_dir)?;
    cleanup_partial_backups(&backups_dir)?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let stem = format!("patrimoine-crm_{timestamp}");
    let partial_stem = format!(".partial-{stem}-{}", std::process::id());
    let destination = backups_dir.join(format!("{stem}.db"));
    let partial_database = backups_dir.join(format!("{partial_stem}.db"));
    let final_documents = backups_dir.join(format!("{stem}_documents"));
    let final_config = backups_dir.join(format!("{stem}_config"));
    let partial_documents = backups_dir.join(format!("{partial_stem}_documents"));
    let partial_config = backups_dir.join(format!("{partial_stem}_config"));

    if destination.exists() || final_documents.exists() || final_config.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "Une sauvegarde avec le même horodatage existe déjà.",
        ));
    }

    let staged = (|| {
        write_database(&partial_database)?;
        documents_storage::backup_documents_dir(
            app_data_dir,
            &backups_dir,
            &partial_stem,
        )?;
        crate::backup_sidecar::backup_app_config_files(
            app_data_dir,
            &backups_dir,
            &partial_stem,
        )?;
        Ok::<(), io::Error>(())
    })();
    if let Err(error) = staged {
        cleanup_backup_paths([
            &partial_database,
            &partial_documents,
            &partial_config,
        ]);
        return Err(error);
    }

    let published = (|| {
        if partial_documents.is_dir() {
            fs::rename(&partial_documents, &final_documents)?;
        }
        if partial_config.is_dir() {
            fs::rename(&partial_config, &final_config)?;
        }
        fs::rename(&partial_database, &destination)?;
        Ok::<(), io::Error>(())
    })();
    if let Err(error) = published {
        cleanup_backup_paths([
            &partial_database,
            &partial_documents,
            &partial_config,
            &destination,
            &final_documents,
            &final_config,
        ]);
        return Err(error);
    }

    if final_documents.is_dir() {
        println!("✅ Backup documents créé : {:?}", final_documents);
    }
    if final_config.is_dir() {
        println!("✅ Backup config créé : {:?}", final_config);
    }
    println!("✅ Backup créé : {:?}", destination);
    prune_old_backups(&backups_dir)?;
    Ok(destination)
}

fn cleanup_backup_paths<const N: usize>(paths: [&Path; N]) {
    for path in paths {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
        } else if path.is_file() {
            let _ = fs::remove_file(path);
        }
    }
}

fn cleanup_partial_backups(backups_dir: &Path) -> std::io::Result<()> {
    for entry in fs::read_dir(backups_dir)?.filter_map(Result::ok) {
        let name = entry.file_name();
        if !name.to_string_lossy().starts_with(".partial-patrimoine-crm_") {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        } else if path.is_file() {
            fs::remove_file(path)?;
        }
    }
    Ok(())
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
pub fn create_manual_backup(
    app_data_dir: &Path,
    connection: &Connection,
) -> std::io::Result<PathBuf> {
    create_open_database_backup(app_data_dir, connection)
}

/// Sauvegarde automatique régulière : crée une copie horodatée au plus une fois
/// par jour. La rotation (MAX_BACKUPS dernières) est gérée par
/// `create_pre_migration_backup`. Retourne `None` si une copie du jour existe déjà.
pub fn create_daily_backup_if_needed(
    app_data_dir: &Path,
    connection: &Connection,
) -> std::io::Result<Option<PathBuf>> {
    let db_path = app_data_dir.join("patrimoine-crm.db");
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

    Ok(Some(create_open_database_backup(app_data_dir, connection)?))
}

/// Restaure la base depuis une copie du dossier backups (nom de fichier uniquement).
/// Cree d'abord une copie de securite de la base actuelle si elle existe.
#[derive(Debug)]
pub struct RestoreDbFailure {
    error: io::Error,
    pub rollback_complete: bool,
}

impl std::fmt::Display for RestoreDbFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.error.fmt(formatter)
    }
}

impl std::error::Error for RestoreDbFailure {}

impl From<io::Error> for RestoreDbFailure {
    fn from(error: io::Error) -> Self {
        Self {
            error,
            rollback_complete: true,
        }
    }
}

pub fn restore_db_from_backup(
    app_data_dir: &Path,
    db_path: &Path,
    backup_filename: &str,
) -> Result<(PathBuf, Option<PathBuf>), RestoreDbFailure> {
    let backups_dir = app_data_dir.join("backups");
    let src = validate_db_backup(app_data_dir, backup_filename)?;
    let file_name = src
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Nom de fichier invalide"))?;
    let safety = if db_path.exists() {
        Some(create_pre_migration_backup(app_data_dir, db_path)?)
    } else {
        None
    };
    let target_documents = documents_storage::paired_documents_backup_dir_name(file_name)
        .map(|name| backups_dir.join(name))
        .filter(|path| path.is_dir());
    let target_config = crate::backup_sidecar::paired_config_backup_dir_name(file_name)
        .map(|name| backups_dir.join(name))
        .filter(|path| path.is_dir());

    let restore_result = (|| -> std::io::Result<()> {
        replace_database_atomically(&src, db_path)?;
        if let Some(documents) = &target_documents {
            documents_storage::restore_documents_from_backup(app_data_dir, documents)?;
            println!("✅ Documents restaurés depuis {:?}", documents);
        }
        if let Some(config) = &target_config {
            crate::backup_sidecar::restore_app_config_from_backup(app_data_dir, config)?;
            println!("✅ Config restaurée depuis {:?}", config);
        }
        Ok(())
    })();

    if let Err(restore_error) = restore_result {
        let rollback_result = safety
            .as_deref()
            .ok_or_else(|| io::Error::other("Aucune copie de sécurité disponible."))
            .and_then(|safety_path| {
                rollback_restore(
                    app_data_dir,
                    db_path,
                    safety_path,
                    target_documents.is_some(),
                    target_config.is_some(),
                )
            });
        return match rollback_result {
            Ok(()) => Err(RestoreDbFailure {
                error: restore_error,
                rollback_complete: true,
            }),
            Err(rollback_error) => Err(RestoreDbFailure {
                error: io::Error::new(
                    restore_error.kind(),
                    format!(
                        "Restauration échouée ({restore_error}) et rollback incomplet ({rollback_error})"
                    ),
                ),
                rollback_complete: false,
            }),
        };
    }

    Ok((src, safety))
}

fn replace_database_atomically(source: &Path, db_path: &Path) -> std::io::Result<()> {
    let parent = db_path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Chemin DB invalide"))?;
    let nonce = format!(
        "{}-{}",
        std::process::id(),
        chrono::Local::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let staged = parent.join(format!(".patrimoine-crm-restore-{nonce}.db"));
    let previous = parent.join(format!(".patrimoine-crm-rollback-{nonce}.db"));
    if let Err(error) = fs::copy(source, &staged) {
        let _ = fs::remove_file(&staged);
        return Err(error);
    }
    if let Err(error) = crate::export_archive::validate_database_file(&staged) {
        let _ = fs::remove_file(&staged);
        return Err(io::Error::other(error));
    }

    let had_live = db_path.is_file();
    if had_live {
        fs::rename(db_path, &previous)?;
    }
    if let Err(error) = fs::rename(&staged, db_path) {
        let rollback_error = had_live
            .then(|| fs::rename(&previous, db_path).err())
            .flatten();
        let _ = fs::remove_file(&staged);
        return match rollback_error {
            Some(rollback_error) => Err(io::Error::new(
                error.kind(),
                format!(
                    "Publication de la base échouée ({error}) et rollback incomplet ({rollback_error})"
                ),
            )),
            None => Err(error),
        };
    }
    if had_live {
        let _ = fs::remove_file(previous);
    }
    Ok(())
}

fn rollback_restore(
    app_data_dir: &Path,
    db_path: &Path,
    safety_path: &Path,
    target_documents_applied: bool,
    target_config_applied: bool,
) -> std::io::Result<()> {
    replace_database_atomically(safety_path, db_path)?;
    let backups_dir = app_data_dir.join("backups");
    let safety_name = safety_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Backup sécurité invalide"))?;

    if target_documents_applied {
        let safety_documents = documents_storage::paired_documents_backup_dir_name(safety_name)
            .map(|name| backups_dir.join(name));
        match safety_documents.filter(|path| path.is_dir()) {
            Some(documents) => {
                documents_storage::restore_documents_from_backup(app_data_dir, &documents)?
            }
            None => documents_storage::remove_documents_for_restore(app_data_dir)?,
        }
    }

    if target_config_applied {
        let safety_config = crate::backup_sidecar::paired_config_backup_dir_name(safety_name)
            .map(|name| backups_dir.join(name))
            .unwrap_or_else(|| backups_dir.join(".missing-config"));
        crate::backup_sidecar::restore_app_config_exact_from_backup(
            app_data_dir,
            &safety_config,
        )?;
    }
    Ok(())
}

pub fn validate_db_backup(
    app_data_dir: &Path,
    backup_filename: &str,
) -> std::io::Result<PathBuf> {
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
    crate::export_archive::validate_database_file(&src).map_err(io::Error::other)?;
    Ok(src)
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
        fs::write(app_data.join("secrets.key.os"), b"protected-key").expect("secrets");
        fs::write(app_data.join("runtime_prefs.json"), b"{}").expect("runtime prefs");
        let attachments = app_data.join("email-template-attachments");
        fs::create_dir_all(&attachments).expect("attachments");
        fs::write(attachments.join("modele.pdf"), b"attachment").expect("attachment");

        let backup_path =
            create_pre_migration_backup(&app_data, &db_path).expect("backup with docs");
        let stem = backup_path
            .file_stem()
            .and_then(|s| s.to_str())
            .expect("stem");
        let docs_backup = app_data.join("backups").join(format!("{stem}_documents"));
        assert!(docs_backup.join("test.pdf").is_file());

        let cfg_backup = app_data.join("backups").join(format!("{stem}_config"));
        assert!(cfg_backup.join("secrets.key.os").is_file());
        assert!(cfg_backup.join("runtime_prefs.json").is_file());
        assert!(cfg_backup
            .join("email-template-attachments/modele.pdf")
            .is_file());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn open_database_backup_is_consistent_and_does_not_modify_live_database() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("temp dir");
        let db_path = app_data.join("patrimoine-crm.db");
        write_marker_db(&db_path, "before");
        let source = Connection::open(&db_path).expect("open source");

        let backup_path =
            create_open_database_backup(&app_data, &source).expect("consistent backup");
        source
            .execute("UPDATE marker SET v = 'after'", [])
            .expect("update live");

        assert_eq!(read_marker(&backup_path), "before");
        assert_eq!(read_marker(&db_path), "after");
        crate::export_archive::validate_database_file(&backup_path).expect("integrity");
        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn external_backup_status_records_errors_success_and_cleanup() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        record_external_backup_error(&app_data, "Drive indisponible");
        let failed = load_external_backup_status(&app_data);
        assert_eq!(failed.last_error.as_deref(), Some("Drive indisponible"));
        assert!(failed.last_attempt_at.is_some());

        let archive = app_data.join("archive.zip");
        record_external_backup_success(&app_data, &archive);
        let succeeded = load_external_backup_status(&app_data);
        assert!(succeeded.last_error.is_none());
        assert_eq!(
            succeeded.last_success_path.as_deref(),
            Some(archive.to_string_lossy().as_ref())
        );

        clear_external_backup_status(&app_data);
        assert_eq!(
            load_external_backup_status(&app_data).last_attempt_at,
            None
        );
        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn backup_operation_lock_serializes_writers() {
        let first = lock_backup_operations().expect("first lock");
        let (sender, receiver) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _second = lock_backup_operations().expect("second lock");
            sender.send(()).expect("notify");
        });
        assert!(receiver
            .recv_timeout(std::time::Duration::from_millis(50))
            .is_err());
        drop(first);
        receiver
            .recv_timeout(std::time::Duration::from_secs(1))
            .expect("second writer released");
        worker.join().expect("worker");
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
        let source = Connection::open(&db_path).expect("open source");

        let first =
            create_daily_backup_if_needed(&app_data, &source).expect("première sauvegarde");
        assert!(first.is_some(), "la première sauvegarde du jour doit être créée");

        let second =
            create_daily_backup_if_needed(&app_data, &source).expect("seconde sauvegarde");
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
        let detached = Connection::open_in_memory().expect("memory source");

        let result =
            create_daily_backup_if_needed(&app_data, &detached).expect("pas d'erreur sans base");
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
        assert!(err.error.kind() == std::io::ErrorKind::InvalidInput);

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn restore_rejects_corrupted_backup_without_touching_live_database() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(app_data.join("backups")).expect("backups");
        let db_path = app_data.join("patrimoine-crm.db");
        write_marker_db(&db_path, "live");
        let backup_name = "patrimoine-crm_corrupted.db";
        fs::write(app_data.join("backups").join(backup_name), b"not sqlite").unwrap();

        let failure = restore_db_from_backup(&app_data, &db_path, backup_name)
            .expect_err("restore must fail");
        assert!(
            failure.rollback_complete,
            "prevalidation failure leaves the live database untouched"
        );
        assert_eq!(read_marker(&db_path), "live");
        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn restore_rolls_back_database_and_documents_when_config_restore_fails() {
        let app_data = unique_temp_dir();
        let backups = app_data.join("backups");
        fs::create_dir_all(&backups).expect("backups");
        let db_path = app_data.join("patrimoine-crm.db");
        write_marker_db(&db_path, "live");
        let live_documents = app_data.join("documents");
        fs::create_dir_all(&live_documents).expect("live documents");
        fs::write(live_documents.join("live.pdf"), b"live").expect("live document");

        let backup_name = "patrimoine-crm_20260719_235900_000.db";
        write_marker_db(&backups.join(backup_name), "target");
        let stem = backup_name.trim_end_matches(".db");
        let target_documents = backups.join(format!("{stem}_documents"));
        fs::create_dir_all(&target_documents).expect("target documents");
        fs::write(target_documents.join("target.pdf"), b"target").expect("target document");
        let target_config = backups.join(format!("{stem}_config"));
        fs::create_dir_all(&target_config).expect("target config");
        fs::write(target_config.join("auth.json"), b"{}").expect("target auth");
        fs::create_dir_all(app_data.join("auth.json")).expect("invalid live auth path");

        let failure = restore_db_from_backup(&app_data, &db_path, backup_name)
            .expect_err("restore must fail");
        assert!(
            !failure.rollback_complete,
            "a failed config rollback must keep the database closed"
        );
        assert_eq!(read_marker(&db_path), "live");
        assert!(live_documents.join("live.pdf").is_file());
        assert!(!live_documents.join("target.pdf").exists());
        let _ = fs::remove_dir_all(&app_data);
    }
}
