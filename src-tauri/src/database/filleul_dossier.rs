//! Dossier Organisation par consultant (dates réseau, notes) — hors fiche contact UI.

use rusqlite::{params, Result, ToSql};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilleulDossier {
    pub contact_id: i64,
    pub date_invitation: Option<i64>,
    pub date_inscription: Option<i64>,
    pub date_desinscription: Option<i64>,
    pub date_premiere_souscription_imo: Option<i64>,
    pub date_premiere_souscription_placement: Option<i64>,
    pub date_premiere_souscription_scpi: Option<i64>,
    pub date_passage_manager: Option<i64>,
    pub date_habilitation_cif: Option<i64>,
    pub date_premier_vaa_ou_va: Option<i64>,
    pub notes: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertFilleulDossierInput {
    pub contact_id: i64,
    pub date_invitation: Option<i64>,
    pub date_inscription: Option<i64>,
    pub date_desinscription: Option<i64>,
    pub date_premiere_souscription_imo: Option<i64>,
    pub date_premiere_souscription_placement: Option<i64>,
    pub date_premiere_souscription_scpi: Option<i64>,
    pub date_passage_manager: Option<i64>,
    pub date_habilitation_cif: Option<i64>,
    pub date_premier_vaa_ou_va: Option<i64>,
    pub notes: Option<String>,
}

impl FilleulDossier {
    fn empty(contact_id: i64) -> Self {
        Self {
            contact_id,
            date_invitation: None,
            date_inscription: None,
            date_desinscription: None,
            date_premiere_souscription_imo: None,
            date_premiere_souscription_placement: None,
            date_premiere_souscription_scpi: None,
            date_passage_manager: None,
            date_habilitation_cif: None,
            date_premier_vaa_ou_va: None,
            notes: None,
            updated_at: 0,
        }
    }
}

fn map_filleul_dossier_row(row: &rusqlite::Row<'_>) -> Result<FilleulDossier> {
    Ok(FilleulDossier {
        contact_id: row.get(0)?,
        date_invitation: row.get(1)?,
        date_inscription: row.get(2)?,
        date_desinscription: row.get(3)?,
        date_premiere_souscription_imo: row.get(4)?,
        date_premiere_souscription_placement: row.get(5)?,
        date_premiere_souscription_scpi: row.get(6)?,
        date_passage_manager: row.get(7)?,
        date_habilitation_cif: row.get(8)?,
        date_premier_vaa_ou_va: row.get(9)?,
        notes: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

const FILLEUL_DOSSIER_SELECT: &str =
    "SELECT contact_id, date_invitation, date_inscription, date_desinscription,
            date_premiere_souscription_imo, date_premiere_souscription_placement,
            date_premiere_souscription_scpi, date_passage_manager,
            date_habilitation_cif, date_premier_vaa_ou_va, notes, updated_at
     FROM filleul_dossier";

impl super::Database {
    pub fn migrate_filleul_dossier_table(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS filleul_dossier (
                contact_id INTEGER PRIMARY KEY,
                date_invitation INTEGER,
                date_inscription INTEGER,
                date_desinscription INTEGER,
                date_premiere_souscription_imo INTEGER,
                date_premiere_souscription_placement INTEGER,
                date_premiere_souscription_scpi INTEGER,
                date_passage_manager INTEGER,
                date_habilitation_cif INTEGER,
                date_premier_vaa_ou_va INTEGER,
                notes TEXT,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;

        for (column, sql_type) in [
            ("date_habilitation_cif", "INTEGER"),
            ("date_premier_vaa_ou_va", "INTEGER"),
        ] {
            if !self.table_has_column("filleul_dossier", column)? {
                self.conn.execute(
                    &format!("ALTER TABLE filleul_dossier ADD COLUMN {column} {sql_type}"),
                    [],
                )?;
            }
        }

        if self
            .get_setting("migration_filleul_dossier_backfill_v1")?
            .is_none()
        {
            println!("🔄 Migration : backfill filleul_dossier depuis contacts…");
            self.conn.execute(
                "INSERT INTO filleul_dossier (
                    contact_id, date_invitation, date_inscription, updated_at
                 )
                 SELECT id, date_invitation_filleul, date_inscription_filleul, unixepoch()
                 FROM contacts
                 WHERE filleul_categorie IN ('FILLEUL', 'FILLEUL_DESINSCRIT')
                   AND (date_invitation_filleul IS NOT NULL OR date_inscription_filleul IS NOT NULL)
                   AND NOT EXISTS (
                     SELECT 1 FROM filleul_dossier fd WHERE fd.contact_id = contacts.id
                   )",
                [],
            )?;
            self.set_setting("migration_filleul_dossier_backfill_v1", "1")?;
            println!("✅ Migration filleul_dossier appliquée");
        }

        if self
            .get_setting("migration_filleul_dossier_backfill_prospects_v1")?
            .is_none()
        {
            println!("🔄 Migration : backfill filleul_dossier (prospects / suspects)…");
            self.conn.execute(
                "INSERT INTO filleul_dossier (
                    contact_id, date_invitation, date_inscription, updated_at
                 )
                 SELECT id, date_invitation_filleul, date_inscription_filleul, unixepoch()
                 FROM contacts
                 WHERE filleul_categorie IN ('PROSPECT_FILLEUL', 'SUSPECT_FILLEUL')
                   AND (date_invitation_filleul IS NOT NULL OR date_inscription_filleul IS NOT NULL)
                   AND NOT EXISTS (
                     SELECT 1 FROM filleul_dossier fd WHERE fd.contact_id = contacts.id
                   )",
                [],
            )?;
            self.set_setting("migration_filleul_dossier_backfill_prospects_v1", "1")?;
            println!("✅ Migration filleul_dossier prospects appliquée");
        }

        Ok(())
    }

    pub fn get_filleul_dossier(&self, contact_id: i64) -> Result<FilleulDossier> {
        let mut stmt = self
            .conn
            .prepare(&format!("{FILLEUL_DOSSIER_SELECT} WHERE contact_id = ?1"))?;
        let mut rows = stmt.query(params![contact_id])?;
        if let Some(row) = rows.next()? {
            return map_filleul_dossier_row(row);
        }
        Ok(FilleulDossier::empty(contact_id))
    }

    pub fn get_filleul_dossiers_by_contact_ids(
        &self,
        contact_ids: &[i64],
    ) -> Result<Vec<FilleulDossier>> {
        if contact_ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = (1..=contact_ids.len())
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!("{FILLEUL_DOSSIER_SELECT} WHERE contact_id IN ({placeholders})");

        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn ToSql> = contact_ids
            .iter()
            .map(|id| id as &dyn ToSql)
            .collect();
        let rows = stmt.query_map(params.as_slice(), map_filleul_dossier_row)?;
        rows.collect()
    }

    pub fn upsert_filleul_dossier(&self, input: UpsertFilleulDossierInput) -> Result<FilleulDossier> {
        self.conn.execute(
            "INSERT INTO filleul_dossier (
                contact_id, date_invitation, date_inscription, date_desinscription,
                date_premiere_souscription_imo, date_premiere_souscription_placement,
                date_premiere_souscription_scpi, date_passage_manager,
                date_habilitation_cif, date_premier_vaa_ou_va, notes, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, unixepoch())
             ON CONFLICT(contact_id) DO UPDATE SET
                date_invitation = excluded.date_invitation,
                date_inscription = excluded.date_inscription,
                date_desinscription = excluded.date_desinscription,
                date_premiere_souscription_imo = excluded.date_premiere_souscription_imo,
                date_premiere_souscription_placement = excluded.date_premiere_souscription_placement,
                date_premiere_souscription_scpi = excluded.date_premiere_souscription_scpi,
                date_passage_manager = excluded.date_passage_manager,
                date_habilitation_cif = excluded.date_habilitation_cif,
                date_premier_vaa_ou_va = excluded.date_premier_vaa_ou_va,
                notes = excluded.notes,
                updated_at = unixepoch()",
            params![
                input.contact_id,
                input.date_invitation,
                input.date_inscription,
                input.date_desinscription,
                input.date_premiere_souscription_imo,
                input.date_premiere_souscription_placement,
                input.date_premiere_souscription_scpi,
                input.date_passage_manager,
                input.date_habilitation_cif,
                input.date_premier_vaa_ou_va,
                input.notes,
            ],
        )?;
        self.get_filleul_dossier(input.contact_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{models::NewContact, Database};

    fn memory_db() -> Database {
        Database::open_in_memory_for_tests().expect("in-memory db")
    }

    fn seed_contact(db: &Database, nom: &str, prenom: &str) -> i64 {
        db.create_contact(NewContact {
            nom: nom.to_string(),
            prenom: prenom.to_string(),
            categorie: "AUCUN".to_string(),
            filleul_categorie: Some("FILLEUL".to_string()),
            ..Default::default()
        })
        .expect("create contact")
        .id
        .expect("contact id")
    }

    #[test]
    fn upsert_and_read_filleul_dossier() {
        let db = memory_db();
        db.init_tables().expect("init");
        let id = seed_contact(&db, "DUPONT", "Jean");

        let saved = db
            .upsert_filleul_dossier(UpsertFilleulDossierInput {
                contact_id: id,
                date_invitation: Some(1_704_067_200),
                date_inscription: Some(1_704_153_600),
                date_desinscription: None,
                date_premiere_souscription_imo: None,
                date_premiere_souscription_placement: None,
                date_premiere_souscription_scpi: None,
                date_passage_manager: None,
                date_habilitation_cif: None,
                date_premier_vaa_ou_va: None,
                notes: Some("Note test".into()),
            })
            .expect("upsert");

        assert_eq!(saved.contact_id, id);
        assert_eq!(saved.date_invitation, Some(1_704_067_200));
        assert_eq!(saved.notes.as_deref(), Some("Note test"));

        let loaded = db.get_filleul_dossier(id).expect("get");
        assert_eq!(loaded.date_inscription, Some(1_704_153_600));
    }

    #[test]
    fn bulk_get_filleul_dossiers() {
        let db = memory_db();
        db.init_tables().expect("init");
        let id1 = seed_contact(&db, "A", "B");
        let id2 = seed_contact(&db, "C", "D");
        db.upsert_filleul_dossier(UpsertFilleulDossierInput {
            contact_id: id1,
            date_invitation: Some(100),
            date_inscription: None,
            date_desinscription: None,
            date_premiere_souscription_imo: None,
            date_premiere_souscription_placement: None,
            date_premiere_souscription_scpi: None,
            date_passage_manager: None,
            date_habilitation_cif: None,
            date_premier_vaa_ou_va: None,
            notes: None,
        })
        .expect("upsert");

        let rows = db
            .get_filleul_dossiers_by_contact_ids(&[id1, id2])
            .expect("bulk");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].contact_id, id1);
    }
}
