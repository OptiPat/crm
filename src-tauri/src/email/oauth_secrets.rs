use super::secret_storage::{
    has_protection_warning, load_or_create_key, record_key_conflict_notice,
    record_protection_warning,
};
use base64::Engine;
use chacha20poly1305::{
    aead::{Aead, Generate, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

const LEGACY_NONCE_LEN: usize = 16;
const AEAD_PREFIX: &str = "v2:";
const AEAD_NONCE_LEN: usize = 24;

/// Clé de stockage des secrets applicatifs (tokens OAuth, clé API Mistral).
///
/// Clé aléatoire de 32 octets, propre à cette installation et protégée par
/// DPAPI sous Windows ou le Trousseau sous macOS. Elle reste indépendante de
/// la base SQLite, qui n'est pas chiffrée.
pub fn load_storage_key(app: &AppHandle) -> Result<Option<[u8; 32]>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let loaded = load_or_create_key(&app_data_dir, legacy_key_from_auth(app))?;
    let had_conflicting_keys = !loaded.conflicting_legacy_keys.is_empty();
    let (key, os_protected) = select_key_for_existing_secrets(&app_data_dir, loaded)?;
    if os_protected {
        if let Err(error) = cleanup_legacy_key_material(&app_data_dir, &key) {
            record_protection_warning(
                &app_data_dir,
                &format!("Nettoyage de l'ancienne clé locale incomplet : {error}"),
            );
        } else if !had_conflicting_keys {
            super::secret_storage::clear_protection_warning(&app_data_dir);
        }
    } else {
        eprintln!(
            "⚠️ Protection DPAPI/Trousseau indisponible : utilisation temporaire de l'ancienne clé locale."
        );
    }
    Ok(Some(key))
}

fn select_key_for_existing_secrets(
    app_data_dir: &Path,
    loaded: super::secret_storage::LoadedStorageKey,
) -> Result<([u8; 32], bool), String> {
    if loaded.conflicting_legacy_keys.is_empty() {
        return Ok((loaded.key, loaded.os_protected));
    }

    match key_matches_persisted_secrets(app_data_dir, &loaded.key)? {
        Some(true) => {
            record_key_conflict_notice(
                app_data_dir,
                "Une ancienne clé locale incompatible a été conservée par sécurité. La clé protégée a été validée contre les secrets existants.",
            );
            Ok((loaded.key, loaded.os_protected))
        }
        Some(false) => {
            let mut fallback = None;
            for candidate in loaded.conflicting_legacy_keys {
                if key_matches_persisted_secrets(app_data_dir, &candidate)? == Some(true) {
                    fallback = Some(candidate);
                    break;
                }
            }
            let fallback = fallback.ok_or_else(|| {
                    "Deux clés locales incompatibles ont été détectées et aucune ne déchiffre les secrets existants. Aucun fichier n'a été supprimé.".to_string()
                })?;
            record_protection_warning(
                app_data_dir,
                "La clé protégée ne correspond pas aux secrets existants. L'ancienne clé locale est utilisée temporairement sans modifier les fichiers.",
            );
            Ok((fallback, false))
        }
        None => {
            record_protection_warning(
                app_data_dir,
                "Deux clés locales incompatibles sont présentes, mais aucun secret chiffré ne permet de les départager. La clé protégée reste prioritaire.",
            );
            Ok((loaded.key, loaded.os_protected))
        }
    }
}

fn key_matches_persisted_secrets(
    app_data_dir: &Path,
    key: &[u8; 32],
) -> Result<Option<bool>, String> {
    let encrypted = persisted_encrypted_secrets(app_data_dir)?;
    if encrypted.is_empty() {
        return Ok(None);
    }
    Ok(Some(
        encrypted
            .iter()
            .all(|secret| decrypt_secret(secret, key).is_ok()),
    ))
}

fn persisted_encrypted_secrets(app_data_dir: &Path) -> Result<Vec<String>, String> {
    let mut encrypted = Vec::new();
    for file_name in ["email_oauth.json", "newsletter_config.json"] {
        let path = app_data_dir.join(file_name);
        if !path.is_file() {
            continue;
        }
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("Lecture {} impossible : {e}", path.display()))?;
        let json: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("JSON {} invalide : {e}", path.display()))?;
        collect_encrypted_secrets(&json, &mut encrypted);
    }
    Ok(encrypted)
}

