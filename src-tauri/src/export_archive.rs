use rusqlite::Connection;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// Copies locales redondantes — l'export contient déjà un snapshot cohérent de la base.
const EXPORT_SKIP_DIRS: &[&str] = &["backups"];

const README_CONTENT: &str = r#"Patrimoine CRM — Archive complete d'export
=========================================

Cette archive contient une copie de vos donnees au moment de l'export.
Votre base en cours d'utilisation n'a PAS ete modifiee lors de la creation de ce fichier.

Contenu (tout le dossier applicatif, sauf backups/ internes) :
- patrimoine-crm.db       : copie coherente de la base SQLite
- documents/              : PDF et pieces jointes
- logos/                  : logo du cabinet
- auth.json               : verrou d'acces (hash mot de passe)
- secrets.key             : cle locale de chiffrement des secrets
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
    let check: String = dest
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("Verification integrite snapshot : {e}"))?;
    if check != "ok" {
        return Err(format!("Snapshot incoherent : {check}"));
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

fn should_skip_entry(name: &str, is_dir: bool) -> bool {
    is_dir && EXPORT_SKIP_DIRS.iter().any(|skip| *skip == name)
}

/// Copie tout AppData dans temp, sauf la base live (snapshot separe) et backups/.
fn copy_app_data_tree(app_data_dir: &Path, temp_dir: &Path) -> Result<(), String> {
    for entry in fs::read_dir(app_data_dir).map_err(|e| format!("Lecture AppData : {e}"))? {
        let entry = entry.map_err(|e| format!("Entree AppData : {e}"))?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str == "patrimoine-crm.db" {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Type fichier {name_str} : {e}"))?;
        if should_skip_entry(&name_str, file_type.is_dir()) {
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
        zip.start_file(&name, options)
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
    if !input.destination_dir.is_dir() {
        return Err("Le dossier de destination est introuvable.".into());
    }

    let live_db_path = input.app_data_dir.join("patrimoine-crm.db");
    if !live_db_path.is_file() {
        return Err("Base de donnees introuvable.".into());
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let zip_name = format!("patrimoine-crm_export_{timestamp}.zip");
    let zip_path = input.destination_dir.join(&zip_name);

    if zip_path.exists() {
        return Err(format!(
            "Un fichier {zip_name} existe deja dans ce dossier. Choisissez un autre emplacement."
        ));
    }

    let temp_dir = std::env::temp_dir().join(format!(
        "patrimoine_crm_export_{}_{}",
        std::process::id(),
        timestamp
    ));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Dossier temporaire : {e}"))?;

    let cleanup = || {
        let _ = fs::remove_dir_all(&temp_dir);
    };

    if let Err(e) = copy_app_data_tree(input.app_data_dir, &temp_dir) {
        cleanup();
        return Err(e);
    }

    let snapshot_db = temp_dir.join("patrimoine-crm.db");
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

    let zip_file = File::create(&zip_path).map_err(|e| {
        cleanup();
        format!("Creation ZIP : {e}")
    })?;
    let mut zip = ZipWriter::new(zip_file);

    let zipped = zip_tree(&mut zip, &temp_dir, zip_options).map_err(|e| {
        cleanup();
        let _ = fs::remove_file(&zip_path);
        e
    })?;

    zip.finish().map_err(|e| {
        cleanup();
        let _ = fs::remove_file(&zip_path);
        format!("Finalisation ZIP : {e}")
    })?;

    cleanup();

    if !live_db_path.is_file() {
        let _ = fs::remove_file(&zip_path);
        return Err("La base d'origine est introuvable apres l'export.".into());
    }

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
        std::env::temp_dir().join(format!(
            "patrimoine_crm_export_test_{}_{}",
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
    fn copy_app_data_tree_includes_secrets_and_skips_backups() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data.join("backups")).expect("backups");
        fs::write(app_data.join("backups/old.db"), b"x").expect("backup");
        fs::write(app_data.join("secrets.key"), b"key").expect("secrets");
        fs::write(app_data.join("email_oauth.json"), b"{}").expect("oauth");
        write_marker_db(&app_data.join("patrimoine-crm.db"), "live");

        let temp = unique_temp_dir();
        fs::create_dir_all(&temp).expect("temp");
        copy_app_data_tree(&app_data, &temp).expect("copy tree");

        assert!(temp.join("secrets.key").is_file());
        assert!(temp.join("email_oauth.json").is_file());
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
        fs::write(app_data.join("secrets.key"), b"secret-key-bytes").expect("secrets");
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
        assert!(archive.by_name("secrets.key").is_ok());
        assert!(archive.by_name("auth.json").is_ok());
        assert!(archive.by_name("documents/test.pdf").is_ok());

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
}
