use rand::RngCore;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub const LEGACY_KEY_FILE: &str = "secrets.key";
pub const PROTECTED_KEY_FILE: &str = "secrets.key.os";
const PROTECTION_WARNING_FILE: &str = "secrets-protection-warning.txt";

static KEY_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub struct LoadedStorageKey {
    pub key: [u8; 32],
    pub os_protected: bool,
    pub conflicting_legacy_keys: Vec<[u8; 32]>,
}

pub fn load_or_create_key(
    app_data_dir: &Path,
    legacy_auth_key: Option<[u8; 32]>,
) -> Result<LoadedStorageKey, String> {
    let _guard = KEY_IO_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Verrou interne du stockage des secrets indisponible.".to_string())?;
    let protected_path = app_data_dir.join(PROTECTED_KEY_FILE);
    let legacy_path = app_data_dir.join(LEGACY_KEY_FILE);
    restore_single_quarantined_key(app_data_dir, &legacy_path)?;

    if protected_path.is_file() {
        let protected_key = fs::read(&protected_path)
            .map_err(|e| format!("Lecture de la clé locale protégée impossible : {e}"))
            .and_then(|protected| platform::unprotect_key(&protected))
            .and_then(|key| key_from_bytes(&key));
        match protected_key {
            Ok(key) => {
                let conflicting_legacy_keys =
                    remove_matching_or_collect_legacy_key(&legacy_path, &key)?;
                return Ok(LoadedStorageKey {
                    key,
                    os_protected: true,
                    conflicting_legacy_keys,
                });
            }
            Err(_) if legacy_path.is_file() => {
                let raw = fs::read(&legacy_path)
                    .map_err(|e| format!("Lecture de l'ancienne clé locale impossible : {e}"))?;
                let key = key_from_bytes(&raw)?;
                let os_protected = match persist_protected_key(app_data_dir, &protected_path, &key) {
                    Ok(()) => {
                        clear_protection_warning(app_data_dir);
                        let _ = fs::remove_file(&legacy_path);
                        true
                    }
                    Err(error) => {
                        record_protection_warning(app_data_dir, &error);
                        false
                    }
                };
                return Ok(LoadedStorageKey {
                    key,
                    os_protected,
                    conflicting_legacy_keys: Vec::new(),
                });
            }
            Err(protected_error) => {
                return Err(format!(
                    "{protected_error} La base et les documents restent accessibles ; les connexions protégées doivent être reconfigurées."
                ));
            }
        }
    }

    let existing_os_key = if legacy_path.is_file() {
        None
    } else {
        platform::load_existing_key()?
            .map(|raw| key_from_bytes(&raw))
            .transpose()?
    };
    let can_fallback_to_legacy =
        legacy_path.is_file() || legacy_auth_key.is_some() || existing_os_key.is_some();
    let (key, migrated_legacy_file) = if legacy_path.is_file() {
        let raw = fs::read(&legacy_path)
            .map_err(|e| format!("Lecture de l'ancienne clé locale impossible : {e}"))?;
        (key_from_bytes(&raw)?, true)
    } else if let Some(key) = existing_os_key {
        (key, false)
    } else {
        let key = legacy_auth_key.unwrap_or_else(|| {
            let mut key = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut key);
            key
        });
        (key, false)
    };

    if let Err(error) = persist_protected_key(app_data_dir, &protected_path, &key) {
        if can_fallback_to_legacy {
            record_protection_warning(app_data_dir, &error);
            return Ok(LoadedStorageKey {
                key,
                os_protected: false,
                conflicting_legacy_keys: Vec::new(),
            });
        }
        return Err(error);
    }

    if migrated_legacy_file {
        let _ = fs::remove_file(&legacy_path);
    }
    clear_protection_warning(app_data_dir);
    Ok(LoadedStorageKey {
        key,
        os_protected: true,
        conflicting_legacy_keys: Vec::new(),
    })
}

