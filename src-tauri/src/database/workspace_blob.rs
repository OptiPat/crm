//! File locale de synchronisation des binaires documentaires SharePoint.

use super::Database;
use rusqlite::{params, OptionalExtension, Result};

#[derive(Debug, Clone)]
pub struct WorkspaceBlobQueueItem {
    pub id: i64,
    pub revision: i64,
    pub document_id: i64,
    pub operation: String,
    pub local_path: Option<String>,
    pub content_sha256: Option<String>,
    pub remote_drive_id: Option<String>,
    pub remote_item_id: Option<String>,
    pub remote_etag: Option<String>,
    pub content_blob: Option<Vec<u8>>,
}

impl Database {
    pub(super) fn migrate_workspace_blob(&self) -> Result<()> {
        for (column, sql_type) in [
            ("workspace_blob_drive_id", "TEXT"),
            ("workspace_blob_item_id", "TEXT"),
            ("workspace_blob_etag", "TEXT"),
            ("workspace_blob_sha256", "TEXT"),
        ] {
            if !self.table_has_column("documents", column)? {
                self.conn.execute(
                    &format!("ALTER TABLE documents ADD COLUMN {column} {sql_type}"),
                    [],
                )?;
            }
        }
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workspace_blob_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL,
                operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
                local_path TEXT,
                content_sha256 TEXT,
                remote_drive_id TEXT,
                remote_item_id TEXT,
                remote_etag TEXT,
                enqueued_at INTEGER NOT NULL DEFAULT (unixepoch()),
                synced_at INTEGER,
                error_message TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS workspace_blob_queue_pending_unique
              ON workspace_blob_queue(document_id) WHERE synced_at IS NULL;",
        )?;
        if !self.table_has_column("workspace_blob_queue", "revision")? {
            self.conn.execute(
                "ALTER TABLE workspace_blob_queue ADD COLUMN revision INTEGER NOT NULL DEFAULT 1",
                [],
            )?;
        }
        if !self.table_has_column("workspace_blob_queue", "content_blob")? {
            self.conn.execute(
                "ALTER TABLE workspace_blob_queue ADD COLUMN content_blob BLOB",
                [],
            )?;
        }
        Ok(())
    }

    pub fn workspace_blob_enqueue_upsert(
        &self,
        document_id: i64,
        local_path: &str,
        content_sha256: &str,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO workspace_blob_queue
                (document_id, operation, local_path, content_sha256)
             VALUES (?1, 'upsert', ?2, ?3)
             ON CONFLICT(document_id) WHERE synced_at IS NULL DO UPDATE SET
                operation = 'upsert',
                local_path = excluded.local_path,
                content_sha256 = excluded.content_sha256,
                remote_drive_id = NULL,
                remote_item_id = NULL,
                remote_etag = NULL,
                content_blob = NULL,
                revision = workspace_blob_queue.revision + 1,
                enqueued_at = unixepoch(),
                error_message = NULL",
            params![document_id, local_path, content_sha256],
        )?;
        Ok(())
    }

    #[cfg(test)]
    pub fn workspace_blob_enqueue_delete(
        &self,
        document_id: i64,
        remote_drive_id: Option<&str>,
        remote_item_id: Option<&str>,
        remote_etag: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO workspace_blob_queue
                (document_id, operation, remote_drive_id, remote_item_id, remote_etag)
             VALUES (?1, 'delete', ?2, ?3, ?4)
             ON CONFLICT(document_id) WHERE synced_at IS NULL DO UPDATE SET
                operation = 'delete',
                local_path = NULL,
                content_sha256 = NULL,
                content_blob = NULL,
                remote_drive_id = excluded.remote_drive_id,
                remote_item_id = excluded.remote_item_id,
                remote_etag = excluded.remote_etag,
                revision = workspace_blob_queue.revision + 1,
                enqueued_at = unixepoch(),
                error_message = NULL",
            params![document_id, remote_drive_id, remote_item_id, remote_etag],
        )?;
        Ok(())
    }

    pub fn workspace_blob_next_pending(&self) -> Result<Option<WorkspaceBlobQueueItem>> {
        self.conn
            .query_row(
                "SELECT id, revision, document_id, operation, local_path, content_sha256,
                        remote_drive_id, remote_item_id, remote_etag, content_blob
                 FROM workspace_blob_queue
                 WHERE workspace_blob_queue.synced_at IS NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM workspace_sync_queue metadata
                     WHERE metadata.table_name = 'documents'
                       AND metadata.synced_at IS NULL
                       AND CAST(json_extract(metadata.record_key, '$[0].value') AS INTEGER)
                           = workspace_blob_queue.document_id
                   )
                   AND NOT EXISTS (
                     SELECT 1 FROM workspace_conflicts conflict
                     WHERE conflict.table_name = 'documents'
                       AND conflict.status = 'open'
                       AND CAST(json_extract(conflict.record_key, '$[0].value') AS INTEGER)
                           = workspace_blob_queue.document_id
                   )
                 ORDER BY id
                 LIMIT 1",
                [],
                |row| {
                    Ok(WorkspaceBlobQueueItem {
                        id: row.get(0)?,
                        revision: row.get(1)?,
                        document_id: row.get(2)?,
                        operation: row.get(3)?,
                        local_path: row.get(4)?,
                        content_sha256: row.get(5)?,
                        remote_drive_id: row.get(6)?,
                        remote_item_id: row.get(7)?,
                        remote_etag: row.get(8)?,
                        content_blob: row.get(9)?,
                    })
                },
            )
            .optional()
    }

    pub fn workspace_blob_pending_count(&self) -> Result<usize> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM workspace_blob_queue WHERE synced_at IS NULL",
            [],
            |row| row.get::<_, i64>(0).map(|count| count as usize),
        )
    }

    pub fn workspace_blob_pending_content(
        &self,
        document_id: i64,
    ) -> Result<Option<(Vec<u8>, String)>> {
        self.conn
            .query_row(
                "SELECT content_blob, content_sha256
                 FROM workspace_blob_queue
                 WHERE document_id = ?1 AND operation = 'upsert'
                   AND synced_at IS NULL AND content_blob IS NOT NULL
                 LIMIT 1",
                [document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
    }

    pub fn workspace_blob_documents_needing_upload(
        &self,
        limit: usize,
    ) -> Result<Vec<(i64, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT d.id, d.chemin_fichier
             FROM documents d
             WHERE d.workspace_blob_item_id IS NULL
               AND d.chemin_fichier NOT LIKE 'workspace-document://%'
               AND NOT EXISTS (
                 SELECT 1 FROM workspace_blob_queue q
                 WHERE q.document_id = d.id AND q.synced_at IS NULL
               )
             ORDER BY d.id
             LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit as i64], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.collect()
    }

    pub fn workspace_blob_stash_pending_content(&self) -> Result<usize> {
        let mut stmt = self.conn.prepare(
            "SELECT id, local_path FROM workspace_blob_queue
             WHERE synced_at IS NULL AND operation = 'upsert'
               AND content_blob IS NULL AND local_path IS NOT NULL",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>>>()?;
        let mut stashed = 0;
        for (id, local_path) in rows {
            let bytes = std::fs::read(&local_path).map_err(|error| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                    error.kind(),
                    format!("Document non synchronisé illisible ({local_path}) : {error}"),
                )))
            })?;
            let sha256 = crate::workspace::documents::bytes_sha256(&bytes);
            self.conn.execute(
                "UPDATE workspace_blob_queue
                 SET content_blob = ?2, content_sha256 = ?3
                 WHERE id = ?1 AND synced_at IS NULL AND operation = 'upsert'",
                params![id, bytes, sha256],
            )?;
            stashed += 1;
        }
        Ok(stashed)
    }

    pub fn workspace_blob_complete_upsert(
        &self,
        queue_id: i64,
        revision: i64,
        document_id: i64,
        drive_id: &str,
        item_id: &str,
        etag: &str,
        sha256: &str,
    ) -> Result<bool> {
        let tx = self.conn.unchecked_transaction()?;
        let current_revision = tx
            .query_row(
                "SELECT revision FROM workspace_blob_queue
                 WHERE id = ?1 AND document_id = ?2 AND synced_at IS NULL",
                params![queue_id, document_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        if current_revision != Some(revision) {
            tx.execute(
                "UPDATE workspace_blob_queue SET
                    remote_drive_id = ?2,
                    remote_item_id = ?3,
                    remote_etag = ?4
                 WHERE id = ?1 AND synced_at IS NULL",
                params![queue_id, drive_id, item_id, etag],
            )?;
            tx.commit()?;
            return Ok(false);
        }
        tx.execute(
            "UPDATE documents SET
                workspace_blob_drive_id = ?2,
                workspace_blob_item_id = ?3,
                workspace_blob_etag = ?4,
                workspace_blob_sha256 = ?5,
                updated_at = unixepoch()
             WHERE id = ?1",
            params![document_id, drive_id, item_id, etag, sha256],
        )?;
        let changed = tx.execute(
            "UPDATE workspace_blob_queue
             SET synced_at = unixepoch(), error_message = NULL
                 , content_blob = NULL
             WHERE id = ?1 AND document_id = ?2 AND revision = ?3 AND synced_at IS NULL",
            params![queue_id, document_id, revision],
        )?;
        if changed != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        tx.commit()?;
        Ok(true)
    }

    pub fn workspace_blob_mark_synced(&self, queue_id: i64, revision: i64) -> Result<bool> {
        let changed = self.conn.execute(
            "UPDATE workspace_blob_queue
             SET synced_at = unixepoch(), error_message = NULL
             WHERE id = ?1 AND revision = ?2 AND synced_at IS NULL",
            params![queue_id, revision],
        )?;
        Ok(changed == 1)
    }

    pub fn workspace_blob_record_error(
        &self,
        queue_id: i64,
        revision: i64,
        error: &str,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE workspace_blob_queue SET error_message = ?3
             WHERE id = ?1 AND revision = ?2 AND synced_at IS NULL",
            params![queue_id, revision, error],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewDocument;

    #[test]
    fn blob_queue_compacts_upsert_then_delete() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_blob_enqueue_upsert(7, "D:/docs/a.pdf", "abc")
            .unwrap();
        db.workspace_blob_enqueue_delete(7, Some("drive"), Some("item"), Some("\"1\""))
            .unwrap();
        let item = db.workspace_blob_next_pending().unwrap().unwrap();
        assert_eq!(item.operation, "delete");
        assert_eq!(item.remote_item_id.as_deref(), Some("item"));
    }

    #[test]
    fn stale_upload_acknowledgement_preserves_concurrent_delete() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.connection()
            .execute(
                "INSERT INTO documents
                   (type_document, nom_fichier, chemin_fichier, taille_fichier)
                 VALUES ('QPI', 'questionnaire.pdf', 'D:/docs/questionnaire.pdf', 10)",
                [],
            )
            .unwrap();
        db.workspace_blob_enqueue_upsert(1, "D:/docs/questionnaire.pdf", "abc")
            .unwrap();
        let upload = db.workspace_blob_next_pending().unwrap().unwrap();
        db.workspace_blob_enqueue_delete(1, None, None, None)
            .unwrap();

        assert!(!db
            .workspace_blob_complete_upsert(
                upload.id,
                upload.revision,
                1,
                "drive",
                "remote-item",
                "\"etag\"",
                "abc",
            )
            .unwrap());
        let pending = db.workspace_blob_next_pending().unwrap().unwrap();
        assert_eq!(pending.operation, "delete");
        assert_eq!(pending.remote_item_id.as_deref(), Some("remote-item"));
    }

    #[test]
    fn pending_content_is_stashed_before_team_cache_sealing() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let temp = std::env::temp_dir().join(format!(
            "workspace_blob_stash_{}_{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&temp).unwrap();
        let path = temp.join("document.pdf");
        std::fs::write(&path, b"contenu-test").unwrap();
        db.workspace_blob_enqueue_upsert(9, &path.to_string_lossy(), "sha")
            .unwrap();

        assert_eq!(db.workspace_blob_stash_pending_content().unwrap(), 1);
        std::fs::remove_file(&path).unwrap();
        let item = db.workspace_blob_next_pending().unwrap().unwrap();
        assert_eq!(
            item.content_blob.as_deref(),
            Some(b"contenu-test".as_slice())
        );
        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn binary_delete_waits_for_metadata_acknowledgement() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_blob_enqueue_delete(12, Some("drive"), Some("item"), Some("\"1\""))
            .unwrap();
        db.workspace_sync_enqueue(
            "documents",
            r#"[{"column":"id","kind":"integer","value":12}]"#,
            "delete",
            None,
        )
        .unwrap();
        assert!(db.workspace_blob_next_pending().unwrap().is_none());

        db.connection()
            .execute(
                "UPDATE workspace_sync_queue SET synced_at = unixepoch()
                 WHERE table_name = 'documents'",
                [],
            )
            .unwrap();
        assert!(db.workspace_blob_next_pending().unwrap().is_some());
    }

    #[test]
    fn team_document_creation_enqueues_binary_in_the_same_database_transaction() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_sync_install_id_block("documents", 1, 100, "seq-documents", "\"1\"")
            .unwrap();
        db.workspace_sync_set_capture_enabled(true).unwrap();
        let directory = std::env::temp_dir().join(format!(
            "workspace_blob_create_{}_{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("document.pdf");
        std::fs::write(&path, b"document-atomique").unwrap();

        let document = db
            .create_document(NewDocument {
                contact_id: None,
                foyer_id: None,
                type_document: "AUTRE".into(),
                nom_fichier: "document.pdf".into(),
                chemin_fichier: path.to_string_lossy().into_owned(),
                taille_fichier: 18,
                mime_type: Some("application/pdf".into()),
                date_document: None,
                notes: None,
                sensibilite_extra_financiere: None,
                experience_investissement: None,
            })
            .unwrap();
        let pending = db.workspace_blob_next_pending().unwrap();
        assert!(
            pending.is_none(),
            "le binaire attend d'abord l'acquittement des métadonnées"
        );
        let queued: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM workspace_blob_queue
                 WHERE document_id = ?1 AND synced_at IS NULL",
                [document.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(queued, 1);
        db.delete_document(document.id).unwrap();
        let operation: String = db
            .connection()
            .query_row(
                "SELECT operation FROM workspace_blob_queue
                 WHERE document_id = ?1 AND synced_at IS NULL",
                [document.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(operation, "delete");

        let _ = std::fs::remove_dir_all(directory);
    }
}