fn collect_encrypted_secrets(value: &serde_json::Value, encrypted: &mut Vec<String>) {
    match value {
        serde_json::Value::Array(values) => {
            for value in values {
                collect_encrypted_secrets(value, encrypted);
            }
        }
        serde_json::Value::Object(values) => {
            for (name, value) in values {
                if name.ends_with("_enc") {
                    if let Some(secret) = value.as_str().filter(|secret| !secret.trim().is_empty()) {
                        encrypted.push(secret.to_string());
                    }
                } else {
                    collect_encrypted_secrets(value, encrypted);
                }
            }
        }
        _ => {}
    }
}

pub fn storage_protection_warning(app: &AppHandle) -> bool {
    app.path()
        .app_data_dir()
        .is_ok_and(|dir| has_protection_warning(&dir))
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct ValidatedCleanupKeys {
    pub protected: [u8; 32],
    pub legacy: [u8; 32],
}

pub fn legacy_secret_key_cleanup_available(app: &AppHandle) -> bool {
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return false;
    };
    load_or_create_key(&app_data_dir, legacy_key_from_auth(app)).is_ok_and(|loaded| {
        loaded.os_protected && loaded.conflicting_legacy_keys.len() == 1
    })
}

pub(crate) fn validated_protected_key_for_cleanup(
    app: &AppHandle,
) -> Result<Option<ValidatedCleanupKeys>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let loaded = load_or_create_key(&app_data_dir, legacy_key_from_auth(app))?;
    if !loaded.os_protected || loaded.conflicting_legacy_keys.is_empty() {
        return Ok(None);
    }
    if loaded.conflicting_legacy_keys.len() != 1 {
        return Err("Plusieurs anciennes clés incompatibles sont présentes. Aucun fichier supprimé.".into());
    }
    let encrypted = persisted_encrypted_secrets(&app_data_dir)?;
    if encrypted.iter().any(|secret| is_legacy_secret(secret)) {
        return Err(
            "Des secrets OAuth/newsletter utilisent encore l'ancien format XOR. Ouvrez d'abord les réglages concernés pour terminer leur migration."
                .into(),
        );
    }
    let protected_matches = key_matches_persisted_secrets(&app_data_dir, &loaded.key)?;
    if protected_matches == Some(false) {
        return Err(
            "La clé protégée ne déchiffre pas les secrets OAuth/newsletter. Aucun fichier supprimé."
                .into(),
        );
    }
    let legacy = loaded.conflicting_legacy_keys[0];
    if protected_matches == Some(true)
        && key_matches_persisted_secrets(&app_data_dir, &legacy)? == Some(true)
    {
        return Err(
            "Les deux clés peuvent lire les anciens secrets non authentifiés. Aucun fichier supprimé."
                .into(),
        );
    }
    Ok(Some(ValidatedCleanupKeys {
        protected: loaded.key,
        legacy,
    }))
}

pub(crate) fn finalize_validated_legacy_key_cleanup(
    app: &AppHandle,
    keys: ValidatedCleanupKeys,
) -> Result<bool, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    remove_matching_legacy_auth_key(&app_data_dir.join("auth.json"), &keys.legacy)?;
    super::secret_storage::remove_legacy_key_after_validation(&app_data_dir, &keys.protected)
}

/// Récupère l'ancienne clé de chiffrement des secrets depuis `auth.json` si présente
/// (champ `db_encryption_key`, 64 caractères hex). Permet de migrer sans reconnexion.
fn legacy_key_from_auth(app: &AppHandle) -> Option<[u8; 32]> {
    let path = app.path().app_data_dir().ok()?.join("auth.json");
    let raw = fs::read_to_string(&path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let hex_key = json
        .get("db_encryption_key")
        .and_then(|v| v.as_str())
        .filter(|s| s.len() == 64)?;
    hex_to_32(hex_key)
}

fn hex_to_32(s: &str) -> Option<[u8; 32]> {
    let bytes = s.as_bytes();
    if bytes.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, chunk) in bytes.chunks(2).enumerate() {
        let hi = (chunk[0] as char).to_digit(16)?;
        let lo = (chunk[1] as char).to_digit(16)?;
        out[i] = (hi * 16 + lo) as u8;
    }
    Some(out)
}

