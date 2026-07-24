//! Documents rattachés à un contact / foyer. Extrait de `operations.rs`.

use rusqlite::{params, OptionalExtension, Result};

fn map_document_row(row: &rusqlite::Row<'_>) -> Result<super::models::Document> {
    Ok(super::models::Document {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        foyer_id: row.get(2)?,
        type_document: row.get(3)?,
        nom_fichier: row.get(4)?,
        chemin_fichier: row.get(5)?,
        taille_fichier: row.get(6)?,
        mime_type: row.get(7)?,
        date_document: row.get(8)?,
        notes: row.get(9)?,
        sensibilite_extra_financiere: row.get(10)?,
        experience_investissement: row.get(11)?,
        workspace_blob_drive_id: row.get(12)?,
        workspace_blob_item_id: row.get(13)?,
        workspace_blob_etag: row.get(14)?,
        workspace_blob_sha256: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

const DOCUMENT_SELECT: &str =
    "SELECT id, contact_id, foyer_id, type_document, nom_fichier, chemin_fichier,
                    taille_fichier, mime_type, date_document, notes, sensibilite_extra_financiere,
                    experience_investissement, workspace_blob_drive_id, workspace_blob_item_id,
                    workspace_blob_etag, workspace_blob_sha256, created_at, updated_at
             FROM documents";

impl super::Database {
    pub fn get_all_documents(&self) -> Result<Vec<super::models::Document>> {
        let mut stmt = self
            .conn
            .prepare(&format!("{DOCUMENT_SELECT} ORDER BY created_at DESC"))?;

        let documents = stmt.query_map([], map_document_row)?;

        let mut result = Vec::new();
        for document in documents {
            result.push(document?);
        }
        Ok(result)
    }

    pub fn get_documents_by_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<super::models::Document>> {
        let mut stmt = self.conn.prepare(&format!(
            "{DOCUMENT_SELECT} WHERE contact_id = ?1 ORDER BY created_at DESC"
        ))?;

        let documents = stmt.query_map(params![contact_id], map_document_row)?;

        let mut result = Vec::new();
        for document in documents {
            result.push(document?);
        }
        Ok(result)
    }

    pub fn create_document(
        &self,
        document: super::models::NewDocument,
    ) -> Result<super::models::Document> {
        let capture_enabled = self
            .conn
            .query_row(
                "SELECT value = '1' FROM workspace_sync_state WHERE key = 'capture_enabled'",
                [],
                |row| row.get::<_, bool>(0),
            )
            .optional()?
            .unwrap_or(false);
        let content_sha256 = if capture_enabled {
            Some(
                crate::workspace::documents::file_sha256(std::path::Path::new(
                    &document.chemin_fichier,
                ))
                .map_err(|message| {
                    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        message,
                    )))
                })?,
            )
        } else {
            None
        };
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO documents (contact_id, foyer_id, type_document, nom_fichier, chemin_fichier,
                                   taille_fichier, mime_type, date_document, notes,
                                   sensibilite_extra_financiere, experience_investissement) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                &document.contact_id,
                &document.foyer_id,
                &document.type_document,
                &document.nom_fichier,
                &document.chemin_fichier,
                &document.taille_fichier,
                &document.mime_type,
                &document.date_document,
                &document.notes,
                &document.sensibilite_extra_financiere,
                &document.experience_investissement,
            ],
        )?;

        let id = tx.last_insert_rowid();
        if let Some(content_sha256) = content_sha256 {
            tx.execute(
                "INSERT INTO workspace_blob_queue
                    (document_id, operation, local_path, content_sha256)
                 VALUES (?1, 'upsert', ?2, ?3)",
                params![id, &document.chemin_fichier, content_sha256],
            )?;
        }
        tx.commit()?;
        self.get_document_by_id(id)
    }

    pub fn get_document_by_id(&self, id: i64) -> Result<super::models::Document> {
        self.conn.query_row(
            &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
            params![id],
            map_document_row,
        )
    }

    pub fn get_document_id_by_path(&self, path: &str) -> Result<Option<i64>> {
        self.conn
            .query_row(
                "SELECT id FROM documents WHERE chemin_fichier = ?1",
                params![path],
                |row| row.get(0),
            )
            .optional()
    }

    pub fn update_document(
        &self,
        id: i64,
        document: &super::models::NewDocument,
        file_relocation: Option<(&str, i64)>,
    ) -> Result<super::models::Document> {
        if let Some((chemin_fichier, taille_fichier)) = file_relocation {
            self.conn.execute(
                "UPDATE documents SET 
                    contact_id = ?1,
                    foyer_id = ?2,
                    type_document = ?3,
                    nom_fichier = ?4,
                    chemin_fichier = ?5,
                    taille_fichier = ?6,
                    date_document = ?7,
                    notes = ?8,
                    sensibilite_extra_financiere = ?9,
                    experience_investissement = ?10,
                    updated_at = unixepoch()
                WHERE id = ?11",
                params![
                    &document.contact_id,
                    &document.foyer_id,
                    &document.type_document,
                    &document.nom_fichier,
                    chemin_fichier,
                    taille_fichier,
                    &document.date_document,
                    &document.notes,
                    &document.sensibilite_extra_financiere,
                    &document.experience_investissement,
                    id
                ],
            )?;
        } else {
            self.conn.execute(
                "UPDATE documents SET 
                    contact_id = ?1,
                    foyer_id = ?2,
                    type_document = ?3,
                    nom_fichier = ?4,
                    date_document = ?5,
                    notes = ?6,
                    sensibilite_extra_financiere = ?7,
                    experience_investissement = ?8,
                    updated_at = unixepoch()
                WHERE id = ?9",
                params![
                    &document.contact_id,
                    &document.foyer_id,
                    &document.type_document,
                    &document.nom_fichier,
                    &document.date_document,
                    &document.notes,
                    &document.sensibilite_extra_financiere,
                    &document.experience_investissement,
                    id
                ],
            )?;
        }

        self.get_document_by_id(id)
    }

    pub fn delete_document(&self, id: i64) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO workspace_blob_queue
                (document_id, operation, remote_drive_id, remote_item_id, remote_etag)
             SELECT id, 'delete', workspace_blob_drive_id, workspace_blob_item_id,
                    workspace_blob_etag
             FROM documents
             WHERE id = ?1
               AND COALESCE((
                 SELECT value FROM workspace_sync_state WHERE key = 'capture_enabled'
               ), '0') = '1'
             ON CONFLICT(document_id) WHERE synced_at IS NULL DO UPDATE SET
                operation = 'delete',
                local_path = NULL,
                content_sha256 = NULL,
                remote_drive_id = excluded.remote_drive_id,
                remote_item_id = excluded.remote_item_id,
                remote_etag = excluded.remote_etag,
                revision = workspace_blob_queue.revision + 1,
                enqueued_at = unixepoch(),
                error_message = NULL",
            params![id],
        )?;
        tx.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        tx.commit()
    }

    pub fn update_document_file_path(
        &self,
        id: i64,
        chemin_fichier: &str,
        taille_fichier: i64,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE documents SET chemin_fichier = ?1, taille_fichier = ?2, updated_at = unixepoch() WHERE id = ?3",
            params![chemin_fichier, taille_fichier, id],
        )?;
        Ok(())
    }

    pub fn workspace_set_downloaded_document_path(
        &self,
        id: i64,
        chemin_fichier: &str,
        taille_fichier: i64,
    ) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO workspace_sync_state(key, value)
             VALUES ('apply_origin', 'remote')
             ON CONFLICT(key) DO UPDATE SET value = 'remote'",
            [],
        )?;
        tx.execute(
            "UPDATE documents SET chemin_fichier = ?1, taille_fichier = ?2 WHERE id = ?3",
            params![chemin_fichier, taille_fichier, id],
        )?;
        tx.execute(
            "UPDATE workspace_sync_state SET value = 'local' WHERE key = 'apply_origin'",
            [],
        )?;
        tx.commit()
    }
}
