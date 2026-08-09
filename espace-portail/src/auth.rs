use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub const REPLAY_WINDOW_SECS: i64 = 300;

pub fn verify_espace_sync_signature(
    secret: &str,
    timestamp: i64,
    body: &[u8],
    signature_hex: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    if (now - timestamp).abs() > REPLAY_WINDOW_SECS {
        return Err("Horodatage hors fenêtre anti-rejeu".into());
    }

    let expected = sign_espace_sync_body(secret, timestamp, body);
    if !constant_time_eq(signature_hex.trim(), &expected) {
        return Err("Signature invalide".into());
    }
    Ok(())
}

/// Signe les octets bruts du corps. Passer par `from_utf8_lossy` ferait
/// collisionner deux corps distincts sur une même signature (octets invalides
/// remplacés par U+FFFD). Doit rester identique à `espace_client::push` du CRM.
pub fn sign_espace_sync_body(secret: &str, timestamp: i64, body: &[u8]) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepte toute taille de cle");
    mac.update(timestamp.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signatures_use_hex_sha256() {
        let body = br#"{"schemaVersion":1}"#;
        let sig = sign_espace_sync_body("secret-test", 1_700_000_000, body);
        assert_eq!(sig.len(), 64);
        assert!(sig.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn distinct_invalid_utf8_bodies_get_distinct_signatures() {
        let a = sign_espace_sync_body("secret-test", 1_700_000_000, &[0xC3, 0x28]);
        let b = sign_espace_sync_body("secret-test", 1_700_000_000, &[0xC3, 0x29]);
        assert_ne!(a, b);
    }

    #[test]
    fn rejects_signature_outside_replay_window() {
        let body = br#"{"schemaVersion":1}"#;
        let stale = chrono::Utc::now().timestamp() - REPLAY_WINDOW_SECS - 1;
        let sig = sign_espace_sync_body("secret-test", stale, body);
        assert!(verify_espace_sync_signature("secret-test", stale, body, &sig).is_err());
    }

    #[test]
    fn accepts_a_fresh_valid_signature() {
        let body = br#"{"schemaVersion":1}"#;
        let now = chrono::Utc::now().timestamp();
        let sig = sign_espace_sync_body("secret-test", now, body);
        assert!(verify_espace_sync_signature("secret-test", now, body, &sig).is_ok());
        assert!(verify_espace_sync_signature("autre-secret", now, body, &sig).is_err());
    }
}