fn cleanup_legacy_key_material(app_data_dir: &Path, key: &[u8; 32]) -> Result<(), String> {
    let mut errors = Vec::new();
    cleanup_legacy_key_pair(app_data_dir, key, &mut errors);

    let backups_dir = app_data_dir.join("backups");
    if backups_dir.is_dir() {
        match fs::read_dir(&backups_dir) {
            Ok(entries) => {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let is_config_backup = path.is_dir()
                        && path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .is_some_and(|name| {
                                name.starts_with("patrimoine-crm_")
                                    && name.ends_with("_config")
                            });
                    if is_config_backup {
                        cleanup_legacy_key_pair(&path, key, &mut errors);
                    }
                }
            }
            Err(error) => errors.push(format!("lecture sauvegardes : {error}")),
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join(" ; "))
    }
}

fn cleanup_legacy_key_pair(dir: &Path, key: &[u8; 32], errors: &mut Vec<String>) {
    if let Err(error) = remove_matching_legacy_auth_key(&dir.join("auth.json"), key) {
        errors.push(error);
    }
    let legacy_key_path = dir.join("secrets.key");
    if legacy_key_path.is_file() {
        match fs::read(&legacy_key_path) {
            Ok(raw) if raw.as_slice() == key => {
                if let Err(error) = fs::remove_file(&legacy_key_path) {
                    errors.push(format!(
                        "suppression {} : {error}",
                        legacy_key_path.display()
                    ));
                }
            }
            Ok(_) => {}
            Err(error) => errors.push(format!("lecture {} : {error}", legacy_key_path.display())),
        }
    }
}

fn remove_matching_legacy_auth_key(path: &Path, key: &[u8; 32]) -> Result<bool, String> {
    if !path.is_file() {
        return Ok(false);
    }
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("lecture {} : {e}", path.display()))?;
    let mut json: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("JSON {} : {e}", path.display()))?;
    let matches = json
        .get("db_encryption_key")
        .and_then(|value| value.as_str())
        .and_then(hex_to_32)
        .is_some_and(|legacy| legacy == *key);
    if !matches {
        return Ok(false);
    }
    let object = json
        .as_object_mut()
        .ok_or_else(|| format!("Format auth invalide : {}", path.display()))?;
    object.remove("db_encryption_key");
    let serialized =
        serde_json::to_vec_pretty(&json).map_err(|e| format!("Sérialisation auth : {e}"))?;
    crate::atomic_file::write(path, serialized)
        .map_err(|e| format!("réécriture {} : {e}", path.display()))?;
    Ok(true)
}

/// Chiffrement authentifié au repos. Le préfixe versionné permet de continuer
/// à lire les anciens secrets XOR pendant leur migration automatique.
pub fn encrypt_secret(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| "Clé de chiffrement locale invalide.".to_string())?;
    let nonce = XNonce::generate();
    let encrypted = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| "Chiffrement du secret impossible.".to_string())?;
    let mut payload = Vec::with_capacity(AEAD_NONCE_LEN + encrypted.len());
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&encrypted);
    Ok(format!(
        "{AEAD_PREFIX}{}",
        base64::engine::general_purpose::STANDARD.encode(payload)
    ))
}

pub fn decrypt_secret(encoded: &str, key: &[u8; 32]) -> Result<String, String> {
    let trimmed = encoded.trim();
    if let Some(payload) = trimmed.strip_prefix(AEAD_PREFIX) {
        return decrypt_aead_secret(payload, key);
    }
    decrypt_legacy_secret(trimmed, key)
}

pub fn is_legacy_secret(encoded: &str) -> bool {
    !encoded.trim().starts_with(AEAD_PREFIX)
}

