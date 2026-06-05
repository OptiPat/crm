use base64::Engine;
use rand::RngCore;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const NONCE_LEN: usize = 16;

/// Clé de stockage des secrets applicatifs (tokens OAuth, clé API Mistral).
///
/// Clé aléatoire de 32 octets, propre à cette installation, persistée dans
/// `secrets.key`. Elle est **indépendante de la base** (qui n'est plus chiffrée) :
/// elle ne peut donc plus être perdue ou écrasée avec elle. Créée automatiquement
/// à la première utilisation.
pub fn load_storage_key(app: &AppHandle) -> Result<Option<[u8; 32]>, String> {
    let path = storage_key_path(app)?;
    if let Ok(raw) = fs::read(&path) {
        if raw.len() == 32 {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&raw);
            return Ok(Some(arr));
        }
    }
    // Première utilisation. Migration : si une ancienne `db_encryption_key` existe dans
    // `auth.json` (versions précédentes), on la réutilise pour ne PAS invalider les secrets
    // (tokens mail, clé Mistral) chiffrés avec elle. Sinon, clé aléatoire.
    let key = legacy_key_from_auth(app).unwrap_or_else(|| {
        let mut k = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut k);
        k
    });
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &key).map_err(|e| e.to_string())?;
    Ok(Some(key))
}

fn storage_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("secrets.key"))
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
