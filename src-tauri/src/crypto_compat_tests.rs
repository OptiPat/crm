//! Tests « témoins » de compatibilité cryptographique.
//!
//! Les valeurs ci-dessous ont été produites par les versions des bibliothèques en place
//! avant leur mise à jour (sha2 0.10, hmac 0.12, hkdf 0.12, argon2 0.5, rand 0.8,
//! x25519-dalek 2). Elles garantissent qu'après une montée de version :
//! - les mots de passe d'accès existants restent valides ;
//! - les jetons de messagerie chiffrés restent lisibles ;
//! - les dépôts scellés par le portail client restent descellables ;
//! - les signatures et clés de synchronisation restent identiques (échanges portail / équipe).
//!
//! ⚠️ Ne jamais modifier ces valeurs pour faire passer un test : un échec signifie que
//! des données réelles deviendraient illisibles.
#![cfg(test)]

use argon2::password_hash::{phc::PasswordHash, PasswordVerifier};
use argon2::Argon2;

/// Empreinte Argon2id du mot de passe fictif `MotDePasse-Temoin-1!` (format stocké dans auth.json).
const ARGON2_HASH: &str =
    "$argon2id$v=19$m=19456,t=2,p=1$Q1JNdGVtb2luc2VsMDE$BCKF24G0+HxmsMBIDnpnUMY6SMGLnHsTVhCRY9y/faE";

/// Dépôt `depot-temoin-CRM` scellé pour la clé privée [7; 32] (format ESPD1 du portail).
const DEPOT_SEALED_HEX: &str = "455350443118a6b7c67974bcd8b6fb43634cdc3c400e48ef6abada07cb00ec7fa1b85881286974f8872f4426680a19968651d2010d3d42146d8d3dd674626fcbbcef2028885e7bf47e0c691c40b97db0bdfa018fdacfbbf244ce6beb88";

/// Secret `jeton-oauth-temoin` chiffré avec la clé locale [9; 32].
const OAUTH_ENCRYPTED: &str =
    "v2:BPOKmTiCBlb0Fo63ZJMQw71uh0MidNRRe9f+ZrbaTbTl9rIdkJEDzSlOpvxWKmWEv3VjBkl082Krag==";

#[test]
fn argon2_existing_password_hash_still_verifies() {
    let parsed = PasswordHash::new(ARGON2_HASH).expect("empreinte lisible");
    assert!(Argon2::default()
        .verify_password(b"MotDePasse-Temoin-1!", &parsed)
        .is_ok());
    assert!(Argon2::default()
        .verify_password(b"mauvais-mot-de-passe", &parsed)
        .is_err());
}

#[test]
fn depot_sealed_by_portal_still_unseals() {
    let sealed = crate::espace_client::depot_crypto::hex_decode(DEPOT_SEALED_HEX).unwrap();
    let plain = crate::espace_client::depot_crypto::unseal(&sealed, &[7u8; 32]).unwrap();
    assert_eq!(plain, b"depot-temoin-CRM");
}

#[test]
fn x25519_public_key_derivation_unchanged() {
    // La clé publique transmise au portail doit rester la même pour une clé privée donnée.
    let public = x25519_dalek::PublicKey::from(&x25519_dalek::StaticSecret::from([7u8; 32]));
    assert_eq!(
        crate::espace_client::depot_crypto::hex_encode(public.as_bytes()),
        "13be4feaeaf204c7fd3358fc9c00721881d174278128227ec674f37f7fe97b6d"
    );
}

#[test]
fn oauth_secret_encrypted_before_still_decrypts() {
    let plain = crate::email::oauth_secrets::decrypt_secret(OAUTH_ENCRYPTED, &[9u8; 32]).unwrap();
    assert_eq!(plain, "jeton-oauth-temoin");
}

#[test]
fn portal_push_signature_unchanged() {
    assert_eq!(
        crate::espace_client::push::sign_espace_sync_body(
            "secret-portail-temoin",
            1_700_000_000,
            b"{\"a\":1}"
        ),
        "48d34816ad1b0f53839544b02b75df2ffdcc0a32e3732c78475af10d13cb88f0"
    );
}

#[test]
fn team_sync_keys_unchanged() {
    use crate::workspace::migration::{
        compute_mutation_id, compute_payload_checksum, compute_sync_key,
    };
    assert_eq!(
        compute_sync_key("contacts", "42"),
        "ac12379bd79d923fec24e93442b93a78d8c8bd01204f93b52d10f71547f2c0ef"
    );
    assert_eq!(
        compute_payload_checksum("{\"nom\":\"DUPONT\"}"),
        "7d3700a1f1d7acc9ab736051a3f3a6d120793c6138b0768488adc84fd9c7d1d3"
    );
    assert_eq!(
        compute_mutation_id("abc", 3),
        "de5d0ba0b0a0234464ba9d92cb4f085acd2c8e9fa82c8cd46fabb79dda4231f6"
    );
}

