use chrono::{Datelike, Timelike};
use rusqlite::Connection;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// Copies locales redondantes — l'export contient déjà un snapshot cohérent de la base.
const EXPORT_SKIP_DIRS: &[&str] = &["backups"];
const EXPORT_SKIP_FILES: &[&str] = &["external_backup_status.json"];
const AUTOMATIC_ARCHIVE_PREFIX: &str = "patrimoine-crm_auto_";
const MAX_AUTOMATIC_ARCHIVES: usize = 10;
static EXPORT_COUNTER: AtomicU64 = AtomicU64::new(0);

const README_CONTENT: &str = r#"Patrimoine CRM — Archive complete d'export
=========================================

Cette archive contient une copie de vos donnees au moment de l'export.
Votre base en cours d'utilisation n'a PAS ete modifiee lors de la creation de ce fichier.

Contenu (tout le dossier applicatif, sauf backups/ internes) :
- patrimoine-crm.db       : copie coherente de la base SQLite
- documents/              : PDF et pieces jointes
- logos/                  : logo du cabinet
- auth.json               : verrou d'acces (hash mot de passe)
- branding.json           : nom et logo affiches dans l'application (ecran de connexion)
- secrets.key.os          : cle locale protegee par Windows/macOS
- email_oauth.json        : connexion email OAuth (tokens chiffres)
- newsletter_config.json  : reglages newsletter / Mistral (si presents)
- autres fichiers de configuration eventuels

Restauration manuelle (CRM ferme) :
1. Fermez completement Patrimoine CRM
2. Sauvegardez l'ancien dossier :
   %APPDATA%\com.patrimoine-crm.app\
3. Extrayez TOUT le contenu de cette archive dans ce dossier
   (remplace patrimoine-crm.db, documents/, auth.json, etc.)
4. Relancez le CRM

Important : la base et les documents restent restaurables sur tout poste. En revanche,
la cle des secrets est liee au compte Windows ou au Trousseau macOS d'origine.
Sur un autre poste, reconnectez OAuth et ressaisissez les cles API.

Note : la restauration depuis l'application (Parametres > Donnees > Restaurer)
ne concerne que les copies locales dans backups/ — pas cette archive ZIP externe.
"#;

/// Copie coherente de la base ouverte via l'API backup SQLite (lecture seule sur la source).
pub fn create_consistent_db_snapshot(source: &Connection, dest_path: &Path) -> Result<(), String> {
    if dest_path.exists() {
        fs::remove_file(dest_path).map_err(|e| format!("Impossible d'effacer le fichier temporaire : {e}"))?;
    }
    let mut dest = Connection::open(dest_path)
        .map_err(|e| format!("Impossible de creer le snapshot : {e}"))?;
    {
        let backup = rusqlite::backup::Backup::new(source, &mut dest)
            .map_err(|e| format!("Echec backup SQLite : {e}"))?;
        backup
            .run_to_completion(100, std::time::Duration::from_millis(10), None)
            .map_err(|e| format!("Echec copie backup SQLite : {e}"))?;
    }
    drop(dest);
    validate_database_file(dest_path)
}

pub fn validate_database_file(path: &Path) -> Result<(), String> {
    let connection = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Ouverture de la copie SQLite impossible : {e}"))?;
    let check: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("Vérification intégrité SQLite : {e}"))?;
    if check != "ok" {
        return Err(format!("Copie SQLite incohérente : {check}"));
    }
    Ok(())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
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

fn should_skip_entry(name: &str, is_dir: bool, has_protected_key: bool) -> bool {
    (is_dir && EXPORT_SKIP_DIRS.iter().any(|skip| *skip == name))
        || (!is_dir && EXPORT_SKIP_FILES.iter().any(|skip| *skip == name))
        || (has_protected_key
            && !is_dir
            && (name == "secrets.key" || name.starts_with("secrets.key.conflict-")))
}

