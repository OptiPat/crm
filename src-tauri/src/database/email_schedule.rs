//! Dates d'envoi email pour les campagnes par étiquette.

use super::models::Etiquette;
use chrono::{Datelike, Local, NaiveDate, NaiveTime, TimeZone, Weekday};

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

fn weekday_from_code(code: &str) -> Option<Weekday> {
    match code {
        "LUN" => Some(Weekday::Mon),
        "MAR" => Some(Weekday::Tue),
        "MER" => Some(Weekday::Wed),
        "JEU" => Some(Weekday::Thu),
        "VEN" => Some(Weekday::Fri),
        "SAM" => Some(Weekday::Sat),
        "DIM" => Some(Weekday::Sun),
        _ => None,
    }
}

fn code_from_weekday(wd: Weekday) -> &'static str {
    match wd {
        Weekday::Mon => "LUN",
        Weekday::Tue => "MAR",
        Weekday::Wed => "MER",
        Weekday::Thu => "JEU",
        Weekday::Fri => "VEN",
        Weekday::Sat => "SAM",
        Weekday::Sun => "DIM",
    }
}

const JOUR_ORDER: [&str; 7] = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

/// Parse la colonne / le champ déclencheur : JSON `["MAR","MER"]` ou legacy `MARDI_JEUDI`.
pub fn parse_email_envoi_jours_semaine_codes(s: &str) -> Option<Vec<Weekday>> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed == "MARDI_JEUDI" {
        return Some(vec![Weekday::Tue, Weekday::Thu]);
    }
    if !trimmed.starts_with('[') {
        return None;
    }
    let codes: Vec<String> = serde_json::from_str(trimmed).ok()?;
    let mut days: Vec<Weekday> = codes
        .iter()
        .filter_map(|c| weekday_from_code(c.trim()))
        .collect();
    if days.is_empty() {
        return None;
    }
    days.sort_by_key(|wd| {
        JOUR_ORDER
            .iter()
            .position(|c| weekday_from_code(c) == Some(*wd))
            .unwrap_or(99)
    });
    days.dedup();
    Some(days)
}

/// Canonicalise pour stockage SQLite / JSON template.
pub fn normalize_email_envoi_jours_semaine(s: &str) -> Option<String> {
    let days = parse_email_envoi_jours_semaine_codes(s)?;
    let codes: Vec<&str> = days.iter().map(|d| code_from_weekday(*d)).collect();
    serde_json::to_string(&codes).ok()
}

/// Premier jour dont le weekday est dans `allowed` (jour `from` inclus).
pub fn snap_date_to_weekdays(from: NaiveDate, allowed: &[Weekday]) -> NaiveDate {
    if allowed.is_empty() {
        return from;
    }
    for offset in 0..7 {
        let d = from + chrono::Duration::days(offset);
        if allowed.contains(&d.weekday()) {
            return d;
        }
    }
    from
}

fn apply_jours_semaine(date: NaiveDate, jours_semaine: Option<&str>) -> NaiveDate {
    if let Some(allowed) = jours_semaine.and_then(parse_email_envoi_jours_semaine_codes) {
        snap_date_to_weekdays(date, &allowed)
    } else {
        date
    }
}

/// Créneau horaire le jour calendaire de `anchor_unix` (sans report « immédiat » si l'heure est passée).
pub(crate) fn calendar_slot_on_anchor_day(
    anchor_unix: i64,
    heure: &str,
    jours_semaine: Option<&str>,
) -> Option<i64> {
    let (h, m) = parse_email_heure(heure)?;
    let anchor = Local.timestamp_opt(anchor_unix, 0).single()?;
    let date = apply_jours_semaine(anchor.date_naive(), jours_semaine);
    let time = NaiveTime::from_hms_opt(h, m, 0)?;
    let slot_naive = date.and_time(time);
    Local.from_local_datetime(&slot_naive)
        .single()
        .map(|dt| dt.timestamp())
}

