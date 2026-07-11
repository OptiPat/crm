//! Timeline d'un pipe (appels, RDV, notes…).

use rusqlite::{params, Result, Row};

pub const TIMELINE_APPEL: &str = "APPEL";
pub const TIMELINE_RDV: &str = "RDV";
pub const TIMELINE_NOTE: &str = "NOTE";
pub const TIMELINE_PROPOSITION: &str = "PROPOSITION";
pub const TIMELINE_CREATION: &str = "CREATION";

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

fn map_timeline_row(row: &Row<'_>) -> Result<super::models::PipeTimelineEntry> {
    Ok(super::models::PipeTimelineEntry {
        id: row.get(0)?,
        pipe_id: row.get(1)?,
        entry_type: row.get(2)?,
        titre: row.get(3)?,
        contenu: row.get(4)?,
        occurred_at: row.get(5)?,
        created_at: row.get(6)?,
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
        self.backfill_pipe_creation_timeline_entries()?;
        Ok(())
    }

    fn backfill_pipe_creation_timeline_entries(&self) -> Result<()> {
        self.conn.execute(
            "INSERT INTO pipe_timeline_entries (pipe_id, entry_type, titre, contenu, occurred_at, created_at)
             SELECT p.id, ?1, 'Pipe créé', NULL, p.created_at, p.created_at
             FROM pipes p
             WHERE NOT EXISTS (
               SELECT 1 FROM pipe_timeline_entries e WHERE e.pipe_id = p.id
             )",
            params![TIMELINE_CREATION],
        )?;
        Ok(())
    }

    pub fn list_pipe_timeline_entries(
        &self,
        pipe_id: i64,
    ) -> Result<Vec<super::models::PipeTimelineEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, pipe_id, entry_type, titre, contenu, occurred_at, created_at
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
        self.get_pipe_timeline_entry(id)
    }

    pub fn get_pipe_timeline_entry(&self, id: i64) -> Result<super::models::PipeTimelineEntry> {
        self.conn.query_row(
            "SELECT id, pipe_id, entry_type, titre, contenu, occurred_at, created_at
             FROM pipe_timeline_entries WHERE id = ?1",
            params![id],
            map_timeline_row,
        )
    }

    pub fn delete_pipe_timeline_entry(&self, id: i64) -> Result<()> {
        let entry_type: String = self.conn.query_row(
            "SELECT entry_type FROM pipe_timeline_entries WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if entry_type == TIMELINE_CREATION {
            return Err(rusqlite::Error::InvalidParameterName(
                "impossible de supprimer l'entrée de création".into(),
            ));
        }
        let deleted = self
            .conn
            .execute("DELETE FROM pipe_timeline_entries WHERE id = ?1", params![id])?;
        if deleted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub(crate) fn seed_pipe_creation_timeline_entry(&self, pipe_id: i64) -> Result<()> {
        let now = now_unix();
        self.conn.execute(
            "INSERT INTO pipe_timeline_entries (pipe_id, entry_type, titre, contenu, occurred_at, created_at)
             VALUES (?1, ?2, ?3, NULL, ?4, ?4)",
            params![pipe_id, TIMELINE_CREATION, "Pipe créé", now],
        )?;
        Ok(())
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
}
