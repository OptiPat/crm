//! Anniversaires du jour — source pour l'API locale n8n.

use chrono::{Datelike, Local, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result};
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
    /// Libelle humain du type produit principal (ex. « assurance-vie », « SCPI »), sans nom de fonds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patrimoine_type: Option<String>,
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

fn normalize_registre(registre: Option<String>) -> String {
    match registre.as_deref().map(|s| s.trim().to_uppercase()) {
        Some(r) if r == "TU" => "TU".to_string(),
        _ => "VOUS".to_string(),
    }
}

/// Libelle court pour Mistral (type seulement, jamais le nom du produit).
pub fn type_produit_label(type_produit: &str) -> String {
    match type_produit.trim().to_uppercase().as_str() {
        "SCPI" => "SCPI".to_string(),
        "SCPI_DEMEMBREMENT" => "SCPI démembrement".to_string(),
        "SCPI_FISCALE" => "SCPI fiscale".to_string(),
        "ASSURANCE_VIE" => "assurance-vie".to_string(),
        "PER" => "PER".to_string(),
        "IMMOBILIER" => "immobilier".to_string(),
        "FIP_FCPI" => "FIP/FCPI".to_string(),
        "FCPR" => "FCPR".to_string(),
        "G3F" => "G3F".to_string(),
        "PINEL" => "Pinel".to_string(),
        "LMNP" | "LMP" => "LMNP/LMP".to_string(),
        "AUTRE" => "placement".to_string(),
        other => other
            .replace('_', " ")
            .to_lowercase()
            .split_whitespace()
            .map(|w| {
                let mut chars = w.chars();
                match chars.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + chars.as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

/// Investissement « signature » : MON_CONSEIL d'abord, puis montant / date.
pub fn pick_patrimoine_type(
    conn: &Connection,
    contact_id: i64,
    foyer_id: Option<i64>,
) -> Result<Option<String>> {
    let type_code: Option<String> = conn
        .query_row(
            "SELECT i.type_produit
         FROM investissements i
         WHERE i.contact_id = ?1
            OR (?2 IS NOT NULL AND i.foyer_id = ?2)
         ORDER BY
           CASE WHEN i.origine = 'MON_CONSEIL' THEN 0 ELSE 1 END,
           COALESCE(i.montant_initial, 0) DESC,
           COALESCE(i.date_souscription, 0) DESC,
           i.id DESC
         LIMIT 1",
            params![contact_id, foyer_id],
            |row| row.get(0),
        )
        .optional()?;

    Ok(type_code.map(|t| type_produit_label(&t)))
}

fn map_row_to_candidate(
    conn: &Connection,
    id: i64,
    civilite: Option<String>,
    nom: String,
    prenom: String,
    categorie: String,
    registre: Option<String>,
    date_naissance: i64,
    foyer_id: Option<i64>,
) -> Result<BirthdayContactToday> {
    let now = Local::now();
    let age = compute_age_at_date(date_naissance, now);
    let patrimoine_type = pick_patrimoine_type(conn, id, foyer_id)?;
    Ok(BirthdayContactToday {
        id,
        display_name: format!("{} {}", prenom.trim(), nom.trim()).trim().to_string(),
        prenom,
        nom,
        civilite,
        categorie,
        registre: normalize_registre(registre),
        age: Some(age),
        birth_date: format_birth_date_label(date_naissance),
        patrimoine_type,
    })
}

pub fn list_birthdays_today_from_connection(conn: &Connection) -> Result<Vec<BirthdayContactToday>> {
    let mut stmt = conn.prepare(
        "SELECT id, civilite, nom, prenom, categorie, registre, date_naissance, foyer_id
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
            row.get::<_, Option<i64>>(7)?,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        let (id, civilite, nom, prenom, categorie, registre, date_naissance, foyer_id) = row?;
        if is_birthday_today(date_naissance) {
            out.push(map_row_to_candidate(
                conn,
                id,
                civilite,
                nom,
                prenom,
                categorie,
                registre,
                date_naissance,
                foyer_id,
            )?);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    fn seed_contact(
        conn: &Connection,
        nom: &str,
        prenom: &str,
        categorie: &str,
        date_naissance: i64,
        statut: &str,
    ) -> i64 {
        conn.execute(
            "INSERT INTO contacts (nom, prenom, categorie, date_naissance, statut_suivi, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, 1)",
            params![nom, prenom, categorie, date_naissance, statut],
        )
        .unwrap();
        conn.last_insert_rowid()
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
                foyer_id INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )
        .unwrap();
    }

    fn init_investissements_table(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE investissements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER,
                foyer_id INTEGER,
                type_produit TEXT NOT NULL,
                partenaire_id INTEGER,
                nom_produit TEXT NOT NULL,
                montant_initial INTEGER,
                date_souscription INTEGER,
                date_fin_demembrement INTEGER,
                date_fin_pret INTEGER,
                mensualite_credit INTEGER,
                credit_crd INTEGER,
                loyer_mensuel INTEGER,
                versement_programme INTEGER NOT NULL DEFAULT 0,
                montant_versement_programme INTEGER,
                frequence_versement TEXT,
                reinvestissement_dividendes INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                origine TEXT NOT NULL DEFAULT 'MON_CONSEIL',
                created_at INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL DEFAULT 1
            );",
        )
        .unwrap();
    }

    #[test]
    fn type_produit_label_maps_common_types() {
        assert_eq!(type_produit_label("ASSURANCE_VIE"), "assurance-vie");
        assert_eq!(type_produit_label("SCPI"), "SCPI");
        assert_eq!(type_produit_label("SCPI_DEMEMBREMENT"), "SCPI démembrement");
    }

    #[test]
    fn pick_patrimoine_type_prefers_mon_conseil() {
        let conn = Connection::open_in_memory().unwrap();
        init_minimal_contacts_table(&conn);
        init_investissements_table(&conn);
        let contact_id = seed_contact(&conn, "Dupont", "Alice", "CLIENT", 1, "ACTIF");

        conn.execute(
            "INSERT INTO investissements (contact_id, type_produit, nom_produit, montant_initial, origine, created_at, updated_at)
             VALUES (?1, 'SCPI', 'Corum Origin', 100000, 'EXISTANT_CLIENT', 1, 1)",
            params![contact_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO investissements (contact_id, type_produit, nom_produit, montant_initial, origine, created_at, updated_at)
             VALUES (?1, 'ASSURANCE_VIE', 'Spirica', 50000, 'MON_CONSEIL', 1, 1)",
            params![contact_id],
        )
        .unwrap();

        let picked = pick_patrimoine_type(&conn, contact_id, None).unwrap();
        assert_eq!(picked.as_deref(), Some("assurance-vie"));
    }

    #[test]
    fn list_includes_patrimoine_type_on_birthday_contact() {
        let conn = Connection::open_in_memory().unwrap();
        init_minimal_contacts_table(&conn);
        init_investissements_table(&conn);

        let (month, day) = today_month_day_local();
        let unix = Utc
            .with_ymd_and_hms(1990, month, day, 0, 0, 0)
            .single()
            .unwrap()
            .timestamp();
        let contact_id = seed_contact(&conn, "Client", "Alice", "CLIENT", unix, "ACTIF");
        conn.execute(
            "INSERT INTO investissements (contact_id, type_produit, nom_produit, origine, created_at, updated_at)
             VALUES (?1, 'SCPI', 'Fonds X', 'MON_CONSEIL', 1, 1)",
            params![contact_id],
        )
        .unwrap();

        let list = list_birthdays_today_from_connection(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].patrimoine_type.as_deref(), Some("SCPI"));
    }

    #[test]
    fn includes_all_categories_with_birthday_today() {
        let conn = Connection::open_in_memory().unwrap();
        init_minimal_contacts_table(&conn);
        init_investissements_table(&conn);

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
        init_investissements_table(&conn);

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