/// Copie tout AppData dans temp, sauf la base active (snapshot séparé), ses
/// fichiers WAL/SHM et les caches temporaires.
fn copy_app_data_tree(
    app_data_dir: &Path,
    temp_dir: &Path,
    active_db_name: &str,
) -> Result<(), String> {
    let has_protected_key = app_data_dir.join("secrets.key.os").is_file();
    for entry in fs::read_dir(app_data_dir).map_err(|e| format!("Lecture AppData : {e}"))? {
        let entry = entry.map_err(|e| format!("Entree AppData : {e}"))?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str == active_db_name
            || name_str == format!("{active_db_name}-wal")
            || name_str == format!("{active_db_name}-shm")
            || name_str == crate::workspace::cache::TEAM_CACHE_TEMP_FILE
            || name_str == format!("{}-wal", crate::workspace::cache::TEAM_CACHE_TEMP_FILE)
            || name_str == format!("{}-shm", crate::workspace::cache::TEAM_CACHE_TEMP_FILE)
            || name_str == crate::workspace::cache::TEAM_CACHE_SEALED_FILE
            || name_str.starts_with(&format!(
                "{}.",
                crate::workspace::cache::TEAM_CACHE_DATABASE_FILE
            ))
        {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Type fichier {name_str} : {e}"))?;
        if should_skip_entry(&name_str, file_type.is_dir(), has_protected_key) {
            continue;
        }
        let from = entry.path();
        let to = temp_dir.join(&name);
        if file_type.is_dir() {
            copy_dir_all(&from, &to).map_err(|e| format!("Copie dossier {name_str} : {e}"))?;
        } else if file_type.is_file() {
            fs::copy(&from, &to).map_err(|e| format!("Copie fichier {name_str} : {e}"))?;
        }
    }
    Ok(())
}

fn count_files_in_tree(dir: &Path) -> usize {
    if !dir.is_dir() {
        return 0;
    }
    WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .count()
}

fn safe_zip_entry_name(base: &Path, file: &Path) -> Option<String> {
    let rel = file.strip_prefix(base).ok()?;
    let mut parts = Vec::new();
    for component in rel.components() {
        match component {
            Component::Normal(name) => {
                let s = name.to_string_lossy();
                if s.is_empty() || s == "." || s == ".." {
                    return None;
                }
                parts.push(s.into_owned());
            }
            Component::CurDir => {}
            _ => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

fn zip_tree<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    base_dir: &Path,
    options: SimpleFileOptions,
) -> Result<usize, String> {
    let mut count = 0usize;
    for entry in WalkDir::new(base_dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = safe_zip_entry_name(base_dir, path) else {
            continue;
        };
        let modified = fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .map(chrono::DateTime::<chrono::Local>::from)
            .unwrap_or_else(|_| chrono::Local::now());
        let modified = if (1980..=2107).contains(&modified.year()) {
            modified
        } else {
            chrono::Local::now()
        };
        let zip_modified = zip::DateTime::from_date_and_time(
            modified.year() as u16,
            modified.month() as u8,
            modified.day() as u8,
            modified.hour() as u8,
            modified.minute() as u8,
            modified.second() as u8,
        )
        .unwrap_or_default();
        zip.start_file(&name, options.last_modified_time(zip_modified))
            .map_err(|e| format!("Erreur ZIP : {e}"))?;
        let mut file = File::open(path).map_err(|e| format!("Lecture {name} : {e}"))?;
        std::io::copy(&mut file, zip).map_err(|e| format!("Ecriture ZIP {name} : {e}"))?;
        count += 1;
    }
    Ok(count)
}

pub struct ExportArchiveInput<'a> {
    pub source_db: &'a Connection,
    pub app_data_dir: &'a Path,
    pub destination_dir: &'a Path,
}

pub struct ExportArchiveOutput {
    pub zip_path: PathBuf,
    pub zip_size: u64,
    pub files_included: usize,
}

/// Export lecture seule : snapshot DB + integralite AppData vers un ZIP externe.
pub fn export_full_archive(input: ExportArchiveInput<'_>) -> Result<ExportArchiveOutput, String> {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let zip_name = format!("patrimoine-crm_export_{timestamp}.zip");
    export_archive_named(input, &zip_name)
}

pub fn export_automatic_archive_if_due(
    input: ExportArchiveInput<'_>,
    force: bool,
) -> Result<Option<ExportArchiveOutput>, String> {
    if !input.destination_dir.is_dir() {
        return Err("Le dossier de destination est introuvable.".into());
    }
    let date = chrono::Local::now().format("%Y%m%d").to_string();
    let daily_prefix = format!("{AUTOMATIC_ARCHIVE_PREFIX}{date}_");
    if !force
        && automatic_archives(input.destination_dir)?
            .iter()
            .any(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with(&daily_prefix))
            })
    {
        return Ok(None);
    }
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let zip_name = format!("{AUTOMATIC_ARCHIVE_PREFIX}{timestamp}.zip");
    let output = export_archive_named(input, &zip_name)?;
    prune_automatic_archives(
        output
            .zip_path
            .parent()
            .ok_or("Dossier de sauvegarde externe invalide.")?,
    )?;
    Ok(Some(output))
}

