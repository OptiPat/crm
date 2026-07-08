//! Notes personnelles (SQLite) + cache des notes partagées (registre).

use crate::notes::{
    NewPersonalNote, PersonalNote, RemoteContribution, RemoteSharedNote, SharedNote,
    SharedNoteContribution, UpdatePersonalNote,
};
use rusqlite::{params, Result};

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

impl super::Database {
    pub fn migrate_notes_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS personal_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content_html TEXT NOT NULL DEFAULT '',
                category TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_personal_notes_updated
                ON personal_notes(updated_at DESC);

            CREATE TABLE IF NOT EXISTS shared_notes_cache (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content_html TEXT NOT NULL DEFAULT '',
                author_installation_id TEXT NOT NULL,
                author_name TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                synced_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS shared_note_contributions_cache (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL,
                author_installation_id TEXT NOT NULL,
                author_name TEXT NOT NULL DEFAULT '',
                content_html TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_shared_note_contributions_note
                ON shared_note_contributions_cache(note_id);
            ",
        )?;
        Ok(())
    }

    pub fn get_all_personal_notes(&self) -> Result<Vec<PersonalNote>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, content_html, category, pinned, created_at, updated_at
             FROM personal_notes
             ORDER BY pinned DESC, updated_at DESC",
        )?;
        let rows = stmt.query_map([], map_personal_note)?;
        rows.collect()
    }

    pub fn get_personal_note(&self, id: i64) -> Result<PersonalNote> {
        self.conn
            .query_row(
                "SELECT id, title, content_html, category, pinned, created_at, updated_at
                 FROM personal_notes WHERE id = ?1",
                params![id],
                map_personal_note,
            )
            .map_err(Into::into)
    }

    pub fn create_personal_note(&self, input: NewPersonalNote) -> Result<PersonalNote> {
        let now = now_unix();
        let pinned = if input.pinned.unwrap_or(false) { 1 } else { 0 };
        self.conn.execute(
            "INSERT INTO personal_notes (title, content_html, category, pinned, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                input.title.trim(),
                input.content_html,
                input.category.as_deref().map(str::trim),
                pinned,
                now,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_personal_note(id)
    }

    pub fn update_personal_note(&self, id: i64, input: UpdatePersonalNote) -> Result<PersonalNote> {
        let now = now_unix();
        let pinned = if input.pinned.unwrap_or(false) { 1 } else { 0 };
        let updated = self.conn.execute(
            "UPDATE personal_notes
             SET title = ?1, content_html = ?2, category = ?3, pinned = ?4, updated_at = ?5
             WHERE id = ?6",
            params![
                input.title.trim(),
                input.content_html,
                input.category.as_deref().map(str::trim),
                pinned,
                now,
                id,
            ],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.get_personal_note(id)
    }

    pub fn delete_personal_note(&self, id: i64) -> Result<()> {
        let deleted = self
            .conn
            .execute("DELETE FROM personal_notes WHERE id = ?1", params![id])?;
        if deleted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn replace_shared_notes_cache(
        &self,
        notes: &[RemoteSharedNote],
        contributions: &[RemoteContribution],
    ) -> Result<()> {
        let now = now_unix();
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM shared_note_contributions_cache", [])?;
        tx.execute("DELETE FROM shared_notes_cache", [])?;
        for note in notes {
            tx.execute(
                "INSERT INTO shared_notes_cache
                 (id, title, content_html, author_installation_id, author_name, created_at, updated_at, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    note.id,
                    note.title,
                    note.content_html,
                    note.installation_id,
                    note.author_name,
                    note.created_at,
                    note.updated_at,
                    now,
                ],
            )?;
        }
        for row in contributions {
            tx.execute(
                "INSERT INTO shared_note_contributions_cache
                 (id, note_id, author_installation_id, author_name, content_html, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    row.id,
                    row.note_id,
                    row.installation_id,
                    row.author_name,
                    row.content_html,
                    row.created_at,
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_shared_notes_view(&self, current_installation_id: &str) -> Result<Vec<SharedNote>> {
        let mut notes_stmt = self.conn.prepare(
            "SELECT id, title, content_html, author_installation_id, author_name, created_at, updated_at
             FROM shared_notes_cache
             ORDER BY updated_at DESC",
        )?;
        let note_rows: Vec<(String, String, String, String, String, i64, i64)> = notes_stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            })?
            .collect::<Result<Vec<_>>>()?;

        let mut result = Vec::with_capacity(note_rows.len());
        for (id, title, content_html, author_installation_id, author_name, created_at, updated_at) in
            note_rows
        {
            let contributions = self.load_shared_contributions(&id)?;
            let is_author = author_installation_id == current_installation_id;
            result.push(SharedNote {
                id,
                title,
                content_html,
                author_installation_id,
                author_name,
                created_at,
                updated_at,
                contributions,
                can_edit: is_author,
                can_delete: is_author,
            });
        }
        Ok(result)
    }

    fn load_shared_contributions(&self, note_id: &str) -> Result<Vec<SharedNoteContribution>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, note_id, author_installation_id, author_name, content_html, created_at
             FROM shared_note_contributions_cache
             WHERE note_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![note_id], |row| {
            Ok(SharedNoteContribution {
                id: row.get(0)?,
                note_id: row.get(1)?,
                author_installation_id: row.get(2)?,
                author_name: row.get(3)?,
                content_html: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }
}

fn map_personal_note(row: &rusqlite::Row<'_>) -> Result<PersonalNote> {
    Ok(PersonalNote {
        id: row.get(0)?,
        title: row.get(1)?,
        content_html: row.get(2)?,
        category: row.get(3)?,
        pinned: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use crate::database::Database;
    use crate::notes::NewPersonalNote;

    #[test]
    fn personal_notes_crud_roundtrip() {
        let db = Database::open_in_memory_for_tests().expect("db");
        db.migrate_notes_tables().expect("migrate");
        let created = db
            .create_personal_note(NewPersonalNote {
                title: "Process import".into(),
                content_html: "<p>Étape 1</p>".into(),
                category: Some("Process".into()),
                pinned: Some(true),
            })
            .expect("create");
        assert!(created.pinned);
        assert_eq!(db.get_all_personal_notes().unwrap().len(), 1);
        db.delete_personal_note(created.id).expect("delete");
        assert!(db.get_all_personal_notes().unwrap().is_empty());
    }
}
