//! Scellement du cache SQLite équipe lorsqu'aucune session CRM n'est ouverte.

use crate::database::Database;
use crate::workspace::cache::{
    is_historical_database_path, is_team_cache_artifact_name, team_cache_database_path,
    team_cache_sealed_path, TEAM_CACHE_DATABASE_FILE,
};
use crate::workspace::team_cache_key::{session_dek, wipe_session_dek};
use crate::workspace::enrollment::load_workspace_enrollment;
use atomic_write_file::AtomicWriteFile;
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const MAGIC: &[u8; 12] = b"CRMTEAMDBV1\0";
const CHUNK_SIZE: usize = 1024 * 1024;
const TAG_SIZE: usize = 16;
const HEADER_SIZE: usize = MAGIC.len() + 4 + 8 + 16;

fn temporary_sibling(path: &Path, suffix: &str) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(TEAM_CACHE_DATABASE_FILE);
    path.with_file_name(format!("{name}.{suffix}"))
}

fn nonce(prefix: &[u8; 16], index: u64) -> [u8; 24] {
    let mut value = [0_u8; 24];
    value[..16].copy_from_slice(prefix);
    value[16..].copy_from_slice(&index.to_be_bytes());
    value
}

fn associated_data(header: &[u8], index: u64, plain_len: usize) -> Vec<u8> {
    let mut value = Vec::with_capacity(header.len() + 16);
    value.extend_from_slice(header);
    value.extend_from_slice(&index.to_be_bytes());
    value.extend_from_slice(&(plain_len as u64).to_be_bytes());
    value
}

fn read_header(input: &mut File) -> Result<(Vec<u8>, u64, [u8; 16]), String> {
    let mut header = vec![0_u8; HEADER_SIZE];
    input
        .read_exact(&mut header)
        .map_err(|error| format!("En-tête du cache scellé illisible : {error}"))?;
    if &header[..MAGIC.len()] != MAGIC {
        return Err("Format du cache équipe scellé non reconnu.".into());
    }
    let chunk_size = u32::from_be_bytes(
        header[MAGIC.len()..MAGIC.len() + 4]
            .try_into()
            .map_err(|_| "Taille de bloc scellé invalide.")?,
    ) as usize;
    if chunk_size != CHUNK_SIZE {
        return Err("Taille de bloc du cache scellé non supportée.".into());
    }
    let length_offset = MAGIC.len() + 4;
    let plain_len = u64::from_be_bytes(
        header[length_offset..length_offset + 8]
            .try_into()
            .map_err(|_| "Longueur du cache scellé invalide.")?,
    );
    let mut prefix = [0_u8; 16];
    prefix.copy_from_slice(&header[length_offset + 8..]);
    Ok((header, plain_len, prefix))
}

