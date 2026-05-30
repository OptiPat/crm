//! Dates d'envoi email pour les campagnes par étiquette.

use super::models::Etiquette;
use chrono::{Local, NaiveTime, TimeZone};

/// Parse « HH:MM » ou « H:MM ».
pub fn parse_email_heure(s: &str) -> Option<(u32, u32)> {
    let trimmed = s.trim();
    let (h_str, m_str) = trimmed.split_once(':')?;
    let h: u32 = h_str.parse().ok()?;
    let m: u32 = m_str.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some((h, m))
}

pub fn normalize_email_heure(s: &str) -> Option<String> {
    let (h, m) = parse_email_heure(s)?;
    Some(format!("{:02}:{:02}", h, m))
}

/// Heure d'envoi le jour de l'éligibilité : créneau à `heure` si pas encore passé, sinon immédiat.
pub fn send_at_eligibility_slot(eligible_at_unix: i64, heure: &str) -> Option<i64> {
    let (h, m) = parse_email_heure(heure)?;
    let eligible = Local.timestamp_opt(eligible_at_unix, 0).single()?;
    let time = NaiveTime::from_hms_opt(h, m, 0)?;
    let slot_naive = eligible.date_naive().and_time(time);
    let slot = Local.from_local_datetime(&slot_naive).single()?;
    let slot_unix = slot.timestamp();
    if slot_unix >= eligible_at_unix {
        Some(slot_unix)
    } else {
        Some(eligible_at_unix)
    }
}

/// Date/heure prévue pour un contact (éligibilité = date d'attribution ou maintenant).
pub fn resolve_email_date_prevue_for_contact(
    etiquette: &Etiquette,
    eligible_at_unix: i64,
) -> Option<i64> {
    if !etiquette.actif || !etiquette.email_actif {
        return None;
    }
    if let Some(ts) = etiquette.email_envoi_prevu {
        return Some(ts);
    }
    if let Some(ref heure) = etiquette.email_envoi_heure {
        return send_at_eligibility_slot(eligible_at_unix, heure);
    }
    if etiquette.email_delai_jours > 0 {
        return Some(eligible_at_unix + etiquette.email_delai_jours * 24 * 60 * 60);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_heure_valid() {
        assert_eq!(parse_email_heure("09:30"), Some((9, 30)));
        assert_eq!(normalize_email_heure("9:5"), Some("09:05".to_string()));
    }

    #[test]
    fn send_at_slot_same_day_after_eligible() {
        use chrono::{Local, TimeZone};
        let noon = Local
            .with_ymd_and_hms(2026, 5, 28, 12, 0, 0)
            .unwrap()
            .timestamp();
        let slot = send_at_eligibility_slot(noon, "14:00").unwrap();
        let expected = Local
            .with_ymd_and_hms(2026, 5, 28, 14, 0, 0)
            .unwrap()
            .timestamp();
        assert_eq!(slot, expected);
    }

    #[test]
    fn send_at_slot_immediate_if_heure_passed() {
        use chrono::{Local, TimeZone};
        let afternoon = Local
            .with_ymd_and_hms(2026, 5, 28, 15, 30, 0)
            .unwrap()
            .timestamp();
        let slot = send_at_eligibility_slot(afternoon, "09:00").unwrap();
        assert_eq!(slot, afternoon);
    }
}
