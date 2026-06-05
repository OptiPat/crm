//! Primitives de chiffrement par enveloppe.
//!
//! Modèle : une clé de données aléatoire (DEK) chiffre la base SQLite (SQLCipher).
//! La DEK n'est jamais stockée en clair : elle est « emballée » (chiffrée) par une
//! clé (KEK) dérivée d'un secret utilisateur (mot de passe maître ou clé de
//! récupération) via Argon2id, puis scellée en AEAD (XChaCha20-Poly1305).
//!
//! Conséquence : voler le fichier `auth.json` + la base ne suffit pas ; il faut
//! connaître le mot de passe (ou la clé de récupération) pour reconstituer la DEK.

use argon2::Argon2;
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};

/// Taille de la clé de données / des clés dérivées (256 bits).
pub const KEY_LEN: usize = 32;
/// Taille du sel Argon2id.
pub const SALT_LEN: usize = 16;
/// Taille du nonce XChaCha20-Poly1305.
pub const NONCE_LEN: usize = 24;

/// Génère `n` octets aléatoires cryptographiquement sûrs.
pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut buf = vec![0u8; n];
    OsRng.fill_bytes(&mut buf);
    buf
}

/// Dérive une clé d'enveloppe (KEK) de 32 octets à partir d'un secret et d'un sel.
pub fn derive_kek(secret: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], String> {
    let mut out = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(secret.as_bytes(), salt, &mut out)
        .map_err(|e| format!("Échec de dérivation de clé : {e}"))?;
    Ok(out)
}

/// Emballe (chiffre) une DEK avec une KEK. Retourne `nonce || ciphertext`.
pub fn wrap_dek(dek: &[u8], kek: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(kek));
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), dek)
        .map_err(|_| "Échec du scellement de la clé".to_string())?;
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Désemballe (déchiffre) une DEK. `wrapped` = `nonce || ciphertext`.
/// Retourne une erreur si la KEK est mauvaise ou la donnée altérée.
pub fn unwrap_dek(wrapped: &[u8], kek: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    if wrapped.len() <= NONCE_LEN {
        return Err("Donnée scellée invalide".to_string());
    }
    let (nonce, ciphertext) = wrapped.split_at(NONCE_LEN);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(kek));
    cipher
        .decrypt(XNonce::from_slice(nonce), ciphertext)
        .map_err(|_| "Clé incorrecte ou donnée altérée".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_unwrap_roundtrip() {
        let dek = random_bytes(KEY_LEN);
        let salt = random_bytes(SALT_LEN);
        let kek = derive_kek("mon-mot-de-passe", &salt).expect("kek");

        let wrapped = wrap_dek(&dek, &kek).expect("wrap");
        let recovered = unwrap_dek(&wrapped, &kek).expect("unwrap");
        assert_eq!(dek, recovered, "la DEK doit être restituée à l'identique");
    }

    #[test]
    fn unwrap_fails_with_wrong_password() {
        let dek = random_bytes(KEY_LEN);
        let salt = random_bytes(SALT_LEN);
        let kek_ok = derive_kek("bon-mot-de-passe", &salt).expect("kek");
        let kek_bad = derive_kek("mauvais-mot-de-passe", &salt).expect("kek");

        let wrapped = wrap_dek(&dek, &kek_ok).expect("wrap");
        assert!(
            unwrap_dek(&wrapped, &kek_bad).is_err(),
            "un mauvais mot de passe ne doit jamais désemballer la DEK"
        );
    }

    #[test]
    fn unwrap_fails_on_tampered_ciphertext() {
        let dek = random_bytes(KEY_LEN);
        let salt = random_bytes(SALT_LEN);
        let kek = derive_kek("mot-de-passe", &salt).expect("kek");

        let mut wrapped = wrap_dek(&dek, &kek).expect("wrap");
        let last = wrapped.len() - 1;
        wrapped[last] ^= 0xFF;
        assert!(
            unwrap_dek(&wrapped, &kek).is_err(),
            "une donnée altérée doit être rejetée (AEAD)"
        );
    }

    #[test]
    fn same_password_different_salt_gives_different_key() {
        let kek1 = derive_kek("identique", &random_bytes(SALT_LEN)).expect("kek");
        let kek2 = derive_kek("identique", &random_bytes(SALT_LEN)).expect("kek");
        assert_ne!(kek1, kek2, "des sels différents doivent produire des clés différentes");
    }
}
