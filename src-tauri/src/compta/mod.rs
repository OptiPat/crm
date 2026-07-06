//! Synchronisation comptabilité (Google Drive + Agenda).

pub mod calendar;
pub mod commands;
pub mod distance;
pub mod drive;

pub(crate) fn normalize_folder_key(name: &str) -> String {
    name.to_lowercase()
        .replace('é', "e")
        .replace('è', "e")
        .replace('ê', "e")
        .replace('à', "a")
        .replace('â', "a")
        .replace('ù', "u")
        .replace('û', "u")
        .replace('ô', "o")
        .replace('î', "i")
        .replace('ï', "i")
        .replace('ç', "c")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn compta_drive_folder_name(year: i32, month: u32, kind: &str) -> String {
    const MOIS: [&str; 12] = [
        "Janvier",
        "Février",
        "Mars",
        "Avril",
        "Mai",
        "Juin",
        "Juillet",
        "Août",
        "Septembre",
        "Octobre",
        "Novembre",
        "Décembre",
    ];
    let m = month.clamp(1, 12) as usize;
    format!("{} {} - {}", MOIS[m - 1], year, kind)
}

pub(crate) fn month_time_bounds_rfc3339(year: i32, month: u32) -> (String, String) {
    use chrono::{Local, TimeZone};
    let start = Local
        .with_ymd_and_hms(year, month, 1, 0, 0, 0)
        .single()
        .unwrap_or_else(|| Local.from_local_datetime(&chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap().and_hms_opt(0, 0, 0).unwrap()).unwrap());
    let (next_y, next_m) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let end = Local
        .with_ymd_and_hms(next_y, next_m, 1, 0, 0, 0)
        .single()
        .unwrap_or(start);
    (start.to_rfc3339(), end.to_rfc3339())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_name_juillet_encaissements() {
        assert_eq!(
            compta_drive_folder_name(2026, 7, "Encaissements"),
            "Juillet 2026 - Encaissements"
        );
    }

    #[test]
    fn normalize_matches_accent_variants() {
        let a = normalize_folder_key("Juillet 2026 - Dépenses");
        let b = normalize_folder_key("juillet 2026 - Depenses");
        assert_eq!(a, b);
    }
}