fn assert_team_cache_artifact(path: &Path) -> Result<(), String> {
    if is_historical_database_path(path) {
        return Err(
            "Refus de modifier patrimoine-crm.db : le cache équipe est un fichier séparé.".into(),
        );
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !is_team_cache_artifact_name(name) {
        return Err(format!(
            "Refus d'opérer sur un fichier hors cache équipe : {name}"
        ));
    }
    Ok(())
}

fn encrypt_database_file(source: &Path, destination: &Path, key: &[u8; 32]) -> Result<(), String> {
    assert_team_cache_artifact(source)?;
    assert_team_cache_artifact(destination)?;
    let plain_len = fs::metadata(source)
        .map_err(|error| format!("Métadonnées du cache équipe inaccessibles : {error}"))?
        .len();
    if plain_len == 0 {
        return Err("Le cache équipe à sceller est vide.".into());
    }
    let mut prefix = [0_u8; 16];
    OsRng.fill_bytes(&mut prefix);
    let mut header = Vec::with_capacity(HEADER_SIZE);
    header.extend_from_slice(MAGIC);
    header.extend_from_slice(&(CHUNK_SIZE as u32).to_be_bytes());
    header.extend_from_slice(&plain_len.to_be_bytes());
    header.extend_from_slice(&prefix);

    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| "Clé locale de cache invalide.".to_string())?;
    let mut input =
        File::open(source).map_err(|error| format!("Lecture du cache à sceller : {error}"))?;
    let mut output = AtomicWriteFile::options()
        .open(destination)
        .map_err(|error| format!("Création du cache scellé : {error}"))?;
    output
        .write_all(&header)
        .map_err(|error| format!("Écriture de l'en-tête scellé : {error}"))?;
    let mut buffer = vec![0_u8; CHUNK_SIZE];
    let mut index = 0_u64;
    loop {
        let read = input
            .read(&mut buffer)
            .map_err(|error| format!("Lecture du cache équipe : {error}"))?;
        if read == 0 {
            break;
        }
        let nonce_value = nonce(&prefix, index);
        let nonce_value = XNonce::try_from(nonce_value.as_slice())
            .map_err(|_| "Nonce du cache équipe invalide.".to_string())?;
        let aad = associated_data(&header, index, read);
        let encrypted = cipher
            .encrypt(
                &nonce_value,
                Payload {
                    msg: &buffer[..read],
                    aad: &aad,
                },
            )
            .map_err(|_| "Chiffrement du cache équipe impossible.".to_string())?;
        output
            .write_all(&(encrypted.len() as u32).to_be_bytes())
            .and_then(|_| output.write_all(&encrypted))
            .map_err(|error| format!("Écriture du cache scellé : {error}"))?;
        index += 1;
    }
    output
        .commit()
        .map_err(|error| format!("Validation atomique du cache scellé : {error}"))
}

fn decrypt_database_file(source: &Path, destination: &Path, key: &[u8; 32]) -> Result<(), String> {
    assert_team_cache_artifact(source)?;
    assert_team_cache_artifact(destination)?;
    let mut input =
        File::open(source).map_err(|error| format!("Lecture du cache scellé : {error}"))?;
    let (header, plain_len, prefix) = read_header(&mut input)?;
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| "Clé locale de cache invalide.".to_string())?;
    let mut output =
        File::create(destination).map_err(|error| format!("Création du cache déchiffré : {error}"))?;
    let mut written = 0_u64;
    let mut index = 0_u64;
    while written < plain_len {
        let expected_plain = usize::try_from((plain_len - written).min(CHUNK_SIZE as u64))
            .map_err(|_| "Longueur du cache scellé invalide.".to_string())?;
        let mut size = [0_u8; 4];
        input
            .read_exact(&mut size)
            .map_err(|error| format!("Bloc du cache scellé incomplet : {error}"))?;
        let encrypted_len = u32::from_be_bytes(size) as usize;
        if encrypted_len != expected_plain + TAG_SIZE {
            return Err("Taille d'un bloc du cache scellé invalide.".into());
        }
        let mut encrypted = vec![0_u8; encrypted_len];
        input
            .read_exact(&mut encrypted)
            .map_err(|error| format!("Bloc du cache scellé tronqué : {error}"))?;
        let nonce_value = nonce(&prefix, index);
        let nonce_value = XNonce::try_from(nonce_value.as_slice())
            .map_err(|_| "Nonce du cache équipe invalide.".to_string())?;
        let aad = associated_data(&header, index, expected_plain);
        let plain = cipher
            .decrypt(
                &nonce_value,
                Payload {
                    msg: &encrypted,
                    aad: &aad,
                },
            )
            .map_err(|_| "Cache équipe scellé invalide, altéré ou lié à une autre clé.".to_string())?;
        output
            .write_all(&plain)
            .map_err(|error| format!("Écriture du cache déchiffré : {error}"))?;
        written += plain.len() as u64;
        index += 1;
    }
    let mut trailing = [0_u8; 1];
    if input
        .read(&mut trailing)
        .map_err(|error| format!("Contrôle de fin du cache scellé : {error}"))?
        != 0
    {
        return Err("Données supplémentaires inattendues dans le cache scellé.".into());
    }
    output
        .sync_all()
        .map_err(|error| format!("Synchronisation du cache déchiffré : {error}"))
}

