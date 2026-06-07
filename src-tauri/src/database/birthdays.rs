//! Anniversaires du jour — source pour l'API locale n8n.

use chrono::{Datelike, Local, TimeZone, Utc};
use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayContactToday {
    pub id: i64,
    pub prenom: String,
    pub nom: String,
    pub display_name: String,
    pub civilite: Option<String>,
    pub categorie: String,
    pub registre: String,
    pub age: Option<i32>,
    pub birth_date: String,
}

pub fn birth_month_day_from_unix(unix: i64) -> (u32, u32) {
    let dt = Utc
        .timestamp_opt(unix, 0)
        .single()
        .expect("valid unix timestamp");
    (dt.month(), dt.day())
}

pub fn today_month_day_local() -> (u32, u32) {
    let now = Local::now();
    (now.month(), now.day())
}

pub fn is_birthday_today(date_naissance_unix: i64) -> bool {
    let birth = birth_month_day_from_unix(date_naissance_unix);
    let today = today_month_day_local();
    birth.0 == today.0 && birth.1 == today.1
}

pub fn compute_age_at_date(date_naissance_unix: i64, ref_date: chrono::DateTime<Local>) -> i32 {
    let birth = Utc
        .timestamp_opt(date_naissance_unix, 0)
        .single()
        .expect("valid unix timestamp");
    let birth_year = birth.year();
    let birth_month = birth.month();
    let birth_day = birth.day();

    let mut age = ref_date.year() - birth_year;
    let ref_month = ref_date.month();
    let ref_day = ref_date.day();

    if ref_month < birth_month || (ref_month == birth_month && ref_day < birth_day) {
        age -= 1;
    }
    age
}

fn format_birth_date_label(unix: i64) -> String {
    let dt = Utc.timestamp_opt(unix, 0).single().expect("valid unix timestamp");
    if dt.year() > 1970 {
        format!("{}/{}/{}", dt.day(), dt.month(), dt.year())
    } else {
        format!("{}/{}", dt.day(), dt.month())
    }
}

fn map_row_to_candidate(
    id: i64,
    civilite: Option<String>,
    nom: String,
    prenom: String,
    categorie: String,
    registre: Option<String>,
    date_naissance: i64,
) -> BirthdayContactToday {
    let now = Local::now();
    let age = compute_age_at_date(date_naissance, now);
    BirthdayContactToday {
        id,
        display_name: format!("{} {}", prenom.trim(), nom.trim()).trim().to_string(),
        prenom,
        nom,
        civilite,
        categorie,
        registre: registre.unwrap_or_else(|| "VOUS".to_string()),
        age: Some(age),
        birth_date: format_birth_date_label(date_naissance),
    }
}

pub fn list_birthdays_today_from_connection(conn: &Connection) -> Result<Vec<BirthdayContactToday>> {
    let mut stmt = conn.prepare(
        "SELECT id, civilite, nom, prenom, categorie, registre, date_naissance
         FROM contacts
         WHERE date_naissance IS NOT NULL
           AND date_naissance > 0
           AND statut_suivi != 'ARCHIVE'
         ORDER BY nom COLLATE NOCASE, prenom COLLATE NOCASE",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, i64>(6)?,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        let (id, civilite, nom, prenom, categorie, registre, date_naissance) = row?;
        if is_birthday_today(date_naissance) {
            out.push(map_row_to_candidate(
                id,
                civilite,
                nom,
                prenom,
                categorie,
                registre,
                date_naissance,
            ));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn seed_contact(
        conn: &Connection,
        nom: &str,
        prenom: &str,
        categorie: &str,
        date_naissance: i64,
        statut: &str,
    ) {
        conn.execute(
            "INSERT INTO contacts (nom, prenom, categorie, date_naissance, statut_suivi, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, 1)",
            params![nom, prenom, categorie, date_naissance, statut],
        )
        .unwrap();
    }

    fn init_minimal_contacts_table(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                categorie TEXT NOT NULL,
                civilite TEXT,
                registre TEXT,
                date_naissance INTEGER,
                statut_suivi TEXT NOT NULL DEFAULT 'ACTIF',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )
        .unwrap();
    }

    #[test]
    fn includes_all_categories_with_birthday_today() {
        let conn = Connection::open_in_memory().unwrap();
        init_minimal_contacts_table(&conn);

        let (month, day) = today_month_day_local();
        let year = 1990_i32;
        let unix = Utc
            .with_ymd_and_hms(year, month, day, 0, 0, 0)
            .single()
            .unwrap()
            .timestamp();

        seed_contact(&conn, "Client", "Alice", "CLIENT", unix, "ACTIF");
        seed_contact(&conn, "Filleul", "Bob", "FILLEUL", unix, "ACTIF");
        seed_contact(&conn, "Prescripteur", "Carol", "PRESCRIPTEUR", unix, "ACTIF");

        let list = list_birthdays_today_from_connection(&conn).unwrap();
        assert_eq!(list.len(), 3);
        assert!(list.iter().any(|c| c.categorie == "PRESCRIPTEUR"));
    }

    #[test]
    fn excludes_archived_and_missing_birthday() {
        let conn = Connection::open_in_memory().unwrap();
        init_minimal_contacts_table(&conn);

        let (month, day) = today_month_day_local();
        let unix = Utc
            .with_ymd_and_hms(1985, month, day, 0, 0, 0)
            .single()
            .unwrap()
            .timestamp();

        seed_contact(&conn, "Archive", "Dan", "CLIENT", unix, "ARCHIVE");
        seed_contact(&conn, "SansDate", "Eve", "CLIENT", 0, "ACTIF");

        let list = list_birthdays_today_from_connection(&conn).unwrap();
        assert!(list.is_empty());
    }
}
