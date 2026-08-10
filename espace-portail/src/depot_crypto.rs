//! Scellement des pièces déposées.
//!
//! Le portail chiffre chaque dépôt avec la **clé publique** du CRM et devient
//! incapable de le relire : la clé privée ne quitte jamais le poste du
//! conseiller. Un serveur entièrement compromis ne livre que du chiffré.
//!
//! Construction classique (ECIES) : clé éphémère X25519, secret partagé dérivé
//! par HKDF-SHA256, chiffrement authentifié XChaCha20-Poly1305.
//!
//! Format : `ESPD1` | clé publique éphémère (32) | nonce (24) | chiffré.
//!
//! ⚠️ Ce module doit rester identique à `src-tauri/src/espace_client/depot_crypto.rs`.

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use sha2::Sha256;
use x25519_dalek::{EphemeralSecret, PublicKey, StaticSecret};

pub const MAGIC: &[u8; 5] = b"ESPD1";
const PUBLIC_KEY_LEN: usize = 32;
const NONCE_LEN: usize = 24;
const HKDF_INFO: &[u8] = b"espace-client-depot-v1";

/// Dérive la clé de chiffrement du secret partagé.
///
/// Les deux clés publiques entrent dans le sel : sans elles, deux échanges
/// distincts pourraient produire la même clé si le secret se répétait.
fn derive_key(shared: &[u8; 32], ephemeral: &[u8; 32], recipient: &[u8; 32]) -> [u8; 32] {
    let mut salt = Vec::with_capacity(64);
    salt.extend_from_slice(ephemeral);
    salt.extend_from_slice(recipient);

    let hkdf = Hkdf::<Sha256>::new(Some(&salt), shared);
    let mut key = [0u8; 32];
    hkdf.expand(HKDF_INFO, &mut key)
        .expect("32 octets est une longueur valide pour HKDF-SHA256");
    key
}

pub fn parse_public_key(encoded: &str) -> Result<[u8; 32], String> {
    let raw = hex_decode(encoded.trim())?;
    <[u8; 32]>::try_from(raw.as_slice())
        .map_err(|_| "Clé publique de dépôt invalide (32 octets attendus)".to_string())
}

/// Chiffre pour le détenteur de la clé privée correspondante.
pub fn seal(plaintext: &[u8], recipient_public: &[u8; 32]) -> Result<Vec<u8>, String> {
    let recipient = PublicKey::from(*recipient_public);
    let ephemeral_secret = EphemeralSecret::random_from_rng(rand::thread_rng());
    let ephemeral_public = PublicKey::from(&ephemeral_secret);
    let shared = ephemeral_secret.diffie_hellman(&recipient);

    let key = derive_key(shared.as_bytes(), ephemeral_public.as_bytes(), recipient_public);
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|_| "Clé de scellement invalide".to_string())?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    {
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
    }
    let nonce = XNonce::try_from(&nonce_bytes[..])
        .map_err(|_| "Nonce de scellement invalide".to_string())?;

    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| "Scellement du dépôt impossible".to_string())?;

    let mut out = Vec::with_capacity(MAGIC.len() + PUBLIC_KEY_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(ephemeral_public.as_bytes());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Déchiffre — réservé au détenteur de la clé privée (le CRM). Présent ici pour
/// que le format soit vérifié par les tests des deux côtés.
pub fn unseal(sealed: &[u8], recipient_secret: &[u8; 32]) -> Result<Vec<u8>, String> {
    let header = MAGIC.len() + PUBLIC_KEY_LEN + NONCE_LEN;
    if sealed.len() < header || !sealed.starts_with(MAGIC) {
        return Err("Dépôt scellé illisible ou tronqué".into());
    }

    let ephemeral_bytes: [u8; 32] = sealed[MAGIC.len()..MAGIC.len() + PUBLIC_KEY_LEN]
        .try_into()
        .map_err(|_| "Clé éphémère illisible".to_string())?;
    let nonce_bytes = &sealed[MAGIC.len() + PUBLIC_KEY_LEN..header];
    let ciphertext = &sealed[header..];

    let secret = StaticSecret::from(*recipient_secret);
    let recipient_public = PublicKey::from(&secret);
    let shared = secret.diffie_hellman(&PublicKey::from(ephemeral_bytes));

    let key = derive_key(
        shared.as_bytes(),
        &ephemeral_bytes,
        recipient_public.as_bytes(),
    );
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|_| "Clé de descellement invalide".to_string())?;

    let nonce = XNonce::try_from(nonce_bytes)
        .map_err(|_| "Nonce de descellement invalide".to_string())?;
    cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| "Dépôt scellé altéré ou clé incorrecte".into())
}

pub fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn hex_decode(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 {
        return Err("Valeur hexadécimale de longueur impaire".into());
    }
    (0..value.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&value[index..index + 2], 16)
                .map_err(|_| "Valeur hexadécimale invalide".to_string())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keypair() -> ([u8; 32], [u8; 32]) {
        let secret = StaticSecret::random_from_rng(rand::thread_rng());
        let public = PublicKey::from(&secret);
        (secret.to_bytes(), public.to_bytes())
    }

    #[test]
    fn sealed_document_survives_a_round_trip() {
        let (secret, public) = keypair();
        let sealed = seal(b"%PDF-1.4 contenu", &public).unwrap();

        assert!(sealed.starts_with(MAGIC));
        assert!(!sealed.windows(4).any(|w| w == b"%PDF"), "contenu en clair");
        assert_eq!(unseal(&sealed, &secret).unwrap(), b"%PDF-1.4 contenu");
    }

    #[test]
    fn another_key_cannot_read_it() {
        let (_, public) = keypair();
        let (other_secret, _) = keypair();
        let sealed = seal(b"avis d'imposition", &public).unwrap();

        assert!(unseal(&sealed, &other_secret).is_err());
    }

    #[test]
    fn tampering_is_detected() {
        let (secret, public) = keypair();
        let mut sealed = seal(b"contenu", &public).unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 0x01;

        assert!(unseal(&sealed, &secret).is_err());
    }

    #[test]
    fn two_seals_of_the_same_file_differ() {
        let (_, public) = keypair();
        let first = seal(b"contenu", &public).unwrap();
        let second = seal(b"contenu", &public).unwrap();

        assert_ne!(first, second, "clé éphémère ou nonce rejoué");
    }

    #[test]
    fn public_key_round_trips_through_hex() {
        let (_, public) = keypair();
        assert_eq!(parse_public_key(&hex_encode(&public)).unwrap(), public);
        assert!(parse_public_key("pas-de-l-hexa").is_err());
    }
}