pub fn record_protection_warning(app_data_dir: &Path, error: &str) {
    let message = format!(
        "La protection DPAPI/Trousseau n'a pas pu être finalisée. Le CRM réessaiera automatiquement.\nDétail : {error}"
    );
    write_protection_marker(
        app_data_dir,
        &message,
        &format!("⚠️ Protection des secrets incomplète : {error}"),
    );
}

pub fn record_key_conflict_notice(app_data_dir: &Path, detail: &str) {
    let message = format!(
        "La clé protégée DPAPI/Trousseau est valide. Une ancienne clé différente est conservée pour récupération.\nDétail : {detail}"
    );
    write_protection_marker(
        app_data_dir,
        &message,
        &format!("⚠️ Conflit de clés locales : {detail}"),
    );
}

fn write_protection_marker(app_data_dir: &Path, message: &str, log_message: &str) {
    let path = app_data_dir.join(PROTECTION_WARNING_FILE);
    if fs::read(&path).is_ok_and(|existing| existing == message.as_bytes()) {
        return;
    }
    eprintln!("{log_message}");
    let _ = crate::atomic_file::write(&path, message.as_bytes());
}

pub fn clear_protection_warning(app_data_dir: &Path) {
    let path = app_data_dir.join(PROTECTION_WARNING_FILE);
    if path.is_file() {
        let _ = fs::remove_file(path);
    }
}

pub fn has_protection_warning(app_data_dir: &Path) -> bool {
    app_data_dir.join(PROTECTION_WARNING_FILE).is_file()
}

fn persist_protected_key(
    app_data_dir: &Path,
    protected_path: &Path,
    key: &[u8; 32],
) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("Création du dossier des secrets impossible : {e}"))?;
    let protected = platform::protect_key(key)?;
    let verified = platform::unprotect_key(&protected)?;
    if verified.as_slice() != key {
        return Err("Vérification de la clé protégée par le système impossible.".into());
    }
    if let Err(error) = crate::atomic_file::write(protected_path, &protected) {
        return Err(format!(
            "Écriture de la clé locale protégée impossible : {error}"
        ));
    }
    let persisted_key = fs::read(protected_path)
        .map_err(|e| format!("Relecture de la clé locale protégée impossible : {e}"))
        .and_then(|persisted| platform::unprotect_key(&persisted));
    match persisted_key {
        Ok(persisted) if persisted.as_slice() == key => Ok(()),
        Ok(_) | Err(_) => {
            let _ = fs::remove_file(protected_path);
            Err("La clé locale protégée n'a pas pu être vérifiée sur disque.".into())
        }
    }
}

fn key_from_bytes(bytes: &[u8]) -> Result<[u8; 32], String> {
    bytes.try_into().map_err(|_| {
        "Clé locale invalide : les secrets sont préservés, mais doivent être reconfigurés.".into()
    })
}

fn remove_matching_or_collect_legacy_key(
    path: &PathBuf,
    key: &[u8; 32],
) -> Result<Vec<[u8; 32]>, String> {
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let raw =
        fs::read(path).map_err(|e| format!("Lecture de l'ancienne clé locale impossible : {e}"))?;
    let legacy_key = key_from_bytes(&raw)?;
    if raw.as_slice() == key {
        fs::remove_file(path)
            .map_err(|e| format!("Suppression de l'ancienne clé locale impossible : {e}"))?;
        return Ok(Vec::new());
    }
    Ok(vec![legacy_key])
}

fn restore_single_quarantined_key(app_data_dir: &Path, legacy_path: &Path) -> Result<(), String> {
    if legacy_path.exists() || !app_data_dir.is_dir() {
        return Ok(());
    }
    let mut quarantined = fs::read_dir(app_data_dir)
        .map_err(|e| format!("Lecture du dossier des secrets impossible : {e}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("secrets.key.conflict-"))
        });
    let Some(candidate) = quarantined.next() else {
        return Ok(());
    };
    if quarantined.next().is_some() {
        return Ok(());
    }
    fs::rename(candidate, legacy_path)
        .map_err(|e| format!("Restauration de l'ancienne clé locale impossible : {e}"))
}

#[cfg(windows)]
mod platform {
    use windows_dpapi::{decrypt_data, encrypt_data, Scope};

