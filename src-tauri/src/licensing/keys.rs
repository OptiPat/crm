use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const SIGNATURE_BYTES: usize = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedLicense {
    pub license_type: String,
    pub expires_at: Option<i64>,
}

pub fn signing_secret() -> Option<&'static str> {
    non_empty_env(option_env!("LICENSE_SIGNING_SECRET"))
}

fn non_empty_env(value: Option<&'static str>) -> Option<&'static str> {
    value.filter(|entry| !entry.is_empty())
}

pub fn compute_state_integrity(state: &super::state::LicenseState, secret: &str) -> String {
    let payload = format!(
        "{}|{:?}|{}|{}|{}|{}",
        state.installation_id,
        state.status,
        state.expires_at.unwrap_or(0),
        state.license_type.as_deref().unwrap_or(""),
        state.activated_at,
        state.trial_restart_count
    );
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepte toute taille de cle");
    mac.update(payload.as_bytes());
    let bytes = mac.finalize().into_bytes();
    bytes
        .iter()
        .take(8)
        .map(|b| format!("{b:02X}"))
        .collect::<String>()
}

pub fn verify_state_integrity(state: &super::state::LicenseState) -> bool {
    match signing_secret() {
        Some(secret) => match &state.state_integrity {
            Some(expected) => compute_state_integrity(state, secret) == *expected,
            None => false,
        },
        None => true,
    }
}

pub fn attach_state_integrity(state: &mut super::state::LicenseState) {
    state.state_integrity = signing_secret().map(|secret| compute_state_integrity(state, secret));
}

pub fn validate_license_key(key: &str, secret: &str) -> Result<ValidatedLicense, String> {
    let normalized = key.trim().to_uppercase();
    let parts: Vec<&str> = normalized.split('-').collect();
    if parts.len() != 4 {
        return Err("Format de clé invalide (attendu : XXXX-XXXX-XXXX-XXXX).".to_string());
    }
    for part in &parts {
        if part.len() != 4 || !part.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err("Chaque segment de la clé doit contenir 4 caractères alphanumériques.".to_string());
        }
    }

    let payload = format!("{}-{}-{}", parts[0], parts[1], parts[2]);
    let expected = compute_signature(secret, &payload);
    if parts[3] != expected {
        return Err("Clé de licence invalide.".to_string());
    }

    match parts[0].as_ref() {
        "ANNU" => {
            let expires_at = parse_yymm_expiry(parts[1])?;
            Ok(ValidatedLicense {
                license_type: "annual".to_string(),
                expires_at: Some(expires_at),
            })
        }
        "LIFE" => Ok(ValidatedLicense {
            license_type: "lifetime".to_string(),
            expires_at: None,
        }),
        _ => Err("Type de licence inconnu.".to_string()),
    }
}

#[cfg(test)]
pub fn generate_license_key(
    license_type: &str,
    expiry_yymm: Option<&str>,
    secret: &str,
) -> Result<String, String> {
    let type_code = match license_type {
        "annual" | "ANNU" => "ANNU",
        "lifetime" | "LIFE" => "LIFE",
        _ => return Err("Type inconnu (annual ou lifetime).".to_string()),
    };
    let expiry_part = match type_code {
        "ANNU" => {
            let yymm = expiry_yymm.ok_or("Date d'expiration requise (YYMM).")?;
            if yymm.len() != 4 || !yymm.chars().all(|c| c.is_ascii_digit()) {
                return Err("YYMM invalide.".to_string());
            }
            yymm.to_uppercase()
        }
        _ => "0000".to_string(),
    };
    let random_part = random_segment();
    let payload = format!("{type_code}-{expiry_part}-{random_part}");
    let signature = compute_signature(secret, &payload);
    Ok(format!("{payload}-{signature}"))
}

fn compute_signature(secret: &str, payload: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepte toute taille de cle");
    mac.update(payload.as_bytes());
    let bytes = mac.finalize().into_bytes();
    bytes
        .iter()
        .take(SIGNATURE_BYTES)
        .map(|b| format!("{b:02X}"))
        .collect::<String>()
}

fn parse_yymm_expiry(yymm: &str) -> Result<i64, String> {
    let year = yymm[0..2]
        .parse::<i32>()
        .map_err(|_| "Année invalide dans la clé.")?;
    let month = yymm[2..4]
        .parse::<u32>()
        .map_err(|_| "Mois invalide dans la clé.")?;
    if !(1..=12).contains(&month) {
        return Err("Mois invalide dans la clé.".to_string());
    }
    let full_year = 2000 + year;
    let next_month = if month == 12 {
        chrono::NaiveDate::from_ymd_opt(full_year + 1, 1, 1)
    } else {
        chrono::NaiveDate::from_ymd_opt(full_year, month + 1, 1)
    }
    .ok_or("Date d'expiration invalide.")?;
    Ok((next_month - chrono::Days::new(1))
        .and_hms_opt(23, 59, 59)
        .ok_or("Date d'expiration invalide.")?
        .and_utc()
        .timestamp())
}

#[cfg(test)]
fn random_segment() -> String {
    use rand::Rng;
    const CHARS: &[u8] = b"0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let mut rng = rand::thread_rng();
    (0..4)
        .map(|_| {
            let idx = rng.gen_range(0..CHARS.len());
            CHARS[idx] as char
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SECRET: &str = "test-secret-licence-crm";

    #[test]
    fn annual_key_roundtrip() {
        let key = generate_license_key("annual", Some("2706"), TEST_SECRET).unwrap();
        let validated = validate_license_key(&key, TEST_SECRET).unwrap();
        assert_eq!(validated.license_type, "annual");
        assert!(validated.expires_at.is_some());
    }

    #[test]
    fn lifetime_key_roundtrip() {
        let key = generate_license_key("lifetime", None, TEST_SECRET).unwrap();
        let validated = validate_license_key(&key, TEST_SECRET).unwrap();
        assert_eq!(validated.license_type, "lifetime");
        assert!(validated.expires_at.is_none());
    }

    #[test]
    fn wrong_secret_fails() {
        let key = generate_license_key("annual", Some("2706"), TEST_SECRET).unwrap();
        assert!(validate_license_key(&key, "wrong-secret").is_err());
    }

    #[test]
    fn state_integrity_tamper_fails() {
        use super::super::state::{LicenseState, LicenseStatus};

        let mut state = LicenseState {
            installation_id: "id".into(),
            status: LicenseStatus::Active,
            license_type: Some("lifetime".into()),
            license_key_masked: None,
            client_email: Some("a@example.com".into()),
            client_name: None,
            cabinet: None,
            activated_at: 0,
            expires_at: None,
            installed_at: 0,
            legacy: false,
            registry_synced: true,
            last_heartbeat_at: None,
            trial_restart_count: 0,
            state_integrity: None,
        };
        let signature = compute_state_integrity(&state, TEST_SECRET);
        state.state_integrity = Some(signature);
        state.status = LicenseStatus::Expired;
        assert_ne!(
            state.state_integrity.as_deref(),
            Some(compute_state_integrity(&state, TEST_SECRET).as_str())
        );
    }
}