pub fn latest_automatic_archive(destination_dir: &Path) -> Result<Option<PathBuf>, String> {
    Ok(automatic_archives(destination_dir)?.pop())
}

fn automatic_archives(destination_dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !destination_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut archives: Vec<PathBuf> = fs::read_dir(destination_dir)
        .map_err(|error| format!("Lecture du dossier de sauvegarde externe : {error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name();
            let name = name.to_str()?;
            (entry.path().is_file()
                && name.starts_with(AUTOMATIC_ARCHIVE_PREFIX)
                && name.ends_with(".zip"))
            .then(|| entry.path())
        })
        .collect();
    archives.sort();
    Ok(archives)
}

fn prune_automatic_archives(destination_dir: &Path) -> Result<(), String> {
    let archives = automatic_archives(destination_dir)?;
    let excess = archives.len().saturating_sub(MAX_AUTOMATIC_ARCHIVES);
    for path in archives.into_iter().take(excess) {
        fs::remove_file(&path)
            .map_err(|error| format!("Suppression de l'ancienne archive externe : {error}"))?;
    }
    Ok(())
}

fn cleanup_stale_partial_archives(destination_dir: &Path) -> Result<(), String> {
    let stale_after = std::time::Duration::from_secs(24 * 60 * 60);
    let now = std::time::SystemTime::now();
    for entry in fs::read_dir(destination_dir)
        .map_err(|error| format!("Lecture du dossier de sauvegarde externe : {error}"))?
        .filter_map(Result::ok)
    {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.starts_with(".patrimoine-crm_") || !name.contains(".zip.partial-") {
            continue;
        }
        let path = entry.path();
        let is_stale = path
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age >= stale_after);
        if is_stale {
            fs::remove_file(path)
                .map_err(|error| format!("Nettoyage d'une archive partielle : {error}"))?;
        }
    }
    Ok(())
}

