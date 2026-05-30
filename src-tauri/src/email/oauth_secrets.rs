use base64::Engine;
use rand::RngCore;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const NONCE_LEN: usize = 16;

/// Clé de stockage = `db_encryption_key` de `auth.json` (64 caractères hex → 32 octets).
pub fn load_storage_key(app: &AppHandle) -> Result<Option<[u8; 32]>, String> {
    let path = auth_config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let json: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Parse auth.json: {}", e))?;
    let hex_key = json
        .get("db_encryption_key")
        .and_then(|v| v.as_str())
        .filter(|s| s.len() == 64);
    let Some(hex_key) = hex_key else {
        return Ok(None);
    };
    let bytes = hex::decode(hex_key).map_err(|e| format!("Clé auth invalide: {}", e))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "db_encryption_key doit faire 32 octets".to_string())?;
    Ok(Some(arr))
}

fn auth_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("auth.json"))
}

/// Chiffrement symétrique au repos (XOR + nonce, clé CRM). Pas de dépendance crypto lourde.
pub fn encrypt_secret(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce);
    let plain = plaintext.as_bytes();
    let mut cipher = Vec::with_capacity(NONCE_LEN + plain.len());
    cipher.extend_from_slice(&nonce);
    for (i, &b) in plain.iter().enumerate() {
        cipher.push(b ^ key[i % 32] ^ nonce[i % NONCE_LEN]);
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(cipher))
}

pub fn decrypt_secret(encoded: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|e| format!("Token OAuth illisible: {}", e))?;
    if cipher.len() <= NONCE_LEN {
        return Err("Données OAuth chiffrées invalides".into());
    }
    let (nonce, body) = cipher.split_at(NONCE_LEN);
    let mut plain = Vec::with_capacity(body.len());
    for (i, &b) in body.iter().enumerate() {
        plain.push(b ^ key[i % 32] ^ nonce[i % NONCE_LEN]);
    }
    String::from_utf8(plain).map_err(|e| format!("Token OAuth UTF-8: {}", e))
}
