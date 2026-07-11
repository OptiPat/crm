//! Timeline d'un pipe (appels, RDV, notes…).

use rusqlite::{params, Result, Row};

pub const TIMELINE_APPEL: &str = "APPEL";
pub const TIMELINE_RDV: &str = "RDV";
pub const TIMELINE_NOTE: &str = "NOTE";
pub const TIMELINE_PROPOSITION: &str = "PROPOSITION";
pub const TIMELINE_CREATION: &str = "CREATION";
pub const TIMELINE_AVANCEMENT: &str = "AVANCEMENT";

const USER_TIMELINE_TYPES: &[&str] = &[
    TIMELINE_APPEL,
    TIMELINE_RDV,
    TIMELINE_NOTE,
    TIMELINE_PROPOSITION,
];

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

pub(crate) fn is_valid_user_timeline_type(value: &str) -> bool {
    USER_TIMELINE_TYPES.contains(&value)
}

fn format_pipe_creation_timeline_title(pipe_titre: &str) -> String {
    pipe_titre.trim().to_string()
}

fn normalize_avancement_timeline_stage(titre: &str) -> String {
    let raw = titre.trim();
    const PREFIX: &str = "Avancement passé à ";
    if let Some(label) = raw.strip_prefix(PREFIX) {
        for stage in [
            super::pipe::PIPE_STAGE_PROSPECTION,
            super::pipe::PIPE_STAGE_R1,
            super::pipe::PIPE_STAGE_R2,
            super::pipe::PIPE_STAGE_R3,
            super::pipe::PIPE_STAGE_GAGNEE,
            super::pipe::PIPE_STAGE_PERDUE_OU_EN_ATTENTE,
        ] {
            if super::pipe::pipe_stage_label(stage) == label.trim() {
                return stage.to_string();
            }
        }
    }
    if super::pipe::is_valid_pipe_stage(raw) {
        return raw.to_string();
    }
    raw.to_string()
}

fn map_timeline_row(row: &Row<'_>) -> Result<super::models::PipeTimelineEntry> {
    Ok(super::models::PipeTimelineEntry {
        id: row.get(0)?,
        pipe_id: row.get(1)?,
        entry_type: row.get(2)?,
        titre: row.get(3)?,
        contenu: row.get(4)?,
        occurred_at: row.get(5)?,
        created_at: row.get(6)?,
        google_event_id: row.get(7)?,
    })
}