    const MAGIC: &[u8] = b"PCRM-DPAPI-V1\0";
    const ENTROPY: &[u8] = b"com.patrimoine-crm.app/storage-key/v1";

    pub fn protect_key(key: &[u8; 32]) -> Result<Vec<u8>, String> {
        let encrypted = encrypt_data(key, Scope::User, Some(ENTROPY))
            .map_err(|e| format!("Protection DPAPI de la clé locale impossible : {e}"))?;
        let mut out = Vec::with_capacity(MAGIC.len() + encrypted.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&encrypted);
        Ok(out)
    }

    pub fn load_existing_key() -> Result<Option<Vec<u8>>, String> {
        Ok(None)
    }

    pub fn unprotect_key(protected: &[u8]) -> Result<Vec<u8>, String> {
        let encrypted = protected
            .strip_prefix(MAGIC)
            .ok_or("Format de clé DPAPI inconnu. Les secrets n'ont pas été modifiés.")?;
        decrypt_data(encrypted, Scope::User, Some(ENTROPY)).map_err(|e| {
            format!("Cette clé locale DPAPI n'est pas accessible avec ce compte Windows : {e}")
        })
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use security_framework::passwords::{
        delete_generic_password, generic_password, set_generic_password_options, PasswordOptions,
    };

    const MAGIC: &[u8] = b"PCRM-KEYCHAIN-V1\0";
    const SERVICE: &str = "com.patrimoine-crm.app";
    const ACCOUNT: &str = "storage-master-key";
    const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

    pub fn protect_key(key: &[u8; 32]) -> Result<Vec<u8>, String> {
        store_keychain_key(ACCOUNT, key)?;
        let verified = read_keychain_key()?;
        if verified.as_slice() != key {
            return Err("Vérification de la clé dans le Trousseau macOS impossible.".into());
        }
        Ok(MAGIC.to_vec())
    }

    pub fn unprotect_key(protected: &[u8]) -> Result<Vec<u8>, String> {
        if protected != MAGIC {
            return Err(
                "Format de clé du Trousseau macOS inconnu. Les secrets n'ont pas été modifiés."
                    .into(),
            );
        }
        read_keychain_key()
    }

    pub fn load_existing_key() -> Result<Option<Vec<u8>>, String> {
        match generic_password(keychain_options(ACCOUNT)) {
            Ok(key) => Ok(Some(key)),
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(None),
            Err(error) => Err(format!("Lecture du Trousseau macOS impossible : {error}")),
        }
    }

    fn read_keychain_key() -> Result<Vec<u8>, String> {
        generic_password(keychain_options(ACCOUNT)).map_err(|e| {
            format!("Clé locale absente ou inaccessible dans le Trousseau macOS : {e}")
        })
    }

    fn store_keychain_key(account: &str, key: &[u8]) -> Result<(), String> {
        set_generic_password_options(key, keychain_options(account))
            .map_err(|e| format!("Enregistrement dans le Trousseau macOS impossible : {e}"))
    }

    fn keychain_options(account: &str) -> PasswordOptions {
        let mut options = PasswordOptions::new_generic_password(SERVICE, account);
        options.set_access_synchronized(Some(false));
        options
    }

    #[cfg(test)]
    pub fn test_keychain_roundtrip(account: &str, key: &[u8; 32]) -> Result<(), String> {
        store_keychain_key(account, key)?;
        let loaded = generic_password(keychain_options(account))
            .map_err(|e| format!("Lecture test Trousseau macOS impossible : {e}"))?;
        let cleanup = delete_generic_password(SERVICE, account)
            .map_err(|e| format!("Nettoyage test Trousseau macOS impossible : {e}"));
        if loaded.as_slice() != key {
            return Err("Le Trousseau macOS a renvoyé une clé différente.".into());
        }
        cleanup
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod platform {
    pub fn protect_key(_key: &[u8; 32]) -> Result<Vec<u8>, String> {
        Err("Le coffre de secrets est disponible uniquement sous Windows et macOS.".into())
    }

    pub fn unprotect_key(_protected: &[u8]) -> Result<Vec<u8>, String> {
        Err("Le coffre de secrets est disponible uniquement sous Windows et macOS.".into())
    }

    pub fn load_existing_key() -> Result<Option<Vec<u8>>, String> {
        Ok(None)
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "patrimoine_crm_secret_storage_test_{}_{}",
            std::process::id(),
            n
        ))
    }

    #[test]
    fn migrates_plaintext_key_to_dpapi_without_changing_it() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let expected = [0x5a; 32];
        fs::write(dir.join(LEGACY_KEY_FILE), expected).unwrap();

        assert_eq!(load_or_create_key(&dir, None).unwrap().key, expected);
        assert!(!dir.join(LEGACY_KEY_FILE).exists());
        assert!(dir.join(PROTECTED_KEY_FILE).is_file());
        assert_eq!(load_or_create_key(&dir, None).unwrap().key, expected);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn creates_a_stable_dpapi_key_for_a_new_installation() {
        let dir = unique_temp_dir();
        let first = load_or_create_key(&dir, None).unwrap();
        let second = load_or_create_key(&dir, None).unwrap();

        assert_eq!(first.key, second.key);
        assert_ne!(first.key, [0u8; 32]);
        assert!(first.os_protected);
        assert!(second.os_protected);
        assert!(!dir.join(LEGACY_KEY_FILE).exists());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn preserves_a_conflicting_legacy_key_for_validation_by_the_caller() {
        let dir = unique_temp_dir();
        let protected = load_or_create_key(&dir, None).unwrap();
        let conflicting = [0x33; 32];
        fs::write(dir.join(LEGACY_KEY_FILE), conflicting).unwrap();

        let loaded = load_or_create_key(&dir, None).unwrap();

        assert_eq!(loaded.key, protected.key);
        assert_eq!(loaded.conflicting_legacy_keys, vec![conflicting]);
        assert_eq!(fs::read(dir.join(LEGACY_KEY_FILE)).unwrap(), conflicting);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restores_a_single_previously_quarantined_key() {
        let dir = unique_temp_dir();
        let protected = load_or_create_key(&dir, None).unwrap();
        let conflicting = [0x44; 32];
        fs::write(dir.join("secrets.key.conflict-123"), conflicting).unwrap();

        let loaded = load_or_create_key(&dir, None).unwrap();

        assert_eq!(loaded.key, protected.key);
        assert_eq!(loaded.conflicting_legacy_keys, vec![conflicting]);
        assert_eq!(fs::read(dir.join(LEGACY_KEY_FILE)).unwrap(), conflicting);
        assert!(!dir.join("secrets.key.conflict-123").exists());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn never_replaces_a_corrupted_protected_key() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let protected_path = dir.join(PROTECTED_KEY_FILE);
        fs::write(&protected_path, b"corrupted").unwrap();

        assert!(load_or_create_key(&dir, None).is_err());
        assert_eq!(fs::read(&protected_path).unwrap(), b"corrupted");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn recovers_a_corrupted_dpapi_blob_from_the_legacy_key() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let expected = [0x7b; 32];
        fs::write(dir.join(PROTECTED_KEY_FILE), b"corrupted").unwrap();
        fs::write(dir.join(LEGACY_KEY_FILE), expected).unwrap();

        assert_eq!(load_or_create_key(&dir, None).unwrap().key, expected);
        assert!(!dir.join(LEGACY_KEY_FILE).exists());
        assert_eq!(load_or_create_key(&dir, None).unwrap().key, expected);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn protection_warning_marker_is_visible_until_cleared() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();

        record_protection_warning(&dir, "test");
        assert!(has_protection_warning(&dir));

        clear_protection_warning(&dir);
        assert!(!has_protection_warning(&dir));
        let _ = fs::remove_dir_all(dir);
    }
}

#[cfg(all(test, target_os = "macos"))]
mod macos_tests {
    use super::platform;

    #[test]
    fn keychain_roundtrip_uses_a_non_synchronized_entry() {
        let account = format!(
            "storage-master-key-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        platform::test_keychain_roundtrip(&account, &[0x5a; 32]).unwrap();
    }
}
