//! Scellement du cache SQLite équipe lorsqu'aucune session CRM n'est ouverte.

use crate::database::Database;
use crate::email::oauth_secrets::load_storage_key;
use crate::workspace::cache::{
    team_cache_database_path, team_cache_sealed_path, TEAM_CACHE_DATABASE_FILE,
};
use crate::workspace::enrollment::load_workspace_enrollment;
use atomic_write_file::AtomicWriteFile;
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
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

fn encrypt_database_file(source: &Path, destination: &Path, key: &[u8; 32]) -> Result<(), String> {
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

fn remove_plaintext_cache_artifacts_checked(path: &Path) -> Result<(), String> {
    for candidate in [
        PathBuf::from(format!("{}-wal", path.display())),
        PathBuf::from(format!("{}-shm", path.display())),
        PathBuf::from(format!("{}-journal", path.display())),
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

pub fn unseal_team_cache_if_needed(app: &AppHandle) -> Result<(), String> {
    let Some(enrollment) = load_workspace_enrollment(app)? else {
        return Ok(());
    };
    if !enrollment.sync_activated {
        return Ok(());
    }
    let database_path = team_cache_database_path(app)?;
    if database_path.is_file() {
        return Ok(());
    }
    let sealed_path = team_cache_sealed_path(app)?;
    if !sealed_path.is_file() {
        return Err("Cache équipe absent : ni base locale ni copie scellée disponible.".into());
    }
    let key = load_storage_key(app)?
        .ok_or_else(|| "Clé protégée du cache équipe indisponible.".to_string())?;
    let unsealed_path = temporary_sibling(&database_path, "unseal");
    remove_sqlite_artifacts(&unsealed_path);
    let result = (|| {
        decrypt_database_file(&sealed_path, &unsealed_path, &key)?;
        crate::export_archive::validate_database_file(&unsealed_path)?;
        fs::rename(&unsealed_path, &database_path)
            .map_err(|error| format!("Activation du cache déchiffré impossible : {error}"))
    })();
    if result.is_err() {
        remove_sqlite_artifacts(&unsealed_path);
    }
    result
}

pub fn seal_team_cache_database(app: &AppHandle, database: Database) -> Result<bool, String> {
    let Some(enrollment) = load_workspace_enrollment(app)? else {
        drop(database);
        return Ok(false);
    };
    if !enrollment.sync_activated {
        drop(database);
        return Ok(false);
    }
    let database_path = team_cache_database_path(app)?;
    if !database_path.is_file() {
        drop(database);
        return Err("Cache équipe clair introuvable pendant le scellement.".into());
    }
    let open_path: String = database
        .connection()
        .query_row(
            "SELECT file FROM pragma_database_list WHERE name = 'main'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Identification du cache SQLite ouvert : {error}"))?;
    let expected_path = fs::canonicalize(&database_path)
        .map_err(|error| format!("Résolution du chemin du cache équipe : {error}"))?;
    let actual_path = fs::canonicalize(&open_path)
        .map_err(|error| format!("Résolution du cache SQLite ouvert : {error}"))?;
    if actual_path != expected_path {
        drop(database);
        return Err("La base ouverte ne correspond pas au cache équipe attendu.".into());
    }
    let key = load_storage_key(app)?
        .ok_or_else(|| "Clé protégée du cache équipe indisponible.".to_string())?;
    let sealed_path = team_cache_sealed_path(app)?;
    let snapshot_path = temporary_sibling(&database_path, "seal-snapshot");
    let verification_path = temporary_sibling(&database_path, "seal-verify");
    remove_sqlite_artifacts(&snapshot_path);
    remove_sqlite_artifacts(&verification_path);

    let result = (|| {
        database
            .backup_to_path(&snapshot_path)
            .map_err(|error| format!("Snapshot SQLite avant scellement : {error}"))?;
        crate::export_archive::validate_database_file(&snapshot_path)?;
        drop(database);
        encrypt_database_file(&snapshot_path, &sealed_path, &key)?;
        decrypt_database_file(&sealed_path, &verification_path, &key)?;
        crate::export_archive::validate_database_file(&verification_path)?;
        if file_sha256(&snapshot_path)? != file_sha256(&verification_path)? {
            return Err("Le contrôle binaire du cache scellé a échoué.".into());
        }
        remove_plaintext_cache_artifacts_checked(&database_path)?;
        Ok(true)
    })();
    remove_sqlite_artifacts(&snapshot_path);
    remove_sqlite_artifacts(&verification_path);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
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
    fn sealed_database_roundtrip_preserves_integrity_and_bytes() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("cache.db");
        let sealed = dir.join("cache.db.sealed");
        let restored = dir.join("restored.db");
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
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn altered_sealed_database_is_rejected() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("cache.db");
        let sealed = dir.join("cache.db.sealed");
        let restored = dir.join("restored.db");
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
}