fn export_archive_named(
    input: ExportArchiveInput<'_>,
    zip_name: &str,
) -> Result<ExportArchiveOutput, String> {
    if !input.destination_dir.is_dir() {
        return Err("Le dossier de destination est introuvable.".into());
    }
    cleanup_stale_partial_archives(input.destination_dir)?;

    let source_path: String = input
        .source_db
        .query_row(
            "SELECT file FROM pragma_database_list WHERE name = 'main'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Chemin de la base active introuvable : {error}"))?;
    let active_db_name = Path::new(&source_path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| {
            *name == "patrimoine-crm.db"
                || *name == crate::workspace::cache::TEAM_CACHE_DATABASE_FILE
        })
        .ok_or_else(|| "Nom de base active non autorisé pour l'archive.".to_string())?;
    let live_db_path = input.app_data_dir.join(active_db_name);
    if !live_db_path.is_file() {
        return Err("Base de donnees introuvable.".into());
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let zip_path = input.destination_dir.join(zip_name);
    let partial_zip_path = input
        .destination_dir
        .join(format!(".{zip_name}.partial-{}", std::process::id()));

    if zip_path.exists() {
        return Err(format!(
            "Un fichier {zip_name} existe deja dans ce dossier. Choisissez un autre emplacement."
        ));
    }

    let temp_dir = std::env::temp_dir().join(format!(
        "patrimoine_crm_export_{}_{}_{}",
        std::process::id(),
        timestamp,
        EXPORT_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Dossier temporaire : {e}"))?;

    let cleanup = || {
        let _ = fs::remove_dir_all(&temp_dir);
    };

    if let Err(e) = copy_app_data_tree(input.app_data_dir, &temp_dir, active_db_name) {
        cleanup();
        return Err(e);
    }

    let snapshot_db = temp_dir.join(active_db_name);
    if let Err(e) = create_consistent_db_snapshot(input.source_db, &snapshot_db) {
        cleanup();
        return Err(e);
    }

    let readme_path = temp_dir.join("LISEZMOI.txt");
    if let Err(e) = fs::write(&readme_path, README_CONTENT) {
        cleanup();
        return Err(format!("Ecriture LISEZMOI : {e}"));
    }

    let files_included = count_files_in_tree(&temp_dir);
    let zip_options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let zip_file = File::create(&partial_zip_path).map_err(|e| {
        cleanup();
        format!("Creation ZIP : {e}")
    })?;
    let mut zip = ZipWriter::new(zip_file);

    let zipped = zip_tree(&mut zip, &temp_dir, zip_options).map_err(|e| {
        cleanup();
        let _ = fs::remove_file(&partial_zip_path);
        e
    })?;

    zip.finish().map_err(|e| {
        cleanup();
        let _ = fs::remove_file(&partial_zip_path);
        format!("Finalisation ZIP : {e}")
    })?;

    cleanup();

    if !live_db_path.is_file() {
        let _ = fs::remove_file(&partial_zip_path);
        return Err("La base d'origine est introuvable apres l'export.".into());
    }
    fs::rename(&partial_zip_path, &zip_path).map_err(|error| {
        let _ = fs::remove_file(&partial_zip_path);
        format!("Publication de l'archive ZIP : {error}")
    })?;

    let zip_size = fs::metadata(&zip_path)
        .map_err(|e| format!("Taille ZIP : {e}"))?
        .len();

    Ok(ExportArchiveOutput {
        zip_path,
        zip_size,
        files_included: zipped.max(files_included),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "patrimoine_crm_export_test_{}_{}",
            std::process::id(),
            n
        ));
        let _ = fs::remove_dir_all(&path);
        path
    }

    fn write_marker_db(path: &Path, value: &str) {
        let conn = Connection::open(path).expect("open db");
        conn.execute("CREATE TABLE marker (v TEXT NOT NULL)", [])
            .expect("create marker");
        conn.execute("INSERT INTO marker (v) VALUES (?1)", [value])
            .expect("insert marker");
    }

    #[test]
    fn consistent_snapshot_preserves_data_while_source_still_writable() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).expect("temp dir");
        let live = dir.join("patrimoine-crm.db");
        write_marker_db(&live, "live");

        let source = Connection::open(&live).expect("open live");
        let snapshot = dir.join("snapshot.db");
        create_consistent_db_snapshot(&source, &snapshot).expect("snapshot");

        source
            .execute("INSERT INTO marker (v) VALUES ('after')", [])
            .expect("write after snapshot");

        let snap_val: String = Connection::open(&snapshot)
            .expect("open snap")
            .query_row("SELECT v FROM marker LIMIT 1", [], |row| row.get(0))
            .expect("read snap");
        assert_eq!(snap_val, "live");

        let live_count: i64 = source
            .query_row("SELECT COUNT(*) FROM marker", [], |row| row.get(0))
            .expect("count live");
        assert_eq!(live_count, 2);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn database_integrity_check_rejects_corrupted_files() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).expect("temp dir");
        let corrupted = dir.join("corrupted.db");
        fs::write(&corrupted, b"not a sqlite database").expect("corrupted db");

        assert!(validate_database_file(&corrupted).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn copy_app_data_tree_includes_secrets_and_skips_backups() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data.join("backups")).expect("backups");
        fs::write(app_data.join("backups/old.db"), b"x").expect("backup");
        fs::write(app_data.join("secrets.key.os"), b"protected-key").expect("secrets");
        fs::write(app_data.join("secrets.key"), b"legacy-key").expect("legacy secrets");
        fs::write(
            app_data.join("secrets.key.conflict-123"),
            b"conflicting-key",
        )
        .expect("conflicting secrets");
        fs::write(app_data.join("email_oauth.json"), b"{}").expect("oauth");
        fs::write(app_data.join("external_backup_status.json"), b"{}").expect("status");
        write_marker_db(&app_data.join("patrimoine-crm.db"), "live");

        let temp = unique_temp_dir();
        fs::create_dir_all(&temp).expect("temp");
        copy_app_data_tree(&app_data, &temp, "patrimoine-crm.db").expect("copy tree");

        assert!(temp.join("secrets.key.os").is_file());
        assert!(!temp.join("secrets.key").exists());
        assert!(!temp.join("secrets.key.conflict-123").exists());
        assert!(temp.join("email_oauth.json").is_file());
        assert!(!temp.join("external_backup_status.json").exists());
        assert!(!temp.join("backups").exists());
        assert!(!temp.join("patrimoine-crm.db").exists());

        let _ = fs::remove_dir_all(&app_data);
        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn export_full_archive_creates_zip_without_touching_live_db() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let live_db = app_data.join("patrimoine-crm.db");
        write_marker_db(&live_db, "original");

        let docs = app_data.join("documents");
        fs::create_dir_all(&docs).expect("docs dir");
        fs::write(docs.join("test.pdf"), b"pdf-content").expect("write pdf");
        fs::write(app_data.join("secrets.key.os"), b"protected-key").expect("secrets");
        fs::write(app_data.join("auth.json"), br#"{"password_hash":"x"}"#).expect("auth");

        let dest = unique_temp_dir();
        fs::create_dir_all(&dest).expect("dest dir");

        let source = Connection::open(&live_db).expect("open live");
        let before = fs::read(&live_db).expect("read live before");

        let result = export_full_archive(ExportArchiveInput {
            source_db: &source,
            app_data_dir: &app_data,
            destination_dir: &dest,
        })
        .expect("export");

        assert!(result.zip_path.is_file());
        assert!(result.files_included >= 4);

        let after = fs::read(&live_db).expect("read live after");
        assert_eq!(before, after, "live db bytes must be unchanged");

        let file = File::open(&result.zip_path).expect("open zip");
        let mut archive = zip::read::ZipArchive::new(file).expect("read zip");
        assert!(archive.by_name("secrets.key.os").is_ok());
        assert!(archive.by_name("auth.json").is_ok());
        assert!(archive.by_name("documents/test.pdf").is_ok());
        let auth_modified = archive
            .by_name("auth.json")
            .expect("auth entry")
            .last_modified()
            .expect("auth modified date");
        assert!(
            auth_modified.year() >= 2020,
            "ZIP entry timestamp must be a real date"
        );

        let mut db_entry = archive.by_name("patrimoine-crm.db").expect("db in zip");
        let extracted = app_data.join("from_zip.db");
        {
            let mut out = File::create(&extracted).expect("extract db");
            std::io::copy(&mut db_entry, &mut out).expect("copy db from zip");
        }
        let check: String = Connection::open(&extracted)
            .expect("open extracted")
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .expect("integrity");
        assert_eq!(check, "ok");

        let _ = fs::remove_dir_all(&app_data);
        let _ = fs::remove_dir_all(&dest);
    }

    #[test]
    fn team_archive_snapshots_active_cache_and_keeps_historical_database() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let historical_db = app_data.join("patrimoine-crm.db");
        let team_db = app_data.join(crate::workspace::cache::TEAM_CACHE_DATABASE_FILE);
        write_marker_db(&historical_db, "historical");
        write_marker_db(&team_db, "team-active");
        let destination = unique_temp_dir();
        fs::create_dir_all(&destination).expect("destination");

        let source = Connection::open(&team_db).expect("open team cache");
        let result = export_full_archive(ExportArchiveInput {
            source_db: &source,
            app_data_dir: &app_data,
            destination_dir: &destination,
        })
        .expect("team export");

        let file = File::open(&result.zip_path).expect("open zip");
        let mut archive = zip::read::ZipArchive::new(file).expect("read zip");
        assert!(archive
            .by_name(crate::workspace::cache::TEAM_CACHE_DATABASE_FILE)
            .is_ok());
        assert!(archive.by_name("patrimoine-crm.db").is_ok());

        let _ = fs::remove_dir_all(&app_data);
        let _ = fs::remove_dir_all(&destination);
    }

    #[test]
    fn automatic_archive_runs_once_per_day_and_rotates_to_ten_files() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        let live_db = app_data.join("patrimoine-crm.db");
        write_marker_db(&live_db, "original");
        let destination = unique_temp_dir();
        fs::create_dir_all(&destination).expect("destination");
        let source = Connection::open(&live_db).expect("source");

        let first = export_automatic_archive_if_due(
            ExportArchiveInput {
                source_db: &source,
                app_data_dir: &app_data,
                destination_dir: &destination,
            },
            false,
        )
        .expect("first automatic archive");
        assert!(first.is_some());
        let second = export_automatic_archive_if_due(
            ExportArchiveInput {
                source_db: &source,
                app_data_dir: &app_data,
                destination_dir: &destination,
            },
            false,
        )
        .expect("daily deduplication");
        assert!(second.is_none());

        for index in 0..11 {
            fs::write(
                destination.join(format!(
                    "{AUTOMATIC_ARCHIVE_PREFIX}202001{:02}_000000_000.zip",
                    index + 1
                )),
                b"old",
            )
            .unwrap();
        }
        prune_automatic_archives(&destination).expect("rotation");
        assert_eq!(
            automatic_archives(&destination).expect("archives").len(),
            MAX_AUTOMATIC_ARCHIVES
        );

        let _ = fs::remove_dir_all(&app_data);
        let _ = fs::remove_dir_all(&destination);
    }
}