fn file_sha256(path: &Path) -> Result<[u8; 32], String> {
    let mut input = File::open(path).map_err(|error| error.to_string())?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; CHUNK_SIZE];
    loop {
        let read = input.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(digest.finalize().into())
}

fn remove_sqlite_artifacts(path: &Path) {
    for candidate in [
        path.to_path_buf(),
        PathBuf::from(format!("{}-wal", path.display())),
        PathBuf::from(format!("{}-shm", path.display())),
        PathBuf::from(format!("{}-journal", path.display())),
    ] {
        if candidate.exists() {
            let _ = fs::remove_file(candidate);
        }
    }
}

pub fn wipe_plaintext_team_cache(app: &AppHandle) -> Result<(), String> {
    let database_path = team_cache_database_path(app)?;
    wipe_plaintext_cache_files(&database_path)
}

pub(crate) fn wipe_plaintext_cache_files(path: &Path) -> Result<(), String> {
    assert_team_cache_artifact(path)?;
    remove_plaintext_cache_artifacts_checked(path)?;
    for suffix in ["unseal", "seal-snapshot", "seal-verify"] {
        remove_sqlite_artifacts(&temporary_sibling(path, suffix));
    }
    Ok(())
}

fn remove_plaintext_cache_artifacts_checked(path: &Path) -> Result<(), String> {
    for candidate in [
        PathBuf::from(format!("{}-wal", path.display())),
        PathBuf::from(format!("{}-shm", path.display())),
        PathBuf::from(format!("{}-journal", path.display())),
        path.with_extension("db.before-rebuild"),
        path.to_path_buf(),
    ] {
        if candidate.exists() {
            fs::remove_file(&candidate).map_err(|error| {
                format!(
                    "Suppression du cache clair {} impossible : {error}",
                    candidate.display()
                )
            })?;
        }
    }
    Ok(())
}

fn latest_plaintext_modified(path: &Path) -> Option<std::time::SystemTime> {
    [
        path.to_path_buf(),
        PathBuf::from(format!("{}-wal", path.display())),
        PathBuf::from(format!("{}-shm", path.display())),
        PathBuf::from(format!("{}-journal", path.display())),
    ]
    .into_iter()
    .filter_map(|candidate| fs::metadata(candidate).ok()?.modified().ok())
    .max()
}

fn plaintext_is_at_least_as_recent(
    clear_modified: Option<std::time::SystemTime>,
    sealed_modified: Option<std::time::SystemTime>,
) -> bool {
    matches!(
        (clear_modified, sealed_modified),
        (Some(clear), Some(sealed)) if clear >= sealed
    )
}

fn validate_plaintext_cache(path: &Path) -> Result<(), String> {
    crate::export_archive::validate_database_file(path)
        .map_err(|error| format!("Cache équipe clair invalide : {error}"))
}

fn backup_sqlite_file_into_memory(source: &Path) -> Result<Connection, String> {
    validate_plaintext_cache(source)?;
    let source_conn = Connection::open_with_flags(
        source,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| format!("Ouverture du cache équipe source : {error}"))?;
    let mut memory = Connection::open_in_memory()
        .map_err(|error| format!("Création du cache équipe mémoire : {error}"))?;
    {
        let backup = rusqlite::backup::Backup::new(&source_conn, &mut memory)
            .map_err(|error| format!("Préparation du cache équipe mémoire : {error}"))?;
        backup
            .run_to_completion(64, std::time::Duration::from_millis(10), None)
            .map_err(|error| format!("Chargement du cache équipe en mémoire : {error}"))?;
    }
    drop(source_conn);
    memory
        .execute("PRAGMA foreign_keys = ON", [])
        .map_err(|error| format!("Activation des clés étrangères du cache équipe : {error}"))?;
    crate::licensing::install_authorizer(&memory);
    Ok(memory)
}