fn decrypt_aead_secret(encoded: &str, key: &[u8; 32]) -> Result<String, String> {
    let payload = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Secret chiffré illisible : {e}"))?;
    if payload.len() <= AEAD_NONCE_LEN {
        return Err("Données chiffrées invalides.".into());
    }
    let (nonce_bytes, ciphertext) = payload.split_at(AEAD_NONCE_LEN);
    let nonce =
        XNonce::try_from(nonce_bytes).map_err(|_| "Nonce de chiffrement invalide.".to_string())?;
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| "Clé de chiffrement locale invalide.".to_string())?;
    let plain = cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| "Secret chiffré altéré ou clé locale incompatible.".to_string())?;
    String::from_utf8(plain).map_err(|e| format!("Secret chiffré UTF-8 invalide : {e}"))
}

fn decrypt_legacy_secret(encoded: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Token OAuth illisible: {}", e))?;
    if cipher.len() <= LEGACY_NONCE_LEN {
        return Err("Données OAuth chiffrées invalides".into());
    }
    let (nonce, body) = cipher.split_at(LEGACY_NONCE_LEN);
    let mut plain = Vec::with_capacity(body.len());
    for (i, &b) in body.iter().enumerate() {
        plain.push(b ^ key[i % 32] ^ nonce[i % LEGACY_NONCE_LEN]);
    }
    String::from_utf8(plain).map_err(|e| format!("Token OAuth UTF-8: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "patrimoine_crm_oauth_secrets_test_{}_{}",
            std::process::id(),
            n
        ))
    }

    #[test]
    fn aead_roundtrip_uses_a_random_nonce() {
        let key = [0x42; 32];
        let first = encrypt_secret("secret-test", &key).unwrap();
        let second = encrypt_secret("secret-test", &key).unwrap();

        assert_ne!(first, second);
        assert!(first.starts_with(AEAD_PREFIX));
        assert_eq!(decrypt_secret(&first, &key).unwrap(), "secret-test");
        assert_eq!(decrypt_secret(&second, &key).unwrap(), "secret-test");
        assert!(!is_legacy_secret(&first));
    }

    #[test]
    fn legacy_xor_known_vector_remains_readable() {
        let key = [0x11; 32];
        let mut cipher: Vec<u8> = (0u8..16).collect();
        cipher.extend_from_slice(&[
            0x62, 0x75, 0x70, 0x60, 0x70, 0x60, 0x3a, 0x62, 0x7c, 0x6b, 0x6f,
        ]);
        let encoded = base64::engine::general_purpose::STANDARD.encode(cipher);

        assert_eq!(decrypt_secret(&encoded, &key).unwrap(), "secret-test");
        assert!(is_legacy_secret(&encoded));
    }

    #[test]
    fn cleanup_detection_includes_legacy_xor_fields() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let mut cipher: Vec<u8> = (0u8..16).collect();
        cipher.extend_from_slice(&[
            0x62, 0x75, 0x70, 0x60, 0x70, 0x60, 0x3a, 0x62, 0x7c, 0x6b, 0x6f,
        ]);
        let encoded = base64::engine::general_purpose::STANDARD.encode(cipher);
        fs::write(
            dir.join("email_oauth.json"),
            serde_json::to_vec(&serde_json::json!({
                "version": 2,
                "connection": { "access_token_enc": encoded }
            }))
            .unwrap(),
        )
        .unwrap();

        let encrypted = persisted_encrypted_secrets(&dir).unwrap();
        assert_eq!(encrypted.len(), 1);
        assert!(is_legacy_secret(&encrypted[0]));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rejects_invalid_payloads() {
        let key = [0x42; 32];
        assert!(decrypt_secret("not-base64", &key).is_err());
        let too_short = base64::engine::general_purpose::STANDARD.encode([0u8; LEGACY_NONCE_LEN]);
        assert!(decrypt_secret(&too_short, &key).is_err());
        assert!(decrypt_secret("v2:not-base64", &key).is_err());
    }

    #[test]
    fn aead_detects_ciphertext_tampering() {
        let key = [0x42; 32];
        let encrypted = encrypt_secret("secret-test", &key).unwrap();
        let mut payload = base64::engine::general_purpose::STANDARD
            .decode(encrypted.strip_prefix(AEAD_PREFIX).unwrap())
            .unwrap();
        *payload.last_mut().unwrap() ^= 0x01;
        let tampered = format!(
            "{AEAD_PREFIX}{}",
            base64::engine::general_purpose::STANDARD.encode(payload)
        );

        assert!(decrypt_secret(&tampered, &key).is_err());
    }

    #[test]
    fn conflicting_keys_are_selected_against_existing_aead_secrets() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let protected_key = [0x31; 32];
        let legacy_key = [0x42; 32];
        let encrypted = encrypt_secret("oauth-token", &legacy_key).unwrap();
        fs::write(
            dir.join("email_oauth.json"),
            serde_json::to_vec(&serde_json::json!({
                "version": 3,
                "connection": { "access_token_enc": encrypted }
            }))
            .unwrap(),
        )
        .unwrap();

        let selected = select_key_for_existing_secrets(
            &dir,
            super::super::secret_storage::LoadedStorageKey {
                key: protected_key,
                os_protected: true,
                conflicting_legacy_keys: vec![legacy_key],
            },
        )
        .unwrap();

        assert_eq!(selected, (legacy_key, false));
        assert!(has_protection_warning(&dir));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn validated_protected_key_remains_authoritative() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let protected_key = [0x51; 32];
        let legacy_key = [0x62; 32];
        let encrypted = encrypt_secret("oauth-token", &protected_key).unwrap();
        fs::write(
            dir.join("newsletter_config.json"),
            serde_json::to_vec(&serde_json::json!({
                "version": 2,
                "api_key_enc": encrypted
            }))
            .unwrap(),
        )
        .unwrap();

        let selected = select_key_for_existing_secrets(
            &dir,
            super::super::secret_storage::LoadedStorageKey {
                key: protected_key,
                os_protected: true,
                conflicting_legacy_keys: vec![legacy_key],
            },
        )
        .unwrap();

        assert_eq!(selected, (protected_key, true));
        assert!(has_protection_warning(&dir));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn hex_legacy_key_parser_is_strict() {
        let parsed = hex_to_32(&"ab".repeat(32)).unwrap();
        assert_eq!(parsed, [0xab; 32]);
        assert!(hex_to_32("abcd").is_none());
        assert!(hex_to_32(&"zz".repeat(32)).is_none());
    }

    #[test]
    fn cleanup_removes_matching_plaintext_keys_from_live_and_backups() {
        let dir = unique_temp_dir();
        let backup = dir
            .join("backups")
            .join("patrimoine-crm_20260718_120000_000_config");
        fs::create_dir_all(&backup).unwrap();
        let key = [0x11; 32];
        let auth = serde_json::json!({
            "password_hash": "argon2-test",
            "created_at": 123,
            "db_encryption_key": "11".repeat(32)
        });
        for target in [&dir, &backup] {
            fs::write(
                target.join("auth.json"),
                serde_json::to_vec_pretty(&auth).unwrap(),
            )
            .unwrap();
            fs::write(target.join("secrets.key"), key).unwrap();
        }

        cleanup_legacy_key_material(&dir, &key).unwrap();

        for target in [&dir, &backup] {
            assert!(!target.join("secrets.key").exists());
            let cleaned: serde_json::Value =
                serde_json::from_slice(&fs::read(target.join("auth.json")).unwrap()).unwrap();
            assert!(cleaned.get("db_encryption_key").is_none());
            assert_eq!(cleaned["password_hash"], "argon2-test");
        }
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn cleanup_preserves_unrelated_legacy_keys() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("secrets.key"), [0x22; 32]).unwrap();
        fs::write(
            dir.join("auth.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "password_hash": "argon2-test",
                "db_encryption_key": "22".repeat(32)
            }))
            .unwrap(),
        )
        .unwrap();

        cleanup_legacy_key_material(&dir, &[0x11; 32]).unwrap();

        assert!(dir.join("secrets.key").is_file());
        let auth = fs::read_to_string(dir.join("auth.json")).unwrap();
        assert!(auth.contains("db_encryption_key"));
        let _ = fs::remove_dir_all(dir);
    }
}
