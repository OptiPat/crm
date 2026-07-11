//! Affaires commerciales (domaine Pipe). Extrait dans son propre module.

use rusqlite::{params, Result, Row};

pub const PIPE_TYPE_AFFAIRE: &str = "AFFAIRE";
pub const PIPE_TYPE_ACTE_GESTION: &str = "ACTE_GESTION";
pub const PIPE_TYPE_ACTION: &str = "ACTION";

pub const PIPE_STAGE_PROSPECTION: &str = "PROSPECTION";
pub const PIPE_STAGE_R1: &str = "R1";
pub const PIPE_STAGE_R2: &str = "R2";
pub const PIPE_STAGE_R3: &str = "R3";
pub const PIPE_STAGE_GAGNEE: &str = "GAGNEE";
pub const PIPE_STAGE_PERDUE_OU_EN_ATTENTE: &str = "PERDUE_OU_EN_ATTENTE";

const VALID_PIPE_TYPES: &[&str] = &[
    PIPE_TYPE_AFFAIRE,
    PIPE_TYPE_ACTE_GESTION,
    PIPE_TYPE_ACTION,
];

const VALID_PIPE_STAGES: &[&str] = &[
    PIPE_STAGE_PROSPECTION,
    PIPE_STAGE_R1,
    PIPE_STAGE_R2,
    PIPE_STAGE_R3,
    PIPE_STAGE_GAGNEE,
    PIPE_STAGE_PERDUE_OU_EN_ATTENTE,
];

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

pub(crate) fn is_valid_pipe_type(value: &str) -> bool {
    VALID_PIPE_TYPES.contains(&value)
}

pub(crate) fn is_valid_pipe_stage(value: &str) -> bool {
    VALID_PIPE_STAGES.contains(&value)
}

fn default_stage_for_type(pipe_type: &str) -> &'static str {
    if pipe_type == PIPE_TYPE_AFFAIRE {
        PIPE_STAGE_PROSPECTION
    } else {
        ""
    }
}

fn map_pipe_row(row: &Row<'_>) -> Result<super::models::Pipe> {
    Ok(super::models::Pipe {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        pipe_type: row.get(2)?,
        parent_pipe_id: row.get(3)?,
        titre: row.get(4)?,
        stage: row.get(5)?,
        notes: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        contact_nom: row.get(9)?,
        contact_prenom: row.get(10)?,
        parent_titre: row.get(11)?,
    })
}

