//! Suivi des opérations partenaire Stellium Box Placement.

use rusqlite::{params, OptionalExtension, Result, Row};
use crate::database::pipe::PIPE_TYPE_ACTE_GESTION;

pub const STATUS_PENDING: &str = "PENDING";
pub const STATUS_CONFORME: &str = "CONFORME";
pub const STATUS_NON_CONFORME: &str = "NON_CONFORME";

pub const OP_ARBITRAGE: &str = "ARBITRAGE";
pub const OP_VERSEMENT: &str = "VERSEMENT";
pub const OP_REINVESTISSEMENT: &str = "REINVESTISSEMENT";
pub const OP_SOUSCRIPTION: &str = "SOUSCRIPTION";
pub const OP_AUTRE: &str = "AUTRE";

const VALID_STATUSES: &[&str] = &[STATUS_PENDING, STATUS_CONFORME, STATUS_NON_CONFORME];
const VALID_OPERATION_TYPES: &[&str] = &[
    OP_ARBITRAGE,
    OP_VERSEMENT,
    OP_REINVESTISSEMENT,
    OP_SOUSCRIPTION,
    OP_AUTRE,
];

pub fn is_valid_placement_status(status: &str) -> bool {
    VALID_STATUSES.contains(&status)
}

pub fn is_valid_placement_operation_type(operation_type: &str) -> bool {
    VALID_OPERATION_TYPES.contains(&operation_type)
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn map_placement_row(row: &Row<'_>) -> Result<super::models::PlacementOperation> {
    Ok(super::models::PlacementOperation {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        pipe_id: row.get(2)?,
        pipe_timeline_entry_id: row.get(3)?,
        operation_type: row.get(4)?,
        product_label: row.get(5)?,
        stellium_label: row.get(6)?,
        status: row.get(7)?,
        gmail_message_id: row.get(8)?,
        email_subject: row.get(9)?,
        email_received_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const PLACEMENT_SELECT: &str = "po.id, po.contact_id, po.pipe_id, po.pipe_timeline_entry_id,
    po.operation_type, po.product_label, po.stellium_label, po.status,
    po.gmail_message_id, po.email_subject, po.email_received_at, po.created_at, po.updated_at";

pub fn map_stellium_label_to_operation_type(label: &str) -> &'static str {
    let lower = label.to_lowercase();
    let lower = lower
        .replace('é', "e")
        .replace('è', "e")
        .replace('ê', "e");
    if lower.contains("arbitrage") {
        return OP_ARBITRAGE;
    }
    if lower.contains("versement") {
        return OP_VERSEMENT;
    }
    if lower.contains("reinvestissement") {
        return OP_REINVESTISSEMENT;
    }
    if lower.contains("souscription") {
        return OP_SOUSCRIPTION;
    }
    OP_AUTRE
}

impl super::Database {
    pub fn migrate_placement_operations_table(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS placement_operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                pipe_id INTEGER,
                pipe_timeline_entry_id INTEGER,
                operation_type TEXT NOT NULL,
                product_label TEXT,
                stellium_label TEXT,
                status TEXT NOT NULL DEFAULT 'PENDING',
                gmail_message_id TEXT,
                email_subject TEXT,
                email_received_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE SET NULL,
                FOREIGN KEY (pipe_timeline_entry_id) REFERENCES pipe_timeline_entries(id) ON DELETE SET NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_placement_ops_gmail
                ON placement_operations(gmail_message_id)
                WHERE gmail_message_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_placement_ops_contact ON placement_operations(contact_id);
            CREATE INDEX IF NOT EXISTS idx_placement_ops_pipe ON placement_operations(pipe_id);
            CREATE INDEX IF NOT EXISTS idx_placement_ops_status ON placement_operations(status);
            ",
        )?;
        Ok(())
    }

    pub fn create_placement_operation(
        &self,
        input: super::models::NewPlacementOperation,
    ) -> Result<super::models::PlacementOperation> {
        if input.contact_id <= 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "contact_id invalide".into(),
            ));
        }
        if !is_valid_placement_operation_type(&input.operation_type) {
            return Err(rusqlite::Error::InvalidParameterName(
                "operation_type invalide".into(),
            ));
        }
        if let Some(pipe_id) = input.pipe_id {
            if pipe_id > 0 {
                if let Some(existing) =
                    self.find_pending_placement_for_pipe(pipe_id, &input.operation_type)?
                {
                    if let Some(entry_id) = input.pipe_timeline_entry_id.filter(|id| *id > 0) {
                        if existing.pipe_timeline_entry_id != Some(entry_id) {
                            let now = now_unix();
                            self.conn.execute(
                                "UPDATE placement_operations
                                 SET pipe_timeline_entry_id = ?1, updated_at = ?2
                                 WHERE id = ?3",
                                params![entry_id, now, existing.id],
                            )?;
                            return self.get_placement_operation_by_id(existing.id);
                        }
                    }
                    return Ok(existing);
                }
            }
        }
        let now = now_unix();
        self.conn.execute(
            "INSERT INTO placement_operations (
                contact_id, pipe_id, pipe_timeline_entry_id, operation_type,
                product_label, stellium_label, status, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                input.contact_id,
                input.pipe_id,
                input.pipe_timeline_entry_id,
                input.operation_type,
                input.product_label,
                input.stellium_label,
                STATUS_PENDING,
                now,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_placement_operation_by_id(id)
    }

    pub fn get_placement_operation_by_id(
        &self,
        id: i64,
    ) -> Result<super::models::PlacementOperation> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT} FROM placement_operations po WHERE po.id = ?1"
        ))?;
        let mut rows = stmt.query_map(params![id], map_placement_row)?;
        rows.next()
            .transpose()?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn list_placement_operations_for_pipe(
        &self,
        pipe_id: i64,
    ) -> Result<Vec<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.pipe_id = ?1
             ORDER BY po.updated_at DESC, po.id DESC"
        ))?;
        let rows = stmt.query_map(params![pipe_id], map_placement_row)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn list_placement_operations_with_contacts(
        &self,
    ) -> Result<Vec<super::models::PlacementOperationWithContact>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}, c.nom, c.prenom, p.titre
             FROM placement_operations po
             INNER JOIN contacts c ON c.id = po.contact_id
             LEFT JOIN pipes p ON p.id = po.pipe_id
             ORDER BY
               CASE po.status
                 WHEN 'NON_CONFORME' THEN 0
                 WHEN 'PENDING' THEN 1
                 ELSE 2
               END,
               po.updated_at DESC,
               po.id DESC"
        ))?;
        let rows = stmt.query_map([], |row| {
            Ok(super::models::PlacementOperationWithContact {
                operation: super::models::PlacementOperation {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    pipe_id: row.get(2)?,
                    pipe_timeline_entry_id: row.get(3)?,
                    operation_type: row.get(4)?,
                    product_label: row.get(5)?,
                    stellium_label: row.get(6)?,
                    status: row.get(7)?,
                    gmail_message_id: row.get(8)?,
                    email_subject: row.get(9)?,
                    email_received_at: row.get(10)?,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                },
                contact_nom: row.get(13)?,
                contact_prenom: row.get(14)?,
                pipe_titre: row.get(15)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn find_pending_placement_for_pipe(
        &self,
        pipe_id: i64,
        operation_type: &str,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.pipe_id = ?1 AND po.operation_type = ?2 AND po.status = ?3
             ORDER BY po.id DESC
             LIMIT 1"
        ))?;
        let mut rows = stmt.query_map(
            params![pipe_id, operation_type, STATUS_PENDING],
            map_placement_row,
        )?;
        Ok(rows.next().transpose()?)
    }

    pub fn find_pending_placement_for_contact(
        &self,
        contact_id: i64,
        operation_type: &str,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.contact_id = ?1 AND po.operation_type = ?2 AND po.status = ?3
             ORDER BY po.id DESC
             LIMIT 1"
        ))?;
        let mut rows = stmt.query_map(
            params![contact_id, operation_type, STATUS_PENDING],
            map_placement_row,
        )?;
        Ok(rows.next().transpose()?)
    }

    pub fn placement_operation_exists_for_gmail(&self, gmail_message_id: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM placement_operations WHERE gmail_message_id = ?1",
            params![gmail_message_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn update_placement_operation_status(
        &self,
        id: i64,
        status: &str,
    ) -> Result<super::models::PlacementOperation> {
        if !is_valid_placement_status(status) {
            return Err(rusqlite::Error::InvalidParameterName(
                "status invalide".into(),
            ));
        }
        let now = now_unix();
        self.conn.execute(
            "UPDATE placement_operations SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, id],
        )?;
        self.get_placement_operation_by_id(id)
    }

    pub fn find_latest_suivi_pipe_id_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Option<i64>> {
        self.conn
            .query_row(
                "SELECT id FROM pipes
                 WHERE contact_id = ?1 AND pipe_type = ?2
                 ORDER BY updated_at DESC, id DESC
                 LIMIT 1",
                params![contact_id, PIPE_TYPE_ACTE_GESTION],
                |row| row.get(0),
            )
            .optional()
    }

    pub fn find_placement_for_email_match(
        &self,
        contact_id: i64,
        operation_type: &str,
        new_status: &str,
        pipe_id_hint: Option<i64>,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let pipe_id = pipe_id_hint.filter(|id| *id > 0);
        if let Some(pipe_id) = pipe_id {
            if let Some(op) = self.find_pending_placement_for_pipe(pipe_id, operation_type)? {
                return Ok(Some(op));
            }
            if new_status == STATUS_CONFORME {
                if let Some(op) =
                    self.find_open_placement_for_pipe(pipe_id, operation_type, STATUS_NON_CONFORME)?
                {
                    return Ok(Some(op));
                }
            }
        }
        if let Some(op) = self.find_pending_placement_for_contact(contact_id, operation_type)? {
            return Ok(Some(op));
        }
        if new_status == STATUS_CONFORME {
            if let Some(op) = self.find_open_placement_for_contact(
                contact_id,
                operation_type,
                STATUS_NON_CONFORME,
            )? {
                return Ok(Some(op));
            }
        }
        Ok(None)
    }

    fn find_open_placement_for_pipe(
        &self,
        pipe_id: i64,
        operation_type: &str,
        status: &str,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.pipe_id = ?1 AND po.operation_type = ?2 AND po.status = ?3
             ORDER BY po.id DESC
             LIMIT 1"
        ))?;
        let mut rows = stmt.query_map(params![pipe_id, operation_type, status], map_placement_row)?;
        Ok(rows.next().transpose()?)
    }

    fn find_open_placement_for_contact(
        &self,
        contact_id: i64,
        operation_type: &str,
        status: &str,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.contact_id = ?1 AND po.operation_type = ?2 AND po.status = ?3
             ORDER BY po.id DESC
             LIMIT 1"
        ))?;
        let mut rows = stmt.query_map(
            params![contact_id, operation_type, status],
            map_placement_row,
        )?;
        Ok(rows.next().transpose()?)
    }

    pub fn count_open_placement_operations(&self) -> Result<(u32, u32)> {
        let pending: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM placement_operations WHERE status = ?1",
            params![STATUS_PENDING],
            |row| row.get(0),
        )?;
        let non_conforme: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM placement_operations WHERE status = ?1",
            params![STATUS_NON_CONFORME],
            |row| row.get(0),
        )?;
        Ok((pending as u32, non_conforme as u32))
    }

    pub fn get_placement_open_counts_by_pipe(
        &self,
    ) -> Result<std::collections::HashMap<i64, (u32, u32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT pipe_id, status, COUNT(*)
             FROM placement_operations
             WHERE pipe_id IS NOT NULL
               AND status IN (?1, ?2)
             GROUP BY pipe_id, status",
        )?;
        let rows = stmt.query_map(
            params![STATUS_PENDING, STATUS_NON_CONFORME],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)? as u32,
                ))
            },
        )?;
        let mut map = std::collections::HashMap::new();
        for row in rows {
            let (pipe_id, status, count) = row?;
            let entry = map.entry(pipe_id).or_insert((0u32, 0u32));
            if status == STATUS_PENDING {
                entry.0 = count;
            } else if status == STATUS_NON_CONFORME {
                entry.1 = count;
            }
        }
        Ok(map)
    }

    pub fn apply_placement_email_update(
        &self,
        contact_id: i64,
        operation_type: &str,
        status: &str,
        stellium_label: Option<&str>,
        product_label: Option<&str>,
        gmail_message_id: &str,
        email_subject: Option<&str>,
        email_received_at: i64,
        pipe_id_hint: Option<i64>,
    ) -> Result<(super::models::PlacementOperation, bool)> {
        if self.placement_operation_exists_for_gmail(gmail_message_id)? {
            let mut stmt = self.conn.prepare(&format!(
                "SELECT {PLACEMENT_SELECT} FROM placement_operations po WHERE po.gmail_message_id = ?1"
            ))?;
            let mut rows = stmt.query_map(params![gmail_message_id], map_placement_row)?;
            let existing = rows.next().transpose()?.unwrap();
            return Ok((existing, false));
        }

        if !is_valid_placement_status(status) {
            return Err(rusqlite::Error::InvalidParameterName(
                "status invalide".into(),
            ));
        }
        if !is_valid_placement_operation_type(operation_type) {
            return Err(rusqlite::Error::InvalidParameterName(
                "operation_type invalide".into(),
            ));
        }

        let pending = self.find_placement_for_email_match(
            contact_id,
            operation_type,
            status,
            pipe_id_hint,
        )?;

        let now = now_unix();
        if let Some(op) = pending {
            let pipe_id_to_set = pipe_id_hint.filter(|id| *id > 0);
            self.conn.execute(
                "UPDATE placement_operations SET
                    status = ?1,
                    stellium_label = COALESCE(?2, stellium_label),
                    product_label = COALESCE(?3, product_label),
                    gmail_message_id = ?4,
                    email_subject = ?5,
                    email_received_at = ?6,
                    pipe_id = COALESCE(?7, pipe_id),
                    updated_at = ?8
                 WHERE id = ?9",
                params![
                    status,
                    stellium_label,
                    product_label,
                    gmail_message_id,
                    email_subject,
                    email_received_at,
                    pipe_id_to_set,
                    now,
                    op.id,
                ],
            )?;
            return Ok((self.get_placement_operation_by_id(op.id)?, true));
        }

        self.conn.execute(
            "INSERT INTO placement_operations (
                contact_id, pipe_id, operation_type, product_label, stellium_label,
                status, gmail_message_id, email_subject, email_received_at, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                contact_id,
                pipe_id_hint,
                operation_type,
                product_label,
                stellium_label,
                status,
                gmail_message_id,
                email_subject,
                email_received_at,
                now,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        Ok((self.get_placement_operation_by_id(id)?, true))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewContact;

    fn sample_contact(nom: &str, prenom: &str) -> NewContact {
        NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            statut_suivi: Some("ACTIF".into()),
            ..Default::default()
        }
    }

    #[test]
    fn map_stellium_labels() {
        assert_eq!(
            map_stellium_label_to_operation_type("Arbitrage libre"),
            OP_ARBITRAGE
        );
        assert_eq!(
            map_stellium_label_to_operation_type("Versements programmés : Mise en place"),
            OP_VERSEMENT
        );
    }

    fn create_and_apply_email_update() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let pending = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,
            })
            .unwrap();
        assert_eq!(pending.status, STATUS_PENDING);

        let (updated, changed) = db
            .apply_placement_email_update(
                contact_id,
                OP_ARBITRAGE,
                STATUS_CONFORME,
                Some("Arbitrage libre"),
                Some("Cristalliance Evoluvie"),
                "msg-1",
                Some("subject"),
                1_700_000_000,
                None,
            )
            .unwrap();
        assert!(changed);
        assert_eq!(updated.id, pending.id);
        assert_eq!(updated.status, STATUS_CONFORME);
        assert_eq!(updated.gmail_message_id.as_deref(), Some("msg-1"));
    }

    #[test]
    fn create_updates_timeline_on_existing_pending() {
        use super::super::models::NewPipeTimelineEntry;

        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        db.migrate_pipe_timeline_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi test".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let pipe_id = pipe.id;
        let entry1 = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: "ARBITRAGE".into(),
                titre: Some("Arbitrage".into()),
                contenu: None,
                occurred_at: Some(1_700_000_000),
            })
            .unwrap();
        let entry2 = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: "ARBITRAGE".into(),
                titre: Some("Arbitrage 2".into()),
                contenu: None,
                occurred_at: Some(1_700_000_100),
            })
            .unwrap();

        let first = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe_id),
                pipe_timeline_entry_id: Some(entry1.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,
            })
            .unwrap();
        assert_eq!(first.pipe_timeline_entry_id, Some(entry1.id));

        let second = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe_id),
                pipe_timeline_entry_id: Some(entry2.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,
            })
            .unwrap();
        assert_eq!(second.id, first.id);
        assert_eq!(second.pipe_timeline_entry_id, Some(entry2.id));
    }

    #[test]
    fn apply_email_reassigns_pipe_id_on_contact_fallback() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let old_pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Ancien suivi".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let new_pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Nouveau suivi".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let pending = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(old_pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,
            })
            .unwrap();

        let (updated, changed) = db
            .apply_placement_email_update(
                contact_id,
                OP_ARBITRAGE,
                STATUS_CONFORME,
                Some("Arbitrage libre"),
                Some("Produit test"),
                "msg-pipe",
                Some("subject"),
                1_700_000_000,
                Some(new_pipe.id),
            )
            .unwrap();
        assert!(changed);
        assert_eq!(updated.id, pending.id);
        assert_eq!(updated.pipe_id, Some(new_pipe.id));
    }
}