fn decrypt_sealed_cache(sealed_path: &Path, destination: &Path) -> Result<(), String> {
    let dek = session_dek()?;
    decrypt_database_file(sealed_path, destination, &dek)
}

/// Charge le cache équipe en mémoire. Aucun SQLite clair n'est laissé comme
/// fichier de session : le disque ne conserve que `.sealed` après un checkpoint.
pub fn open_team_cache_connection(app: &AppHandle) -> Result<Connection, String> {
    let Some(enrollment) = load_workspace_enrollment(app)? else {
        return Err("Enrôlement équipe absent.".into());
    };
    if !enrollment.sync_activated {
        return Err("La synchronisation équipe n'est pas activée sur ce poste.".into());
    }
    let database_path = team_cache_database_path(app)?;
    assert_team_cache_artifact(&database_path)?;
    let sealed_path = team_cache_sealed_path(app)?;
    recover_sealed_path(&sealed_path)?;
    let unsealed_path = temporary_sibling(&database_path, "unseal");
    remove_sqlite_artifacts(&unsealed_path);

    let source = if sealed_path.is_file() {
        let use_plaintext = database_path.is_file() && {
            let clear_modified = latest_plaintext_modified(&database_path);
            let sealed_modified = fs::metadata(&sealed_path)
                .ok()
                .and_then(|metadata| metadata.modified().ok());
            plaintext_is_at_least_as_recent(clear_modified, sealed_modified)
        };
        if use_plaintext {
            database_path.clone()
        } else {
            decrypt_sealed_cache(&sealed_path, &unsealed_path)?;
            crate::export_archive::validate_database_file(&unsealed_path).map_err(|error| {
                remove_sqlite_artifacts(&unsealed_path);
                format!("Cache équipe scellé invalide : {error}")
            })?;
            unsealed_path.clone()
        }
    } else if database_path.is_file() {
        database_path.clone()
    } else {
        return Err("Cache équipe absent : ni base locale ni copie scellée disponible.".into());
    };

    let opened = backup_sqlite_file_into_memory(&source);
    if source == unsealed_path {
        remove_sqlite_artifacts(&unsealed_path);
    }
    opened
}

pub fn checkpoint_team_cache_database(app: &AppHandle, database: &Database) -> Result<bool, String> {
    let Some(enrollment) = load_workspace_enrollment(app)? else {
        return Ok(false);
    };
    if !enrollment.sync_activated && session_dek().is_err() {
        return Ok(false);
    }
    let database_path = team_cache_database_path(app)?;
    assert_team_cache_artifact(&database_path)?;
    let open_path: String = database
        .connection()
        .query_row(
            "SELECT file FROM pragma_database_list WHERE name = 'main'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Identification du cache SQLite ouvert : {error}"))?;
    if !open_path.is_empty() && open_path != ":memory:" {
        let expected_path = fs::canonicalize(&database_path)
            .map_err(|error| format!("Résolution du chemin du cache équipe : {error}"))?;
        let actual_path = fs::canonicalize(&open_path)
            .map_err(|error| format!("Résolution du cache SQLite ouvert : {error}"))?;
        if actual_path != expected_path {
            return Err("La base ouverte ne correspond pas au cache équipe attendu.".into());
        }
    }
    let key = session_dek()?;
    let sealed_path = team_cache_sealed_path(app)?;
    let next_path = temporary_sibling(&sealed_path, "next");
    let snapshot_path = temporary_sibling(&database_path, "seal-snapshot");
    let verification_path = temporary_sibling(&database_path, "seal-verify");
    remove_sqlite_artifacts(&snapshot_path);
    remove_sqlite_artifacts(&verification_path);
    if next_path.exists() {
        fs::remove_file(&next_path).map_err(|error| {
            format!("Suppression du cache scellé temporaire impossible : {error}")
        })?;
    }

    let result = (|| {
        database
            .backup_to_path(&snapshot_path)
            .map_err(|error| format!("Snapshot SQLite avant scellement : {error}"))?;
        crate::export_archive::validate_database_file(&snapshot_path)?;
        encrypt_database_file(&snapshot_path, &next_path, &key)?;
        decrypt_database_file(&next_path, &verification_path, &key)?;
        crate::export_archive::validate_database_file(&verification_path)?;
        if file_sha256(&snapshot_path)? != file_sha256(&verification_path)? {
            return Err("Le contrôle binaire du cache scellé a échoué.".into());
        }
        replace_sealed_file(&next_path, &sealed_path)?;
        remove_plaintext_cache_artifacts_checked(&database_path)?;
        Ok(true)
    })();
    if next_path.exists() {
        let _ = fs::remove_file(&next_path);
    }
    remove_sqlite_artifacts(&snapshot_path);
    remove_sqlite_artifacts(&verification_path);
    result
}