/// Heure d'envoi le jour de l'éligibilité : créneau à `heure` si pas encore passé, sinon immédiat.
pub fn send_at_eligibility_slot(
    eligible_at_unix: i64,
    heure: &str,
    jours_semaine: Option<&str>,
) -> Option<i64> {
    let (h, m) = parse_email_heure(heure)?;
    let eligible = Local.timestamp_opt(eligible_at_unix, 0).single()?;
    let date = apply_jours_semaine(eligible.date_naive(), jours_semaine);
    let time = NaiveTime::from_hms_opt(h, m, 0)?;
    let slot_naive = date.and_time(time);
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
    let jours = etiquette
        .email_envoi_jours_semaine
        .as_deref()
        .filter(|s| !s.is_empty());
    let mut anchor = eligible_at_unix;
    if etiquette.email_delai_jours > 0 {
        anchor += etiquette.email_delai_jours * 24 * 60 * 60;
    }
    if let Some(ref heure) = etiquette.email_envoi_heure {
        if etiquette.email_delai_jours > 0 {
            return calendar_slot_on_anchor_day(anchor, heure, jours);
        }
        return send_at_eligibility_slot(anchor, heure, jours);
    }
    if etiquette.email_delai_jours > 0 {
        return Some(anchor);
    }
    // Sans délai ni créneau : prêt dès l'attribution (évite email_date_prevue NULL → « À compléter »).
    Some(eligible_at_unix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_prevue_immediate_when_no_delai_nor_slot() {
        use super::super::models::Etiquette;
        let eligible = 1_700_000_000_i64;
        let etiqu = Etiquette {
            id: 1,
            nom: "Test".into(),
            couleur: "#000".into(),
            icone: None,
            description: None,
            priorite: 0,
            auto_condition_type: None,
            auto_condition_config: None,
            auto_categories: None,
            email_template_id: Some(1),
            email_delai_jours: 0,
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: true,
            is_default: false,
            actif: true,
            segment_id: None,
            pipeline_actif: false,
            created_at: 0,
            updated_at: 0,
        };
        assert_eq!(
            resolve_email_date_prevue_for_contact(&etiqu, eligible),
            Some(eligible)
        );
    }

    #[test]
    fn parse_heure_valid() {
        assert_eq!(parse_email_heure("09:30"), Some((9, 30)));
        assert_eq!(normalize_email_heure("9:5"), Some("09:05".to_string()));
    }

    #[test]
    fn snap_mercredi_from_friday() {
        let fri = NaiveDate::from_ymd_opt(2026, 5, 29).unwrap();
        let snapped = snap_date_to_weekdays(fri, &[Weekday::Wed]);
        assert_eq!(snapped.weekday(), Weekday::Wed);
        assert_eq!(snapped, NaiveDate::from_ymd_opt(2026, 6, 3).unwrap());
    }

    #[test]
    fn snap_mardi_jeudi_legacy_codes() {
        let fri = NaiveDate::from_ymd_opt(2026, 5, 29).unwrap();
        let allowed = parse_email_envoi_jours_semaine_codes("MARDI_JEUDI").unwrap();
        let snapped = snap_date_to_weekdays(fri, &allowed);
        assert_eq!(snapped.weekday(), Weekday::Tue);
    }

    #[test]
    fn normalize_json_jours() {
        assert_eq!(
            normalize_email_envoi_jours_semaine(r#"["MER","MAR"]"#).as_deref(),
            Some(r#"["MAR","MER"]"#)
        );
    }

    #[test]
    fn send_at_slot_same_day_after_eligible() {
        use chrono::{Local, TimeZone};
        let noon = Local
            .with_ymd_and_hms(2026, 5, 28, 12, 0, 0)
            .unwrap()
            .timestamp();
        let slot = send_at_eligibility_slot(noon, "14:00", None).unwrap();
        let expected = Local
            .with_ymd_and_hms(2026, 5, 28, 14, 0, 0)
            .unwrap()
            .timestamp();
        assert_eq!(slot, expected);
    }

    #[test]
    fn delai_then_heure_on_anchor_day() {
        use super::super::models::Etiquette;
        use chrono::{Local, TimeZone};
        let souscription = Local
            .with_ymd_and_hms(2026, 5, 28, 14, 0, 0)
            .unwrap()
            .timestamp();
        let etiqu = Etiquette {
            id: 1,
            nom: "Test".into(),
            couleur: "#000".into(),
            icone: None,
            description: None,
            priorite: 0,
            auto_condition_type: None,
            auto_condition_config: None,
            auto_categories: None,
            email_template_id: Some(1),
            email_delai_jours: 1,
            email_envoi_prevu: None,
            email_envoi_heure: Some("09:00".into()),
            email_envoi_jours_semaine: None,
            email_actif: true,
            is_default: false,
            actif: true,
            segment_id: None,
            pipeline_actif: false,
            created_at: 0,
            updated_at: 0,
        };
        let prevue = resolve_email_date_prevue_for_contact(&etiqu, souscription).unwrap();
        let expected = Local
            .with_ymd_and_hms(2026, 5, 29, 9, 0, 0)
            .unwrap()
            .timestamp();
        assert_eq!(prevue, expected);
    }

    #[test]
    fn delai_45_mercredi_from_friday_signature() {
        use super::super::models::Etiquette;
        use chrono::{Local, TimeZone, Timelike};
        let souscription = Local
            .with_ymd_and_hms(2026, 1, 2, 10, 0, 0)
            .unwrap()
            .timestamp();
        let etiqu = Etiquette {
            id: 1,
            nom: "Reco".into(),
            couleur: "#000".into(),
            icone: None,
            description: None,
            priorite: 0,
            auto_condition_type: None,
            auto_condition_config: None,
            auto_categories: None,
            email_template_id: Some(1),
            email_delai_jours: 45,
            email_envoi_prevu: None,
            email_envoi_heure: Some("19:00".into()),
            email_envoi_jours_semaine: Some(r#"["MER"]"#.into()),
            email_actif: true,
            is_default: false,
            actif: true,
            segment_id: None,
            pipeline_actif: false,
            created_at: 0,
            updated_at: 0,
        };
        let prevue = resolve_email_date_prevue_for_contact(&etiqu, souscription).unwrap();
        let dt = Local.timestamp_opt(prevue, 0).single().unwrap();
        assert_eq!(dt.weekday(), Weekday::Wed);
        assert_eq!(dt.hour(), 19);
        assert_eq!(dt.minute(), 0);
    }

    #[test]
    fn send_at_slot_immediate_if_heure_passed() {
        use chrono::{Local, TimeZone};
        let afternoon = Local
            .with_ymd_and_hms(2026, 5, 28, 15, 30, 0)
            .unwrap()
            .timestamp();
        let slot = send_at_eligibility_slot(afternoon, "09:00", None).unwrap();
        assert_eq!(slot, afternoon);
    }
}
