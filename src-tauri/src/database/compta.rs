//! Comptabilité mensuelle (dépenses, encaissements, déplacements).

use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaConfig {
    pub adresse_depart: String,
    pub indemnite_km: f64,
    pub ors_api_key: Option<String>,
    pub drive_root_folder_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaDepense {
    pub id: i64,
    pub date: String,
    pub categorie: String,
    pub tiers: String,
    pub ttc: f64,
    pub tva: f64,
    pub ht: f64,
    pub lien_drive: Option<String>,
    pub source_drive_file_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewComptaDepense {
    pub date: String,
    pub categorie: String,
    pub tiers: String,
    pub ttc: f64,
    pub tva: f64,
    pub ht: f64,
    pub lien_drive: Option<String>,
    #[serde(default)]
    pub source_drive_file_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaEncaissement {
    pub id: i64,
    pub client: String,
    pub date: String,
    pub exonere: f64,
    pub ht: f64,
    pub tva: f64,
    pub ttc: f64,
    pub total: f64,
    pub don: f64,
    pub is_partenaire: bool,
    pub lien_drive: Option<String>,
    pub source_drive_file_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewComptaEncaissement {
    pub client: String,
    pub date: String,
    pub exonere: f64,
    pub ht: f64,
    pub tva: f64,
    pub ttc: f64,
    pub total: f64,
    pub don: f64,
    pub is_partenaire: bool,
    pub lien_drive: Option<String>,
    #[serde(default)]
    pub source_drive_file_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaDeplacement {
    pub id: i64,
    pub date: String,
    pub destination: String,
    pub objet: String,
    pub km: f64,
    pub indemnite: f64,
    pub source_google_event_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewComptaDeplacement {
    pub date: String,
    pub destination: String,
    pub objet: String,
    pub km: f64,
    pub indemnite: f64,
    #[serde(default)]
    pub source_google_event_id: Option<String>,
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn month_bounds(year: i32, month: u32) -> (String, String) {
    let start = format!("{year:04}-{month:02}-01");
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let end = format!("{next_year:04}-{next_month:02}-01");
    (start, end)
}

impl super::Database {
    pub fn get_compta_config(&self) -> Result<ComptaConfig> {
        Ok(ComptaConfig {
            adresse_depart: self
                .get_setting("compta_adresse_depart")?
                .unwrap_or_default(),
            indemnite_km: self
                .get_setting("compta_indemnite_km")?
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.405),
            ors_api_key: self.get_setting("compta_ors_api_key")?,
            drive_root_folder_id: self
                .get_setting("compta_drive_root_folder_id")?
                .unwrap_or_else(|| "1BFPOo103v0BoeNaZoKS2jsLaV57zjOSX".to_string()),
        })
    }

    pub fn save_compta_config(&self, config: &ComptaConfig) -> Result<()> {
        self.set_setting("compta_adresse_depart", &config.adresse_depart)?;
        self.set_setting("compta_indemnite_km", &config.indemnite_km.to_string())?;
        match &config.ors_api_key {
            Some(key) if !key.trim().is_empty() => {
                self.set_setting("compta_ors_api_key", key.trim())?;
            }
            _ => {
                self.delete_setting("compta_ors_api_key")?;
            }
        }
        self.set_setting(
            "compta_drive_root_folder_id",
            config.drive_root_folder_id.trim(),
        )?;
        Ok(())
    }

    pub fn get_compta_depenses(&self, year: i32, month: u32) -> Result<Vec<ComptaDepense>> {
        let (start, end) = month_bounds(year, month);
        let mut stmt = self.conn.prepare(
            "SELECT id, date, categorie, tiers, ttc, tva, ht, lien_drive, source_drive_file_id,
                    created_at, updated_at
             FROM compta_depenses
             WHERE date >= ?1 AND date < ?2
             ORDER BY date DESC, id DESC",
        )?;
        let rows = stmt.query_map(params![start, end], |row| {
            Ok(ComptaDepense {
                id: row.get(0)?,
                date: row.get(1)?,
                categorie: row.get(2)?,
                tiers: row.get(3)?,
                ttc: row.get(4)?,
                tva: row.get(5)?,
                ht: row.get(6)?,
                lien_drive: row.get(7)?,
                source_drive_file_id: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_compta_depense(&self, input: NewComptaDepense) -> Result<ComptaDepense> {
        let now = now_unix();
        self.conn.execute(
            "INSERT INTO compta_depenses (date, categorie, tiers, ttc, tva, ht, lien_drive,
             source_drive_file_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                input.date,
                input.categorie,
                input.tiers,
                input.ttc,
                input.tva,
                input.ht,
                input.lien_drive,
                input.source_drive_file_id,
                now,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_compta_depense_by_id(id)
    }

    pub fn get_compta_depense_by_id(&self, id: i64) -> Result<ComptaDepense> {
        self.conn.query_row(
            "SELECT id, date, categorie, tiers, ttc, tva, ht, lien_drive, source_drive_file_id,
                    created_at, updated_at
             FROM compta_depenses WHERE id = ?1",
            params![id],
            |row| {
                Ok(ComptaDepense {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    categorie: row.get(2)?,
                    tiers: row.get(3)?,
                    ttc: row.get(4)?,
                    tva: row.get(5)?,
                    ht: row.get(6)?,
                    lien_drive: row.get(7)?,
                    source_drive_file_id: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
    }

    pub fn update_compta_depense(&self, id: i64, input: &NewComptaDepense) -> Result<ComptaDepense> {
        let now = now_unix();
        self.conn.execute(
            "UPDATE compta_depenses
             SET date = ?1, categorie = ?2, tiers = ?3, ttc = ?4, tva = ?5, ht = ?6,
                 lien_drive = ?7, source_drive_file_id = ?8, updated_at = ?9
             WHERE id = ?10",
            params![
                input.date,
                input.categorie,
                input.tiers,
                input.ttc,
                input.tva,
                input.ht,
                input.lien_drive,
                input.source_drive_file_id,
                now,
                id,
            ],
        )?;
        self.get_compta_depense_by_id(id)
    }

    pub fn delete_compta_depense(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM compta_depenses WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_compta_encaissements(&self, year: i32, month: u32) -> Result<Vec<ComptaEncaissement>> {
        let (start, end) = month_bounds(year, month);
        let mut stmt = self.conn.prepare(
            "SELECT id, client, date, exonere, ht, tva, ttc, total, don, is_partenaire, lien_drive,
                    source_drive_file_id, created_at, updated_at
             FROM compta_encaissements
             WHERE date >= ?1 AND date < ?2
             ORDER BY date DESC, id DESC",
        )?;
        let rows = stmt.query_map(params![start, end], |row| {
            Ok(ComptaEncaissement {
                id: row.get(0)?,
                client: row.get(1)?,
                date: row.get(2)?,
                exonere: row.get(3)?,
                ht: row.get(4)?,
                tva: row.get(5)?,
                ttc: row.get(6)?,
                total: row.get(7)?,
                don: row.get(8)?,
                is_partenaire: row.get::<_, i64>(9)? != 0,
                lien_drive: row.get(10)?,
                source_drive_file_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_compta_encaissement(&self, input: NewComptaEncaissement) -> Result<ComptaEncaissement> {
        let now = now_unix();
        self.conn.execute(
            "INSERT INTO compta_encaissements
             (client, date, exonere, ht, tva, ttc, total, don, is_partenaire, lien_drive,
              source_drive_file_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                input.client,
                input.date,
                input.exonere,
                input.ht,
                input.tva,
                input.ttc,
                input.total,
                input.don,
                if input.is_partenaire { 1 } else { 0 },
                input.lien_drive,
                input.source_drive_file_id,
                now,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_compta_encaissement_by_id(id)
    }

    pub fn get_compta_encaissement_by_id(&self, id: i64) -> Result<ComptaEncaissement> {
        self.conn.query_row(
            "SELECT id, client, date, exonere, ht, tva, ttc, total, don, is_partenaire, lien_drive,
                    source_drive_file_id, created_at, updated_at
             FROM compta_encaissements WHERE id = ?1",
            params![id],
            |row| {
                Ok(ComptaEncaissement {
                    id: row.get(0)?,
                    client: row.get(1)?,
                    date: row.get(2)?,
                    exonere: row.get(3)?,
                    ht: row.get(4)?,
                    tva: row.get(5)?,
                    ttc: row.get(6)?,
                    total: row.get(7)?,
                    don: row.get(8)?,
                    is_partenaire: row.get::<_, i64>(9)? != 0,
                    lien_drive: row.get(10)?,
                    source_drive_file_id: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        )
    }

    pub fn update_compta_encaissement(
        &self,
        id: i64,
        input: &NewComptaEncaissement,
    ) -> Result<ComptaEncaissement> {
        let now = now_unix();
        self.conn.execute(
            "UPDATE compta_encaissements
             SET client = ?1, date = ?2, exonere = ?3, ht = ?4, tva = ?5, ttc = ?6, total = ?7,
                 don = ?8, is_partenaire = ?9, lien_drive = ?10, source_drive_file_id = ?11,
                 updated_at = ?12
             WHERE id = ?13",
            params![
                input.client,
                input.date,
                input.exonere,
                input.ht,
                input.tva,
                input.ttc,
                input.total,
                input.don,
                if input.is_partenaire { 1 } else { 0 },
                input.lien_drive,
                input.source_drive_file_id,
                now,
                id,
            ],
        )?;
        self.get_compta_encaissement_by_id(id)
    }

    pub fn delete_compta_encaissement(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM compta_encaissements WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_compta_deplacements(&self, year: i32, month: u32) -> Result<Vec<ComptaDeplacement>> {
        let (start, end) = month_bounds(year, month);
        let mut stmt = self.conn.prepare(
            "SELECT id, date, destination, objet, km, indemnite, source_google_event_id,
                    created_at, updated_at
             FROM compta_deplacements
             WHERE date >= ?1 AND date < ?2
             ORDER BY date DESC, id DESC",
        )?;
        let rows = stmt.query_map(params![start, end], |row| {
            Ok(ComptaDeplacement {
                id: row.get(0)?,
                date: row.get(1)?,
                destination: row.get(2)?,
                objet: row.get(3)?,
                km: row.get(4)?,
                indemnite: row.get(5)?,
                source_google_event_id: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_compta_deplacement(&self, input: NewComptaDeplacement) -> Result<ComptaDeplacement> {
        let now = now_unix();
        self.conn.execute(
            "INSERT INTO compta_deplacements (date, destination, objet, km, indemnite,
             source_google_event_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                input.date,
                input.destination,
                input.objet,
                input.km,
                input.indemnite,
                input.source_google_event_id,
                now,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_compta_deplacement_by_id(id)
    }

    pub fn get_compta_deplacement_by_id(&self, id: i64) -> Result<ComptaDeplacement> {
        self.conn.query_row(
            "SELECT id, date, destination, objet, km, indemnite, source_google_event_id,
                    created_at, updated_at
             FROM compta_deplacements WHERE id = ?1",
            params![id],
            |row| {
                Ok(ComptaDeplacement {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    destination: row.get(2)?,
                    objet: row.get(3)?,
                    km: row.get(4)?,
                    indemnite: row.get(5)?,
                    source_google_event_id: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
    }

    pub fn update_compta_deplacement(
        &self,
        id: i64,
        input: &NewComptaDeplacement,
    ) -> Result<ComptaDeplacement> {
        let now = now_unix();
        self.conn.execute(
            "UPDATE compta_deplacements
             SET date = ?1, destination = ?2, objet = ?3, km = ?4, indemnite = ?5,
                 source_google_event_id = ?6, updated_at = ?7
             WHERE id = ?8",
            params![
                input.date,
                input.destination,
                input.objet,
                input.km,
                input.indemnite,
                input.source_google_event_id,
                now,
                id,
            ],
        )?;
        self.get_compta_deplacement_by_id(id)
    }

    pub fn delete_compta_deplacement(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM compta_deplacements WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_compta_imported_drive_file_ids(&self) -> Result<Vec<String>> {
        let mut ids = Vec::new();
        let mut stmt = self.conn.prepare(
            "SELECT source_drive_file_id FROM compta_depenses WHERE source_drive_file_id IS NOT NULL
             UNION
             SELECT source_drive_file_id FROM compta_encaissements WHERE source_drive_file_id IS NOT NULL",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            ids.push(row?);
        }
        Ok(ids)
    }

    pub fn get_compta_imported_google_event_ids(&self) -> Result<Vec<String>> {
        let mut ids = Vec::new();
        let mut stmt = self.conn.prepare(
            "SELECT source_google_event_id FROM compta_deplacements
             WHERE source_google_event_id IS NOT NULL",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            ids.push(row?);
        }
        Ok(ids)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> super::super::Database {
        super::super::Database::open_in_memory_for_tests().expect("mem db")
    }

    #[test]
    fn compta_depense_crud_by_month() {
        let db = mem_db();
        let created = db
            .create_compta_depense(NewComptaDepense {
                date: "2026-07-15".into(),
                categorie: "Logiciel".into(),
                tiers: "FOURNISSEUR".into(),
                ttc: 120.0,
                tva: 20.0,
                ht: 100.0,
                lien_drive: Some("https://drive.google.com/file/d/x/view".into()),
                source_drive_file_id: None,
            })
            .expect("create");
        assert_eq!(created.tiers, "FOURNISSEUR");

        let july = db.get_compta_depenses(2026, 7).expect("list");
        assert_eq!(july.len(), 1);

        let aug = db.get_compta_depenses(2026, 8).expect("list empty");
        assert!(aug.is_empty());

        db.delete_compta_depense(created.id).expect("delete");
        assert!(db.get_compta_depenses(2026, 7).unwrap().is_empty());
    }

    #[test]
    fn compta_config_defaults() {
        let db = mem_db();
        let cfg = db.get_compta_config().expect("get");
        assert!((cfg.indemnite_km - 0.405).abs() < f64::EPSILON);
        assert_eq!(cfg.drive_root_folder_id, "1BFPOo103v0BoeNaZoKS2jsLaV57zjOSX");
    }
}