fn replace_sealed_file(from: &Path, to: &Path) -> Result<(), String> {
    assert_team_cache_artifact(from)?;
    assert_team_cache_artifact(to)?;
    let prev_path = temporary_sibling(to, "prev");
    assert_team_cache_artifact(&prev_path)?;
    if to.exists() {
        if prev_path.exists() {
            fs::remove_file(&prev_path).map_err(|error| {
                format!("Nettoyage de l'ancienne copie scellée impossible : {error}")
            })?;
        }
        fs::rename(to, &prev_path).map_err(|error| {
            format!("Sauvegarde du cache scellé précédent impossible : {error}")
        })?;
        if let Err(error) = fs::rename(from, to) {
            let _ = fs::rename(&prev_path, to);
            return Err(format!("Activation du cache scellé impossible : {error}"));
        }
        let _ = fs::remove_file(&prev_path);
        Ok(())
    } else {
        fs::rename(from, to).map_err(|error| format!("Activation du cache scellé impossible : {error}"))
    }
}

fn recover_sealed_path(sealed_path: &Path) -> Result<(), String> {
    if sealed_path.is_file() {
        return Ok(());
    }
    let next_path = temporary_sibling(sealed_path, "next");
    if next_path.is_file() {
        fs::rename(&next_path, sealed_path).map_err(|error| {
            format!("Récupération du cache scellé (copie suivante) : {error}")
        })?;
        return Ok(());
    }
    let prev_path = temporary_sibling(sealed_path, "prev");
    if prev_path.is_file() {
        fs::rename(&prev_path, sealed_path).map_err(|error| {
            format!("Récupération du cache scellé (copie précédente) : {error}")
        })?;
    }
    Ok(())
}

