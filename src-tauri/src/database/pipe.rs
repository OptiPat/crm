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

fn default_pipe_titre_from_contact(prenom: &str, nom: &str) -> String {
    let prenom = prenom.trim();
    let nom = nom.trim();
    if prenom.is_empty() && nom.is_empty() {
        return String::new();
    }
    if prenom.is_empty() {
        return nom.to_string();
    }
    if nom.is_empty() {
        return prenom.to_string();
    }
    format!("{prenom} {nom}")
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

pub(crate) fn is_valid_pipe_type(value: &str) -> bool {
    VALID_PIPE_TYPES.contains(&value)
}

pub(crate) fn is_valid_pipe_stage(value: &str) -> bool {
    VALID_PIPE_STAGES.contains(&value)
}

pub(crate) fn pipe_stage_label(stage: &str) -> String {
    match stage {
        PIPE_STAGE_PROSPECTION => "Prospection".into(),
        PIPE_STAGE_R1 => "R1".into(),
        PIPE_STAGE_R2 => "R2".into(),
        PIPE_STAGE_R3 => "R3".into(),
        PIPE_STAGE_GAGNEE => "Gagnée".into(),
        PIPE_STAGE_PERDUE_OU_EN_ATTENTE => "Perdue ou en attente".into(),
        _ => stage.to_string(),
    }
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

    fn resolve_pipe_titre(&self, contact_id: i64, titre: &str) -> Result<String> {
        let trimmed = titre.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
        let contact = self.get_contact_by_id(contact_id)?;
        Ok(default_pipe_titre_from_contact(&contact.prenom, &contact.nom))
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
            if let Some(pipe_id) = editing_id {
                self.assert_no_parent_cycle(pipe_id, parent_id)?;
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

    fn assert_no_parent_cycle(&self, pipe_id: i64, parent_pipe_id: i64) -> Result<()> {
        let mut current = Some(parent_pipe_id);
        while let Some(id) = current {
            if id == pipe_id {
                return Err(rusqlite::Error::InvalidParameterName(
                    "cycle de parenté interdit entre pipes".into(),
                ));
            }
            current = match self.conn.query_row(
                "SELECT parent_pipe_id FROM pipes WHERE id = ?1",
                params![id],
                |row| row.get::<_, Option<i64>>(0),
            ) {
                Ok(next) => next,
                Err(rusqlite::Error::QueryReturnedNoRows) => None,
                Err(e) => return Err(e),
            };
        }
        Ok(())
    }

    fn sync_pipe_descendants_contact_id(&self, root_id: i64, contact_id: i64) -> Result<()> {
        let now = now_unix();
        let mut stack = vec![root_id];
        while let Some(parent_id) = stack.pop() {
            let mut stmt = self
                .conn
                .prepare("SELECT id FROM pipes WHERE parent_pipe_id = ?1")?;
            let children: Vec<i64> = stmt
                .query_map(params![parent_id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            for child_id in children {
                self.conn.execute(
                    "UPDATE pipes SET contact_id = ?1, updated_at = ?2 WHERE id = ?3",
                    params![contact_id, now, child_id],
                )?;
                stack.push(child_id);
            }
        }
        Ok(())
    }

    fn normalized_pipe_notes(notes: Option<&str>) -> Option<String> {
        notes
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    }

    pub fn list_pipes(&self) -> Result<Vec<super::models::Pipe>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.contact_id, p.pipe_type, p.parent_pipe_id, p.titre, p.stage, p.notes,
                    p.created_at, p.updated_at,
                    c.nom, c.prenom, pp.titre
             FROM pipes p
             LEFT JOIN contacts c ON c.id = p.contact_id
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
             LEFT JOIN contacts c ON c.id = p.contact_id
             LEFT JOIN pipes pp ON pp.id = p.parent_pipe_id
             WHERE p.id = ?1",
            params![id],
            map_pipe_row,
        )
    }

    pub fn create_pipe(&self, input: super::models::NewPipe) -> Result<super::models::Pipe> {
        let titre = self.resolve_pipe_titre(input.contact_id, &input.titre)?;
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
        if input.pipe_type == PIPE_TYPE_AFFAIRE
            && stage != PIPE_STAGE_PROSPECTION
            && is_valid_pipe_stage(&stage)
        {
            let notes = Self::normalized_pipe_notes(input.notes.as_deref());
            self.insert_avancement_timeline_entry(id, &stage, notes.as_deref(), None)?;
        }
        self.get_pipe_by_id(id)
    }

    pub fn update_pipe(
        &self,
        id: i64,
        input: super::models::UpdatePipe,
    ) -> Result<super::models::Pipe> {
        let old = self.get_pipe_by_id(id)?;
        let titre = self.resolve_pipe_titre(input.contact_id, &input.titre)?;
        let stage = match input.stage.as_deref().filter(|s| !s.is_empty()) {
            Some(s) => s.to_string(),
            None if input.pipe_type == PIPE_TYPE_AFFAIRE && old.pipe_type == PIPE_TYPE_AFFAIRE => {
                old.stage.clone()
            }
            None => default_stage_for_type(&input.pipe_type).to_string(),
        };
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
        if old.contact_id != input.contact_id {
            self.sync_pipe_descendants_contact_id(id, input.contact_id)?;
        }
        if input.pipe_type == PIPE_TYPE_AFFAIRE
            && is_valid_pipe_stage(&stage)
            && old.stage != stage
        {
            self.insert_avancement_timeline_entry(id, &stage, None, None)?;
        }
        if input.pipe_type == PIPE_TYPE_AFFAIRE {
            let notes = Self::normalized_pipe_notes(input.notes.as_deref());
            let old_notes = Self::normalized_pipe_notes(old.notes.as_deref());
            if notes != old_notes {
                self.sync_pipe_creation_timeline_notes(id, notes.as_deref())?;
            }
        }
        self.get_pipe_by_id(id)
    }

    pub fn set_pipe_stage(
        &self,
        id: i64,
        new_stage: &str,
        notes: Option<&str>,
        milestone_occurred_at: Option<i64>,
    ) -> Result<super::models::Pipe> {
        let current = self.get_pipe_by_id(id)?;
        if current.pipe_type != PIPE_TYPE_AFFAIRE {
            return Err(rusqlite::Error::InvalidParameterName(
                "l'avancement ne s'applique qu'aux affaires".into(),
            ));
        }
        if !is_valid_pipe_stage(new_stage) {
            return Err(rusqlite::Error::InvalidParameterName(
                "stage invalide".into(),
            ));
        }
        if current.stage == new_stage {
            return Ok(current);
        }
        let now = now_unix();
        let updated = self.conn.execute(
            "UPDATE pipes SET stage = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_stage, now, id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.insert_avancement_timeline_entry(id, new_stage, notes, milestone_occurred_at)?;
        self.get_pipe_by_id(id)
    }

    pub fn delete_pipe(&self, id: i64) -> Result<()> {
        let pipe = self.get_pipe_by_id(id)?;
        let contact_id = pipe.contact_id;
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
        self.sync_contact_dates_for_contact(contact_id)?;
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
    fn create_pipe_defaults_titre_from_contact_name() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        use crate::database::models::NewPipe;

        let pipe = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "   ".into(),
                stage: Some(PIPE_STAGE_PROSPECTION.into()),
                notes: None,
            })
            .unwrap();

        assert_eq!(pipe.titre, "Jean DUPONT");
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

    #[test]
    fn set_pipe_stage_updates_and_logs_timeline() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        use crate::database::models::NewPipe;
        use crate::database::pipe_timeline::TIMELINE_AVANCEMENT;

        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "SCPI test".into(),
                stage: Some(PIPE_STAGE_PROSPECTION.into()),
                notes: None,
            })
            .unwrap();

        let updated = db.set_pipe_stage(affaire.id, PIPE_STAGE_R1, None, None).unwrap();
        assert_eq!(updated.stage, PIPE_STAGE_R1);

        let entries = db.list_pipe_timeline_entries(affaire.id).unwrap();
        let avancement = entries
            .iter()
            .find(|e| e.entry_type == TIMELINE_AVANCEMENT)
            .expect("timeline avancement");
        assert_eq!(avancement.titre.as_deref(), Some(PIPE_STAGE_R1));

        db.set_pipe_stage(affaire.id, PIPE_STAGE_R1, None, None).unwrap();
        assert_eq!(
            db.list_pipe_timeline_entries(affaire.id)
                .unwrap()
                .iter()
                .filter(|e| e.entry_type == TIMELINE_AVANCEMENT)
                .count(),
            1
        );

        let with_notes = db
            .set_pipe_stage(affaire.id, PIPE_STAGE_R2, Some("CR du second RDV"), None)
            .unwrap();
        assert_eq!(with_notes.stage, PIPE_STAGE_R2);
        let r2 = db
            .list_pipe_timeline_entries(affaire.id)
            .unwrap()
            .into_iter()
            .find(|e| e.entry_type == TIMELINE_AVANCEMENT && e.titre.as_deref() == Some(PIPE_STAGE_R2))
            .expect("timeline R2");
        assert_eq!(r2.contenu.as_deref(), Some("CR du second RDV"));
    }

    #[test]
    fn update_pipe_to_acte_does_not_log_avancement() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        use crate::database::models::{NewPipe, UpdatePipe};
        use crate::database::pipe_timeline::TIMELINE_AVANCEMENT;

        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire".into(),
                stage: Some(PIPE_STAGE_PROSPECTION.into()),
                notes: None,
            })
            .unwrap();

        db.update_pipe(
            affaire.id,
            UpdatePipe {
                contact_id,
                pipe_type: PIPE_TYPE_ACTION.into(),
                parent_pipe_id: None,
                titre: "Action".into(),
                stage: None,
                notes: None,
            },
        )
        .unwrap();

        assert_eq!(
            db.list_pipe_timeline_entries(affaire.id)
                .unwrap()
                .iter()
                .filter(|e| e.entry_type == TIMELINE_AVANCEMENT)
                .count(),
            0
        );
    }

    #[test]
    fn create_affaire_with_initial_r1_logs_avancement() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        use crate::database::models::NewPipe;
        use crate::database::pipe_timeline::TIMELINE_AVANCEMENT;

        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Direct R1".into(),
                stage: Some(PIPE_STAGE_R1.into()),
                notes: Some("Note initiale".into()),
            })
            .unwrap();

        let avancements: Vec<_> = db
            .list_pipe_timeline_entries(affaire.id)
            .unwrap()
            .into_iter()
            .filter(|e| e.entry_type == TIMELINE_AVANCEMENT)
            .collect();
        assert_eq!(avancements.len(), 1);
        assert_eq!(avancements[0].titre.as_deref(), Some(PIPE_STAGE_R1));
        assert_eq!(avancements[0].contenu.as_deref(), Some("Note initiale"));
    }

    #[test]
    fn parent_cycle_is_rejected() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        use crate::database::models::{NewPipe, UpdatePipe};

        let a = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "A".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let b = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_ACTION.into(),
                parent_pipe_id: Some(a.id),
                titre: "B".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let err = db
            .update_pipe(
                a.id,
                UpdatePipe {
                    contact_id,
                    pipe_type: PIPE_TYPE_AFFAIRE.into(),
                    parent_pipe_id: Some(b.id),
                    titre: "A".into(),
                    stage: Some(PIPE_STAGE_PROSPECTION.into()),
                    notes: None,
                },
            )
            .unwrap_err();
        assert!(err.to_string().contains("cycle"));
    }

    #[test]
    fn update_parent_contact_syncs_children() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_a = seed_contact(&db);
        let contact_b = db
            .create_contact(NewContact {
                nom: "MARTIN".into(),
                prenom: "Paul".into(),
                categorie: "PROSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact b");

        use crate::database::models::{NewPipe, UpdatePipe};

        let acte = db
            .create_pipe(NewPipe {
                contact_id: contact_a,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Acte".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let action = db
            .create_pipe(NewPipe {
                contact_id: contact_a,
                pipe_type: PIPE_TYPE_ACTION.into(),
                parent_pipe_id: Some(acte.id),
                titre: "Action".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        db.update_pipe(
            acte.id,
            UpdatePipe {
                contact_id: contact_b,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Acte".into(),
                stage: None,
                notes: None,
            },
        )
        .unwrap();

        let updated_action = db.get_pipe_by_id(action.id).unwrap();
        assert_eq!(updated_action.contact_id, contact_b);
    }

    #[test]
    fn update_affaire_notes_syncs_creation_timeline() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        use crate::database::models::{NewPipe, UpdatePipe};
        use crate::database::pipe_timeline::TIMELINE_CREATION;

        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire".into(),
                stage: None,
                notes: Some("Initial".into()),
            })
            .unwrap();

        db.update_pipe(
            affaire.id,
            UpdatePipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire".into(),
                stage: Some(PIPE_STAGE_PROSPECTION.into()),
                notes: Some("Modifié".into()),
            },
        )
        .unwrap();

        let creation = db
            .list_pipe_timeline_entries(affaire.id)
            .unwrap()
            .into_iter()
            .find(|e| e.entry_type == TIMELINE_CREATION)
            .expect("creation");
        assert_eq!(creation.contenu.as_deref(), Some("Modifié"));
    }

    #[test]
    fn update_affaire_without_stage_preserves_current_stage() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        use crate::database::models::{NewPipe, UpdatePipe};

        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire".into(),
                stage: Some(PIPE_STAGE_R2.into()),
                notes: None,
            })
            .unwrap();

        let updated = db
            .update_pipe(
                affaire.id,
                UpdatePipe {
                    contact_id,
                    pipe_type: PIPE_TYPE_AFFAIRE.into(),
                    parent_pipe_id: None,
                    titre: "Affaire renommée".into(),
                    stage: None,
                    notes: None,
                },
            )
            .unwrap();

        assert_eq!(updated.stage, PIPE_STAGE_R2);
    }
}
