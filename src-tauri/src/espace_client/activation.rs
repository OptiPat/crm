use rand::Rng;

use super::push::sign_espace_sync_body;

/// Code à six chiffres pour activation orale ou connexion.
pub fn generate_six_digit_code() -> String {
    let n = rand::thread_rng().gen_range(100_000..1_000_000);
    format!("{n:06}")
}

pub fn hash_espace_otp(secret: &str, code: &str) -> String {
    sign_espace_sync_body(secret, 0, code.trim().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_six_digit_codes() {
        let code = generate_six_digit_code();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_digit()));
    }

    #[test]
    fn otp_hash_is_stable() {
        let a = hash_espace_otp("secret", "123456");
        let b = hash_espace_otp("secret", "123456");
        assert_eq!(a, b);
        assert_ne!(a, hash_espace_otp("other", "123456"));
    }
}