pub fn seal_team_cache_database(app: &AppHandle, database: Database) -> Result<bool, String> {
    match checkpoint_team_cache_database(app, &database) {
        Ok(sealed) => {
            drop(database);
            if sealed {
                wipe_session_dek();
            }
            Ok(sealed)
        }
        Err(error) => {
            drop(database);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        std::env::temp_dir().join(format!(
            "crm_cache_seal_{}_{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn newer_plaintext_wins_over_a_stale_sealed_copy() {
        let old = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1);
        let recent = std::time::UNIX_EPOCH + std::time::Duration::from_secs(2);
        assert!(plaintext_is_at_least_as_recent(Some(recent), Some(old)));
        assert!(plaintext_is_at_least_as_recent(
            Some(recent),
            Some(recent)
        ));
        assert!(!plaintext_is_at_least_as_recent(Some(old), Some(recent)));
    }

    #[test]
    fn corrupted_plaintext_cache_is_rejected_before_opening() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("cache.db");
        fs::write(&source, b"not-a-sqlite-database").unwrap();

        assert!(validate_plaintext_cache(&source).is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn sealed_database_roundtrip_preserves_integrity_and_bytes() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("workspace-team-cache.db");
        let sealed = dir.join("workspace-team-cache.db.sealed");
        let restored = dir.join("workspace-team-cache.db.unseal");
        let connection = Connection::open(&source).unwrap();
        connection
            .execute_batch("CREATE TABLE data (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO data VALUES (1, 'test');")
            .unwrap();
        drop(connection);
        let key = [7_u8; 32];

        encrypt_database_file(&source, &sealed, &key).unwrap();
        decrypt_database_file(&sealed, &restored, &key).unwrap();

        assert_eq!(file_sha256(&source).unwrap(), file_sha256(&restored).unwrap());
        crate::export_archive::validate_database_file(&restored).unwrap();
        let header = fs::read(&sealed).unwrap();
        assert_ne!(&header[..16.min(header.len())], b"SQLite format 3\0");
        assert!(crate::export_archive::validate_database_file(&sealed).is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn wipe_plaintext_leaves_the_sealed_copy() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let clear = dir.join("workspace-team-cache.db");
        let wal = PathBuf::from(format!("{}-wal", clear.display()));
        let sealed = dir.join("workspace-team-cache.db.sealed");
        fs::write(&clear, b"clear-cache").unwrap();
        fs::write(&wal, b"wal").unwrap();
        fs::write(&sealed, b"sealed-bytes").unwrap();

        wipe_plaintext_cache_files(&clear).unwrap();

        assert!(!clear.exists());
        assert!(!wal.exists());
        assert_eq!(fs::read(&sealed).unwrap(), b"sealed-bytes");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn altered_sealed_database_is_rejected() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("workspace-team-cache.db");
        let sealed = dir.join("workspace-team-cache.db.sealed");
        let restored = dir.join("workspace-team-cache.db.unseal");
        fs::write(&source, vec![3_u8; CHUNK_SIZE + 17]).unwrap();
        let key = [9_u8; 32];
        encrypt_database_file(&source, &sealed, &key).unwrap();
        let mut bytes = fs::read(&sealed).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0x01;
        fs::write(&sealed, bytes).unwrap();

        assert!(decrypt_database_file(&sealed, &restored, &key).is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn wrong_dek_cannot_read_the_sealed_cache() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("workspace-team-cache.db");
        let sealed = dir.join("workspace-team-cache.db.sealed");
        let restored = dir.join("workspace-team-cache.db.unseal");
        let connection = Connection::open(&source).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE data (id INTEGER PRIMARY KEY); INSERT INTO data VALUES (1);",
            )
            .unwrap();
        drop(connection);
        encrypt_database_file(&source, &sealed, &[7_u8; 32]).unwrap();
        assert!(decrypt_database_file(&sealed, &restored, &[8_u8; 32]).is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn historical_database_is_never_treated_as_team_cache() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let historical = dir.join("patrimoine-crm.db");
        fs::write(&historical, b"SQLite format 3\0").unwrap();
        assert!(wipe_plaintext_cache_files(&historical).is_err());
        assert!(historical.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn replace_sealed_keeps_the_new_file_without_deleting_first() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let sealed = dir.join("workspace-team-cache.db.sealed");
        let next = dir.join("workspace-team-cache.db.sealed.next");
        fs::write(&sealed, b"old-sealed").unwrap();
        fs::write(&next, b"new-sealed").unwrap();
        replace_sealed_file(&next, &sealed).unwrap();
        assert_eq!(fs::read(&sealed).unwrap(), b"new-sealed");
        assert!(!next.exists());
        assert!(!dir.join("workspace-team-cache.db.sealed.prev").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn recover_sealed_restores_prev_when_final_file_is_missing() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let sealed = dir.join("workspace-team-cache.db.sealed");
        let prev = dir.join("workspace-team-cache.db.sealed.prev");
        fs::write(&prev, b"previous-sealed").unwrap();
        recover_sealed_path(&sealed).unwrap();
        assert_eq!(fs::read(&sealed).unwrap(), b"previous-sealed");
        assert!(!prev.exists());
        let _ = fs::remove_dir_all(dir);
    }
}
