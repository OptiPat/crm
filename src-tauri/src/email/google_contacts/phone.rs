//! Normalisation téléphone FR — matching uniquement ; affichage CRM inchangé (06…).

/// Chiffres significatifs FR pour comparaison (9 chiffres mobile, sans le 0 initial).
pub fn normalize_phone_for_match(raw: &str) -> Option<String> {
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    if digits.len() == 10 && digits.starts_with('0') {
        return Some(digits[1..].to_string());
    }
    if digits.len() == 11 && digits.starts_with("33") {
        return Some(digits[2..].to_string());
    }
    if digits.len() == 12 && digits.starts_with("0033") {
        return Some(digits[4..].to_string());
    }
    if digits.len() == 9 && (digits.starts_with('6') || digits.starts_with('7')) {
        return Some(digits);
    }
    Some(digits)
}

pub fn phones_match(a: &str, b: &str) -> bool {
    match (
        normalize_phone_for_match(a),
        normalize_phone_for_match(b),
    ) {
        (Some(x), Some(y)) => x == y,
        _ => false,
    }
}

/// Valeur à envoyer à Google : conserve le format CRM si déjà en 06…
pub fn phone_for_google_export(crm_value: &str) -> String {
    let trimmed = crm_value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if normalize_phone_for_match(trimmed).is_some() && !trimmed.starts_with('+') {
        return trimmed.to_string();
    }
    if let Some(nine) = normalize_phone_for_match(trimmed) {
        if nine.len() == 9 && (nine.starts_with('6') || nine.starts_with('7')) {
            return format!("0{nine}");
        }
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_variants_same_mobile() {
        assert_eq!(
            normalize_phone_for_match("06 12 34 56 78"),
            Some("612345678".into())
        );
        assert_eq!(
            normalize_phone_for_match("+33612345678"),
            Some("612345678".into())
        );
        assert_eq!(
            normalize_phone_for_match("0612345678"),
            Some("612345678".into())
        );
    }

    #[test]
    fn phones_match_across_formats() {
        assert!(phones_match("06 12 34 56 78", "+33612345678"));
        assert!(!phones_match("06 12 34 56 78", "07 11 11 11 11"));
    }

    #[test]
    fn export_keeps_06_style() {
        assert_eq!(
            phone_for_google_export("06 12 34 56 78"),
            "06 12 34 56 78"
        );
        assert_eq!(phone_for_google_export("+33612345678"), "0612345678");
    }
}