impl super::Database {
    pub fn migrate_pipe_timeline_table(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS pipe_timeline_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pipe_id INTEGER NOT NULL REFERENCES pipes(id) ON DELETE CASCADE,
                entry_type TEXT NOT NULL,
                titre TEXT,
                contenu TEXT,
                occurred_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_pipe_timeline_pipe
                ON pipe_timeline_entries(pipe_id, occurred_at DESC);
            ",
        )?;
        if !self.table_has_column("pipe_timeline_entries", "google_event_id")? {
            self.conn.execute(
                "ALTER TABLE pipe_timeline_entries ADD COLUMN google_event_id TEXT",
                [],
            )?;
        }
        self.backfill_pipe_creation_timeline_entries()?;
        Ok(())
    }

    fn backfill_pipe_creation_timeline_entries(&self) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id FROM pipes p
             WHERE NOT EXISTS (
               SELECT 1 FROM pipe_timeline_entries e WHERE e.pipe_id = p.id
             )",
        )?;
        let pipe_ids: Vec<i64> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for pipe_id in pipe_ids {
            if let Err(e) = self.seed_pipe_creation_timeline_entry(pipe_id) {
                eprintln!(
                    "⚠️ Backfill timeline ignoré pour pipe {}: {}",
                    pipe_id, e
                );
            }
        }
        self.rewrite_pipe_creation_timeline_entries()?;
        self.rewrite_avancement_timeline_entries()?;
        Ok(())
    }

    fn rewrite_avancement_timeline_entries(&self) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "SELECT id, titre FROM pipe_timeline_entries WHERE entry_type = ?1",
        )?;
        let rows: Vec<(i64, Option<String>)> = stmt
            .query_map(params![TIMELINE_AVANCEMENT], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        for (entry_id, titre) in rows {
            let Some(raw) = titre else { continue };
            let normalized = normalize_avancement_timeline_stage(&raw);
            if normalized != raw {
                self.conn.execute(
                    "UPDATE pipe_timeline_entries SET titre = ?1 WHERE id = ?2",
                    params![normalized, entry_id],
                )?;
            }
        }
        Ok(())
    }

    fn rewrite_pipe_creation_timeline_entries(&self) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, p.titre
             FROM pipe_timeline_entries e
             INNER JOIN pipes p ON p.id = e.pipe_id
             WHERE e.entry_type = ?1",
        )?;
        let rows: Vec<(i64, String)> = stmt
            .query_map(params![TIMELINE_CREATION], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        for (entry_id, pipe_titre) in rows {
            let titre = format_pipe_creation_timeline_title(&pipe_titre);
            self.conn.execute(
                "UPDATE pipe_timeline_entries SET titre = ?1 WHERE id = ?2",
                params![titre, entry_id],
            )?;
        }
        Ok(())
    }

    pub fn list_pipe_timeline_entries(
        &self,
        pipe_id: i64,
    ) -> Result<Vec<super::models::PipeTimelineEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, pipe_id, entry_type, titre, contenu, occurred_at, created_at, google_event_id
             FROM pipe_timeline_entries
             WHERE pipe_id = ?1
             ORDER BY occurred_at DESC, id DESC",
        )?;
        let rows = stmt.query_map(params![pipe_id], map_timeline_row)?;
        rows.collect()
    }

    pub fn create_pipe_timeline_entry(
        &self,
        input: super::models::NewPipeTimelineEntry,
    ) -> Result<super::models::PipeTimelineEntry> {
        if !is_valid_user_timeline_type(&input.entry_type) {
            return Err(rusqlite::Error::InvalidParameterName(
                "type d'entrée timeline invalide".into(),
            ));
        }
        let pipe_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pipes WHERE id = ?1",
            params![input.pipe_id],
            |row| row.get(0),
        )?;
        if pipe_exists == 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "pipe introuvable".into(),
            ));
        }
        let titre = input
            .titre
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let contenu = input
            .contenu
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if titre.is_none() && contenu.is_none() {
            return Err(rusqlite::Error::InvalidParameterName(
                "titre ou contenu requis".into(),
            ));
        }
        let occurred_at = input.occurred_at.unwrap_or_else(now_unix);
        let created_at = now_unix();
        self.conn.execute(
            "INSERT INTO pipe_timeline_entries (pipe_id, entry_type, titre, contenu, occurred_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                input.pipe_id,
                &input.entry_type,
                titre.as_deref(),
                contenu.as_deref(),
                occurred_at,
                created_at,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        let entry = self.get_pipe_timeline_entry(id)?;
        self.sync_contact_dates_from_pipe(input.pipe_id)?;
        Ok(entry)
    }

    pub fn get_pipe_timeline_entry(&self, id: i64) -> Result<super::models::PipeTimelineEntry> {
        self.conn.query_row(
            "SELECT id, pipe_id, entry_type, titre, contenu, occurred_at, created_at, google_event_id
             FROM pipe_timeline_entries WHERE id = ?1",
            params![id],
            map_timeline_row,
        )
    }

    pub fn update_pipe_timeline_occurred_at(&self, id: i64, occurred_at: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE pipe_timeline_entries SET occurred_at = ?1
             WHERE id = ?2 AND entry_type = 'RDV'",
            params![occurred_at, id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        let pipe_id: i64 = self.conn.query_row(
            "SELECT pipe_id FROM pipe_timeline_entries WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        self.sync_contact_dates_from_pipe(pipe_id)?;
        Ok(())
    }

    pub fn set_pipe_timeline_google_event_id(
        &self,
        id: i64,
        google_event_id: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE pipe_timeline_entries SET google_event_id = ?1 WHERE id = ?2",
            params![google_event_id, id],
        )?;
        Ok(())
    }

    pub fn delete_pipe_timeline_entry(&self, id: i64) -> Result<()> {
        let (entry_type, pipe_id): (String, i64) = self.conn.query_row(
            "SELECT entry_type, pipe_id FROM pipe_timeline_entries WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        if entry_type == TIMELINE_CREATION || entry_type == TIMELINE_AVANCEMENT {
            return Err(rusqlite::Error::InvalidParameterName(
                "impossible de supprimer cette entrée système".into(),
            ));
        }
        let deleted = self
            .conn
            .execute("DELETE FROM pipe_timeline_entries WHERE id = ?1", params![id])?;
        if deleted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.sync_contact_dates_from_pipe(pipe_id)?;
        Ok(())
    }

    pub(crate) fn insert_avancement_timeline_entry(
        &self,
        pipe_id: i64,
        new_stage: &str,
        notes: Option<&str>,
        occurred_at: Option<i64>,
    ) -> Result<()> {
        let contenu = notes
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let at = occurred_at.unwrap_or_else(now_unix);
        self.conn.execute(
            "INSERT INTO pipe_timeline_entries (pipe_id, entry_type, titre, contenu, occurred_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![pipe_id, TIMELINE_AVANCEMENT, new_stage, contenu, at],
        )?;
        Ok(())
    }

    pub(crate) fn seed_pipe_creation_timeline_entry(&self, pipe_id: i64) -> Result<()> {
        let (titre, notes, occurred_at): (String, Option<String>, i64) = self.conn.query_row(
            "SELECT titre, notes, created_at FROM pipes WHERE id = ?1",
            params![pipe_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        let titre = format_pipe_creation_timeline_title(&titre);
        let contenu = notes
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        self.conn.execute(
            "INSERT INTO pipe_timeline_entries (pipe_id, entry_type, titre, contenu, occurred_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![pipe_id, TIMELINE_CREATION, titre, contenu, occurred_at],
        )?;
        Ok(())
    }

    pub(crate) fn sync_pipe_creation_timeline_notes(
        &self,
        pipe_id: i64,
        contenu: Option<&str>,
    ) -> Result<()> {
        let normalized = contenu
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        self.conn.execute(
            "UPDATE pipe_timeline_entries SET contenu = ?1
             WHERE pipe_id = ?2 AND entry_type = ?3",
            params![normalized, pipe_id, TIMELINE_CREATION],
        )?;
        Ok(())
    }

    pub fn update_pipe_timeline_milestone_notes(
        &self,
        id: i64,
        contenu: Option<&str>,
    ) -> Result<super::models::PipeTimelineEntry> {
        let entry_type: String = self.conn.query_row(
            "SELECT entry_type FROM pipe_timeline_entries WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if entry_type != TIMELINE_CREATION && entry_type != TIMELINE_AVANCEMENT {
            return Err(rusqlite::Error::InvalidParameterName(
                "seules les notes des jalons d'étape sont modifiables".into(),
            ));
        }
        let normalized = contenu
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let updated = self.conn.execute(
            "UPDATE pipe_timeline_entries SET contenu = ?1 WHERE id = ?2",
            params![normalized, id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.get_pipe_timeline_entry(id)
    }

    pub fn update_pipe_timeline_entry(
        &self,
        id: i64,
        input: super::models::UpdatePipeTimelineEntry,
    ) -> Result<super::models::PipeTimelineEntry> {
        let entry_type: String = self.conn.query_row(
            "SELECT entry_type FROM pipe_timeline_entries WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if !is_valid_user_timeline_type(&entry_type) {
            return Err(rusqlite::Error::InvalidParameterName(
                "seules les entrées utilisateur sont modifiables".into(),
            ));
        }
        let titre = input
            .titre
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let contenu = input
            .contenu
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if titre.is_none() && contenu.is_none() {
            return Err(rusqlite::Error::InvalidParameterName(
                "titre ou contenu requis".into(),
            ));
        }
        let occurred_at = input.occurred_at.unwrap_or_else(|| {
            self.conn
                .query_row(
                    "SELECT occurred_at FROM pipe_timeline_entries WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| now_unix())
        });
        let updated = self.conn.execute(
            "UPDATE pipe_timeline_entries SET titre = ?1, contenu = ?2, occurred_at = ?3 WHERE id = ?4",
            params![titre.as_deref(), contenu.as_deref(), occurred_at, id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        let entry = self.get_pipe_timeline_entry(id)?;
        let pipe_id: i64 = self.conn.query_row(
            "SELECT pipe_id FROM pipe_timeline_entries WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        self.sync_contact_dates_from_pipe(pipe_id)?;
        Ok(entry)
    }

    pub(crate) fn delete_pipe_timeline_for_pipe(&self, pipe_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM pipe_timeline_entries WHERE pipe_id = ?1",
            params![pipe_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewPipe, NewPipeTimelineEntry};
    use crate::database::pipe::PIPE_TYPE_AFFAIRE;
    use crate::database::Database;

    #[test]
    fn pipe_timeline_crud() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "PROSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact id");

        let pipe = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire test".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let entries = db.list_pipe_timeline_entries(pipe.id).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].entry_type, TIMELINE_CREATION);
        assert_eq!(
            entries[0].titre.as_deref(),
            Some("Affaire test")
        );

        let apel = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id: pipe.id,
                entry_type: TIMELINE_APPEL.into(),
                titre: Some("Premier appel".into()),
                contenu: Some("Message laissé".into()),
                occurred_at: None,
            })
            .unwrap();
        assert_eq!(apel.entry_type, TIMELINE_APPEL);

        let all = db.list_pipe_timeline_entries(pipe.id).unwrap();
        assert_eq!(all.len(), 2);

        db.delete_pipe_timeline_entry(apel.id).unwrap();
        assert_eq!(db.list_pipe_timeline_entries(pipe.id).unwrap().len(), 1);
    }

    #[test]
    fn pipe_creation_timeline_includes_notes() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "PROSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact id");

        let pipe = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Test".into(),
                stage: None,
                notes: Some("Premier contexte".into()),
            })
            .unwrap();

        let entries = db.list_pipe_timeline_entries(pipe.id).unwrap();
        assert_eq!(entries[0].contenu.as_deref(), Some("Premier contexte"));
    }

    #[test]
    fn pipe_milestone_notes_are_editable() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "PROSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact id");

        let pipe = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Test".into(),
                stage: None,
                notes: Some("Initial".into()),
            })
            .unwrap();

        let creation = db.list_pipe_timeline_entries(pipe.id).unwrap()[0].id;
        let updated = db
            .update_pipe_timeline_milestone_notes(creation, Some("Notes mises à jour"))
            .unwrap();
        assert_eq!(updated.contenu.as_deref(), Some("Notes mises à jour"));
    }

    #[test]
    fn backfill_timeline_skips_orphan_pipe() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.get_connection()
            .execute(
                "INSERT INTO pipes (contact_id, pipe_type, titre, stage, created_at, updated_at)
                 VALUES (NULL, 'AFFAIRE', 'Orphelin', 'PROSPECTION', 1, 1)",
                [],
            )
            .unwrap();
        assert!(db.migrate_pipe_timeline_table().is_ok());
        let orphan_id: i64 = db
            .get_connection()
            .query_row("SELECT id FROM pipes WHERE titre = 'Orphelin'", [], |r| r.get(0))
            .unwrap();
        let entries = db.list_pipe_timeline_entries(orphan_id).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].entry_type, TIMELINE_CREATION);
    }

    #[test]
    fn pipe_user_timeline_entry_is_updatable() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "PROSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact id");

        let pipe = db
            .create_pipe(NewPipe {
                contact_id,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let apel = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id: pipe.id,
                entry_type: TIMELINE_APPEL.into(),
                titre: Some("Appel".into()),
                contenu: Some("Premier contact".into()),
                occurred_at: None,
            })
            .unwrap();

        let updated = db
            .update_pipe_timeline_entry(
                apel.id,
                crate::database::models::UpdatePipeTimelineEntry {
                    titre: Some("Appel corrigé".into()),
                    contenu: Some("CR mis à jour".into()),
                    occurred_at: Some(1_700_000_000),
                },
            )
            .unwrap();
        assert_eq!(updated.titre.as_deref(), Some("Appel corrigé"));
        assert_eq!(updated.contenu.as_deref(), Some("CR mis à jour"));
        assert_eq!(updated.occurred_at, 1_700_000_000);
    }
}
