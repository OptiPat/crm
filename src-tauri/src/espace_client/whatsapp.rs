//! Lien « cliquez pour discuter » vers le WhatsApp du cabinet.
//!
//! Pas d'API Business : `https://wa.me/…` ouvre l'application sur téléphone
//! et WhatsApp Web (ou l'appli bureau) sur ordinateur.

/// Chiffres internationaux sans « + », pour `wa.me` (ex. 33612345678).
pub fn whatsapp_digits(telephone: &str) -> Option<String> {
    let raw: String = telephone.chars().filter(|c| c.is_ascii_digit()).collect();
    if raw.is_empty() {
        return None;
    }
    let digits = if raw.starts_with("00") && raw.len() > 4 {
        raw[2..].to_string()
    } else {
        raw
    };

    // +33 06 12 34 56 78 → 3306… (12 chiffres). Le 0 national n'a rien à
    // faire après l'indicatif : WhatsApp attend 336…, pas 3306…
    if digits.len() == 12 && digits.starts_with("330") {
        let fourth = digits.as_bytes().get(3).copied()?;
        if fourth == b'6' || fourth == b'7' {
            return Some(format!("33{}", &digits[3..]));
        }
        return None;
    }

    if digits.len() == 11 && digits.starts_with("33") {
        let third = digits.as_bytes().get(2).copied()?;
        if third == b'6' || third == b'7' {
            return Some(digits);
        }
        return None;
    }
    if digits.len() == 10 && digits.starts_with('0') {
        let second = digits.as_bytes().get(1).copied()?;
        if second == b'6' || second == b'7' {
            return Some(format!("33{}", &digits[1..]));
        }
        return None;
    }
    if digits.len() == 9 && (digits.starts_with('6') || digits.starts_with('7')) {
        return Some(format!("33{digits}"));
    }
    if digits.len() == 11 && digits.starts_with("07") {
        return Some(format!("44{}", &digits[1..]));
    }
    if (10..=15).contains(&digits.len()) {
        return Some(digits);
    }
    None
}

pub fn build_whatsapp_click_url(telephone: &str) -> Option<String> {
    let digits = whatsapp_digits(telephone)?;
    Some(format!("https://wa.me/{digits}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_french_mobile() {
        assert_eq!(whatsapp_digits("06 12 34 56 78").as_deref(), Some("33612345678"));
        assert_eq!(whatsapp_digits("+33 6 12 34 56 78").as_deref(), Some("33612345678"));
        assert_eq!(whatsapp_digits("+33 06 12 34 56 78").as_deref(), Some("33612345678"));
        assert_eq!(whatsapp_digits("0033 06 12 34 56 78").as_deref(), Some("33612345678"));
        assert_eq!(whatsapp_digits("07 12 34 56 78").as_deref(), Some("33712345678"));
    }

    #[test]
    fn rejects_french_landline() {
        assert_eq!(whatsapp_digits("01 23 45 67 89"), None);
        assert_eq!(whatsapp_digits("+33 1 23 45 67 89"), None);
        assert_eq!(whatsapp_digits("+33 01 23 45 67 89"), None);
    }

    #[test]
    fn accepts_international_mobile() {
        assert_eq!(whatsapp_digits("+44 7123 456789").as_deref(), Some("447123456789"));
        assert_eq!(whatsapp_digits("07123 456789").as_deref(), Some("447123456789"));
    }

    #[test]
    fn builds_wa_me_url_without_prefilled_text() {
        assert_eq!(
            build_whatsapp_click_url("0612345678").as_deref(),
            Some("https://wa.me/33612345678")
        );
    }
}