impl super::Database {
    pub fn migrate_pipes_table(&self) -> Result<()> {
        // Schéma minimal compatible avec l'étape 0 ; colonnes enrichies ensuite.
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS pipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titre TEXT NOT NULL,
                stage TEXT NOT NULL DEFAULT 'PROSPECTION',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            ",
        )?;
        self.migrate_pipes_columns()?;
        self.conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_pipes_stage ON pipes(stage);
            CREATE INDEX IF NOT EXISTS idx_pipes_updated ON pipes(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_pipes_contact ON pipes(contact_id);
            CREATE INDEX IF NOT EXISTS idx_pipes_parent ON pipes(parent_pipe_id);
            ",
        )?;
        Ok(())
    }

    fn migrate_pipes_columns(&self) -> Result<()> {
        if !self.table_has_column("pipes", "contact_id")? {
            self.conn.execute("ALTER TABLE pipes ADD COLUMN contact_id INTEGER", [])?;
            println!("✅ Migration: contact_id sur pipes");
        }
        if !self.table_has_column("pipes", "pipe_type")? {
            self.conn.execute(
                "ALTER TABLE pipes ADD COLUMN pipe_type TEXT NOT NULL DEFAULT 'AFFAIRE'",
                [],
            )?;
            println!("✅ Migration: pipe_type sur pipes");
        }
        if !self.table_has_column("pipes", "parent_pipe_id")? {
            self.conn.execute("ALTER TABLE pipes ADD COLUMN parent_pipe_id INTEGER", [])?;
            println!("✅ Migration: parent_pipe_id sur pipes");
        }
        if !self.table_has_column("pipes", "notes")? {
            self.conn.execute("ALTER TABLE pipes ADD COLUMN notes TEXT", [])?;
            println!("✅ Migration: notes sur pipes");
        }
        self.migrate_pipes_legacy_stages()?;
        Ok(())
    }

    fn migrate_pipes_legacy_stages(&self) -> Result<()> {
        if !self.table_has_column("pipes", "stage")? {
            return Ok(());
        }
        self.conn.execute(
            "UPDATE pipes SET stage = 'PERDUE_OU_EN_ATTENTE' WHERE stage = 'PERDUE'",
            [],
        )?;
        self.conn.execute(
            "UPDATE pipes SET stage = 'R1' WHERE stage IN ('QUALIFICATION', 'PROPOSITION')",
            [],
        )?;
        self.conn.execute(
            "UPDATE pipes SET stage = 'R3' WHERE stage = 'NEGOCIATION'",
            [],
        )?;
        Ok(())
    }

    fn validate_pipe_input(
        &self,
        contact_id: i64,
        pipe_type: &str,
        parent_pipe_id: Option<i64>,
        titre: &str,
        stage: &str,
        editing_id: Option<i64>,
    ) -> Result<()> {
        let titre = titre.trim();
        if titre.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "titre obligatoire".into(),
            ));
        }
        if !is_valid_pipe_type(pipe_type) {
            return Err(rusqlite::Error::InvalidParameterName(
                "type de pipe invalide".into(),
            ));
        }
        if contact_id <= 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "contact_id obligatoire".into(),
            ));
        }
        let contact_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE id = ?1",
            params![contact_id],
            |row| row.get(0),
        )?;
        if contact_exists == 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "contact introuvable".into(),
            ));
        }
        if pipe_type == PIPE_TYPE_AFFAIRE {
            if !is_valid_pipe_stage(stage) {
                return Err(rusqlite::Error::InvalidParameterName(
                    "stage invalide pour une affaire".into(),
                ));
            }
        } else if !stage.is_empty() && !is_valid_pipe_stage(stage) {
            return Err(rusqlite::Error::InvalidParameterName(
                "stage invalide".into(),
            ));
        }
        if let Some(parent_id) = parent_pipe_id {
            if Some(parent_id) == editing_id {
                return Err(rusqlite::Error::InvalidParameterName(
                    "un pipe ne peut pas être son propre parent".into(),
                ));
            }
            let parent: (String, i64) = self.conn.query_row(
                "SELECT pipe_type, contact_id FROM pipes WHERE id = ?1",
                params![parent_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            if parent.1 != contact_id {
                return Err(rusqlite::Error::InvalidParameterName(
                    "le parent doit appartenir au même contact".into(),
                ));
            }
            if parent.0 != PIPE_TYPE_AFFAIRE && parent.0 != PIPE_TYPE_ACTE_GESTION {
                return Err(rusqlite::Error::InvalidParameterName(
                    "seule une affaire ou un acte de gestion peut être parent".into(),
                ));
            }
        }
        Ok(())
    }

    pub fn list_pipes(&self) -> Result<Vec<super::models::Pipe>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.contact_id, p.pipe_type, p.parent_pipe_id, p.titre, p.stage, p.notes,
                    p.created_at, p.updated_at,
                    c.nom, c.prenom, pp.titre
             FROM pipes p
             INNER JOIN contacts c ON c.id = p.contact_id
             LEFT JOIN pipes pp ON pp.id = p.parent_pipe_id
             ORDER BY p.updated_at DESC",
        )?;

        let rows = stmt.query_map([], map_pipe_row)?;
        rows.collect()
    }

    pub fn get_pipe_by_id(&self, id: i64) -> Result<super::models::Pipe> {
        self.conn.query_row(
            "SELECT p.id, p.contact_id, p.pipe_type, p.parent_pipe_id, p.titre, p.stage, p.notes,
                    p.created_at, p.updated_at,
                    c.nom, c.prenom, pp.titre
             FROM pipes p
             INNER JOIN contacts c ON c.id = p.contact_id
             LEFT JOIN pipes pp ON pp.id = p.parent_pipe_id
             WHERE p.id = ?1",
            params![id],
            map_pipe_row,
        )
    }

    pub fn create_pipe(&self, input: super::models::NewPipe) -> Result<super::models::Pipe> {
        let titre = input.titre.trim().to_string();
        let stage = input
            .stage
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(default_stage_for_type(&input.pipe_type))
            .to_string();
        self.validate_pipe_input(
            input.contact_id,
            &input.pipe_type,
            input.parent_pipe_id,
            &titre,
            &stage,
            None,
        )?;
        let now = now_unix();
        self.conn.execute(
            "INSERT INTO pipes (contact_id, pipe_type, parent_pipe_id, titre, stage, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                input.contact_id,
                &input.pipe_type,
                input.parent_pipe_id,
                &titre,
                &stage,
                input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()),
                now,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.seed_pipe_creation_timeline_entry(id)?;
        self.get_pipe_by_id(id)
    }

    pub fn update_pipe(
        &self,
        id: i64,
        input: super::models::UpdatePipe,
    ) -> Result<super::models::Pipe> {
        let titre = input.titre.trim().to_string();
        let stage = input
            .stage
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(default_stage_for_type(&input.pipe_type))
            .to_string();
        self.validate_pipe_input(
            input.contact_id,
            &input.pipe_type,
            input.parent_pipe_id,
            &titre,
            &stage,
            Some(id),
        )?;
        let now = now_unix();
        let updated = self.conn.execute(
            "UPDATE pipes
             SET contact_id = ?1, pipe_type = ?2, parent_pipe_id = ?3, titre = ?4, stage = ?5,
                 notes = ?6, updated_at = ?7
             WHERE id = ?8",
            params![
                input.contact_id,
                &input.pipe_type,
                input.parent_pipe_id,
                &titre,
                &stage,
                input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()),
                now,
                id,
            ],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.get_pipe_by_id(id)
    }

    pub fn delete_pipe(&self, id: i64) -> Result<()> {
        let child_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pipes WHERE parent_pipe_id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if child_count > 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "impossible de supprimer un pipe avec des éléments rattachés".into(),
            ));
        }
        self.delete_pipe_timeline_for_pipe(id)?;
        let deleted = self
            .conn
            .execute("DELETE FROM pipes WHERE id = ?1", params![id])?;
        if deleted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewContact;
    use crate::database::Database;

    fn seed_contact(db: &Database) -> i64 {
        db.create_contact(NewContact {
            nom: "DUPONT".into(),
            prenom: "Jean".into(),
            categorie: "PROSPECT_CLIENT".into(),
            ..Default::default()
        })
        .unwrap()
        .id
        .expect("contact id")
    }

    #[test]
    fn pipe_crud_with_contact_and_types() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        use crate::database::models::NewPipe;

        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "SCPI Corum 50 k€".into(),
                stage: Some(PIPE_STAGE_PROSPECTION.into()),
                notes: None,
            })
            .unwrap();
        assert_eq!(affaire.pipe_type, PIPE_TYPE_AFFAIRE);

        let acte = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Dossier Dupont 2026".into(),
                stage: None,
                notes: Some("Notes acte".into()),
            })
            .unwrap();

        let action = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_ACTION.into(),
                parent_pipe_id: Some(acte.id),
                titre: "Appel de prise de contact".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        assert_eq!(action.parent_pipe_id, Some(acte.id));

        let list = db.list_pipes().unwrap();
        assert_eq!(list.len(), 3);

        db.delete_pipe(acte.id).unwrap_err();
        db.delete_pipe(action.id).unwrap();
        db.delete_pipe(acte.id).unwrap();
        db.delete_pipe(affaire.id).unwrap();
        assert!(db.list_pipes().unwrap().is_empty());
    }
}
