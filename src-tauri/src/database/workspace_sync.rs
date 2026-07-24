//! Export déterministe SQLite → JSON et file d'attente sync workspace (mode équipe).
//! Lecture seule pour les snapshots de migration — aucun apply/import dans ce jalon.

use super::Database;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use rusqlite::types::ValueRef;
use rusqlite::{params, Connection, Result, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const WORKSPACE_SYNC_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceTablePolicy {
    Shared,
    LocalOnly,
    Derived,
    ExternalBlob,
}

/// Classification exhaustive des tables applicatives.
///
/// Une nouvelle table non déclarée fait échouer le snapshot au lieu d'être
/// envoyée silencieusement vers SharePoint avec d'éventuels secrets.
const TABLE_POLICIES: &[(&str, WorkspaceTablePolicy)] = &[
    ("familles", WorkspaceTablePolicy::Shared),
    ("foyers", WorkspaceTablePolicy::Shared),
    ("contacts", WorkspaceTablePolicy::Shared),
    ("partenaires", WorkspaceTablePolicy::Shared),
    ("documents", WorkspaceTablePolicy::ExternalBlob),
    ("investissements", WorkspaceTablePolicy::Shared),
    ("alertes", WorkspaceTablePolicy::Shared),
    ("templates_email", WorkspaceTablePolicy::Shared),
    ("etiquettes", WorkspaceTablePolicy::Shared),
    ("contact_etiquettes", WorkspaceTablePolicy::Shared),
    ("etiquette_actions", WorkspaceTablePolicy::Shared),
    ("interactions", WorkspaceTablePolicy::Shared),
    ("settings", WorkspaceTablePolicy::LocalOnly),
    ("taches", WorkspaceTablePolicy::Shared),
    ("tache_contacts", WorkspaceTablePolicy::Shared),
    ("custom_field_defs", WorkspaceTablePolicy::Shared),
    ("custom_field_values", WorkspaceTablePolicy::Shared),
    ("compta_depenses", WorkspaceTablePolicy::Shared),
    ("compta_encaissements", WorkspaceTablePolicy::Shared),
    ("compta_deplacements", WorkspaceTablePolicy::Shared),
    (
        "google_contact_name_proposal_dismissals",
        WorkspaceTablePolicy::LocalOnly,
    ),
    ("email_send_log", WorkspaceTablePolicy::Shared),
    ("calendar_events", WorkspaceTablePolicy::Derived),
    ("contact_gmail_messages", WorkspaceTablePolicy::Derived),
    ("contact_mail_sync_state", WorkspaceTablePolicy::LocalOnly),
    (
        "contact_etiquette_auto_exclusions",
        WorkspaceTablePolicy::Shared,
    ),
    ("segments", WorkspaceTablePolicy::Shared),
    ("alerte_segment_links", WorkspaceTablePolicy::Shared),
    ("contact_etiquette_auto_log", WorkspaceTablePolicy::Shared),
    ("newsletter_editions", WorkspaceTablePolicy::Shared),
    (
        "newsletter_edition_recipients",
        WorkspaceTablePolicy::Shared,
    ),
    ("investissement_versements", WorkspaceTablePolicy::Shared),
    ("investissement_valorisations", WorkspaceTablePolicy::Shared),
    ("contact_template_envois", WorkspaceTablePolicy::Shared),
    ("template_email_actions", WorkspaceTablePolicy::Shared),
    ("placement_operations", WorkspaceTablePolicy::Shared),
    ("pipe_timeline_entries", WorkspaceTablePolicy::Shared),
    ("pipe_rdv_scheduled_emails", WorkspaceTablePolicy::Shared),
    (
        "pipe_r3_immo_document_checklists",
        WorkspaceTablePolicy::Shared,
    ),
    ("pipe_r3_document_checklists", WorkspaceTablePolicy::Shared),
    ("pipe_r1_document_checklists", WorkspaceTablePolicy::Shared),
    ("pipes", WorkspaceTablePolicy::Shared),
    ("personal_notes", WorkspaceTablePolicy::LocalOnly),
    ("shared_notes_cache", WorkspaceTablePolicy::Derived),
    (
        "shared_note_contributions_cache",
        WorkspaceTablePolicy::Derived,
    ),
    ("filleul_volume_exercices", WorkspaceTablePolicy::Shared),
    ("filleul_dossier", WorkspaceTablePolicy::Shared),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMigrationSnapshot {
    pub schema_version: u32,
    pub generated_at: String,
    pub table_counts: BTreeMap<String, usize>,
    pub records: Vec<SnapshotRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRecord {
    pub table_name: String,
    pub record_key: String,
    pub payload: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMigrationPreview {
    pub schema_version: u32,
    pub generated_at: String,
    pub table_counts: Vec<TableRecordCount>,
    pub total_records: usize,
    pub checksum_sha256: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRecordCount {
    pub table_name: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceSyncQueueItem {
    pub id: i64,
    pub revision: i64,
    pub table_name: String,
    pub record_key: String,
    pub operation: String,
    pub payload_json: Option<String>,
    pub enqueued_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceRemoteRecord {
    pub table_name: String,
    pub record_key: String,
    pub remote_item_id: Option<String>,
    pub remote_etag: Option<String>,
    pub last_synced_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSyncConflict {
    pub id: i64,
    pub table_name: String,
    pub record_key: String,
    pub local_payload_json: Option<String>,
    pub remote_payload_json: Option<String>,
    pub remote_deleted: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
struct ColumnMeta {
    name: String,
    pk_rank: u32,
}

pub fn workspace_table_policy(name: &str) -> Option<WorkspaceTablePolicy> {
    if name.starts_with("workspace_") {
        return Some(WorkspaceTablePolicy::LocalOnly);
    }
    TABLE_POLICIES
        .iter()
        .find_map(|(table, policy)| (*table == name).then_some(*policy))
}

/// Indique si une table utilisateur fait partie des données partagées.
pub fn is_table_exportable(name: &str) -> bool {
    matches!(
        workspace_table_policy(name),
        Some(WorkspaceTablePolicy::Shared | WorkspaceTablePolicy::ExternalBlob)
    )
}

pub fn build_team_migration_snapshot(db: &Database) -> Result<TeamMigrationSnapshot> {
    build_team_migration_snapshot_conn(db.connection())
}

pub fn build_team_migration_preview(db: &Database) -> Result<TeamMigrationPreview> {
    let snapshot = build_team_migration_snapshot(db)?;
    let checksum_sha256 = snapshot_checksum(&snapshot);
    let total_records = snapshot.records.len();
    let table_counts = snapshot
        .table_counts
        .iter()
        .map(|(table_name, count)| TableRecordCount {
            table_name: table_name.clone(),
            count: *count,
        })
        .collect();
    let mut warnings = collect_migration_warnings(db.connection())?;
    warnings.extend(crate::workspace::migration::oversized_payload_warnings(
        &snapshot.records,
    ));
    warnings.sort();
    warnings.dedup();
    Ok(TeamMigrationPreview {
        schema_version: snapshot.schema_version,
        generated_at: snapshot.generated_at,
        table_counts,
        total_records,
        checksum_sha256,
        warnings,
    })
}

fn build_team_migration_snapshot_conn(conn: &Connection) -> Result<TeamMigrationSnapshot> {
    let mut table_counts = BTreeMap::new();
    let mut records = Vec::new();
    for table_name in list_exportable_tables(conn)? {
        let table_records = export_table_records(conn, &table_name)?;
        table_counts.insert(table_name.clone(), table_records.len());
        records.extend(table_records);
    }
    records.sort_by(|left, right| {
        left.table_name
            .cmp(&right.table_name)
            .then_with(|| left.record_key.cmp(&right.record_key))
    });
    Ok(TeamMigrationSnapshot {
        schema_version: WORKSPACE_SYNC_SCHEMA_VERSION,
        generated_at: Utc::now().to_rfc3339(),
        table_counts,
        records,
    })
}

pub fn snapshot_checksum(snapshot: &TeamMigrationSnapshot) -> String {
    // L'horodatage décrit l'exécution, pas les données : il ne doit pas rendre
    // deux aperçus identiques artificiellement différents.
    let canonical = serde_json::to_string(&serde_json::json!({
        "schemaVersion": snapshot.schema_version,
        "tableCounts": snapshot.table_counts,
        "records": snapshot.records,
    }))
    .expect("snapshot JSON serialization must succeed");
    let digest = Sha256::digest(canonical.as_bytes());
    format!("{:x}", digest)
}

fn collect_migration_warnings(conn: &Connection) -> Result<Vec<String>> {
    let mut warnings = Vec::new();
    for (table, policy) in TABLE_POLICIES {
        if matches!(
            policy,
            WorkspaceTablePolicy::Shared | WorkspaceTablePolicy::ExternalBlob
        ) {
            continue;
        }
        if !table_exists(conn, table)? {
            continue;
        }
        let count: i64 =
            conn.query_row(&format!("SELECT COUNT(*) FROM \"{table}\""), [], |row| {
                row.get(0)
            })?;
        if count > 0 {
            warnings.push(format!(
                "Table locale « {table} » ({count} ligne(s)) exclue de la migration."
            ));
        }
    }
    if table_exists(conn, "documents")? {
        let doc_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
        if doc_count > 0 {
            warnings.push(format!(
                "Documents : {doc_count} métadonnée(s) exportée(s) — les fichiers sur disque ne sont pas inclus."
            ));
        }
    }
    warnings.sort();
    Ok(warnings)
}

fn list_exportable_tables(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
         ORDER BY name COLLATE NOCASE",
    )?;
    let mut tables = Vec::new();
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for table in rows {
        let table = table?;
        let policy = workspace_table_policy(&table).ok_or_else(|| {
            rusqlite::Error::InvalidParameterName(format!(
                "Table workspace non classifiée : {table}"
            ))
        })?;
        if matches!(
            policy,
            WorkspaceTablePolicy::Shared | WorkspaceTablePolicy::ExternalBlob
        ) {
            tables.push(table);
        }
    }
    Ok(tables)
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        params![table],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn discover_columns(conn: &Connection, table: &str) -> Result<Vec<ColumnMeta>> {
    let sql = format!("PRAGMA table_info(\"{table}\")");
    let mut stmt = conn.prepare(&sql)?;
    let mut columns = Vec::new();
    let rows = stmt.query_map([], |row| {
        Ok(ColumnMeta {
            name: row.get(1)?,
            pk_rank: row.get(5)?,
        })
    })?;
    for column in rows {
        columns.push(column?);
    }
    Ok(columns)
}

fn primary_key_columns(columns: &[ColumnMeta]) -> Vec<String> {
    let mut pk: Vec<_> = columns.iter().filter(|column| column.pk_rank > 0).collect();
    pk.sort_by_key(|column| column.pk_rank);
    pk.into_iter().map(|column| column.name.clone()).collect()
}

fn export_table_records(conn: &Connection, table: &str) -> Result<Vec<SnapshotRecord>> {
    let columns = discover_columns(conn, table)?;
    if columns.is_empty() {
        return Ok(Vec::new());
    }
    let pk_columns = primary_key_columns(&columns);
    if pk_columns.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "Table partagée sans clé primaire stable : {table}"
        )));
    }
    let order_clause = pk_columns
        .iter()
        .map(|name| format!("\"{name}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let sql =
        format!("SELECT rowid AS \"__crm_rowid__\", * FROM \"{table}\" ORDER BY {order_clause}");
    let mut stmt = conn.prepare(&sql)?;
    let column_names: Vec<String> = columns.iter().map(|column| column.name.clone()).collect();
    let rows = stmt.query_map([], |row| {
        let rowid: i64 = row.get(0)?;
        let payload = export_row_as_payload(row, 1, &column_names)?;
        Ok((rowid, payload))
    })?;

    let mut records = Vec::new();
    for row_result in rows {
        let (_rowid, mut payload) = row_result?;
        if table == "documents" {
            sanitize_document_payload(&mut payload)?;
        }
        let record_key = canonical_record_key_from_payload(&payload, &pk_columns)?;
        records.push(SnapshotRecord {
            table_name: table.to_string(),
            record_key,
            payload,
        });
    }
    Ok(records)
}

fn sanitize_document_payload(payload: &mut Map<String, Value>) -> Result<()> {
    let document_id = payload
        .get("id")
        .and_then(|cell| cell.get("value"))
        .and_then(Value::as_i64)
        .ok_or_else(|| {
            rusqlite::Error::InvalidParameterName("Document sans identifiant stable".into())
        })?;
    payload.insert(
        "chemin_fichier".into(),
        serde_json::json!({
            "kind": "text",
            "value": crate::workspace::documents::logical_document_uri(document_id)
        }),
    );
    Ok(())
}

fn export_row_as_payload(
    row: &Row<'_>,
    offset: usize,
    column_names: &[String],
) -> Result<Map<String, Value>> {
    let mut payload = Map::new();
    for (index, name) in column_names.iter().enumerate() {
        let value_ref = row.get_ref(offset + index)?;
        payload.insert(name.clone(), typed_cell_json(value_ref));
    }
    Ok(payload)
}

fn typed_cell_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => serde_json::json!({ "kind": "null" }),
        ValueRef::Integer(value) => serde_json::json!({ "kind": "integer", "value": value }),
        ValueRef::Real(value) => serde_json::json!({ "kind": "real", "value": value }),
        ValueRef::Text(value) => {
            let text = std::str::from_utf8(value).unwrap_or("");
            serde_json::json!({ "kind": "text", "value": text })
        }
        ValueRef::Blob(value) => {
            let encoded = BASE64.encode(value);
            serde_json::json!({ "kind": "blob", "value": encoded })
        }
    }
}

fn canonical_record_key_from_payload(
    payload: &Map<String, Value>,
    pk_columns: &[String],
) -> Result<String> {
    let mut parts = Vec::with_capacity(pk_columns.len());
    for pk_name in pk_columns {
        let cell = payload.get(pk_name).ok_or_else(|| {
            rusqlite::Error::InvalidParameterName(format!(
                "PK column missing in payload: {pk_name}"
            ))
        })?;
        parts.push(serde_json::json!({
            "column": pk_name,
            "kind": cell.get("kind").and_then(Value::as_str).unwrap_or("null"),
            "value": cell.get("value").cloned().unwrap_or(Value::Null),
        }));
    }
    serde_json::to_string(&parts).map_err(|error| {
        rusqlite::Error::InvalidParameterName(format!("PK JSON serialize error: {error}"))
    })
}

impl Database {
    pub fn workspace_sync_reset_for_rebuild(&self) -> Result<()> {
        self.conn.execute_batch(
            "BEGIN IMMEDIATE;
             DELETE FROM workspace_sync_queue;
             DELETE FROM workspace_remote_records;
             DELETE FROM workspace_sync_state;
             DELETE FROM workspace_inbound_stage;
             DELETE FROM workspace_conflicts;
             DELETE FROM workspace_id_blocks;
             DELETE FROM workspace_blob_queue;
             COMMIT;",
        )
    }

    pub(crate) fn migrate_workspace_sync_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workspace_remote_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                record_key TEXT NOT NULL,
                remote_item_id TEXT,
                remote_etag TEXT,
                last_synced_at INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                UNIQUE(table_name, record_key)
            );
            CREATE INDEX IF NOT EXISTS workspace_remote_records_table_idx
                ON workspace_remote_records (table_name);

            CREATE TABLE IF NOT EXISTS workspace_sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                record_key TEXT NOT NULL,
                operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
                payload_json TEXT,
                enqueued_at INTEGER NOT NULL DEFAULT (unixepoch()),
                synced_at INTEGER,
                error_message TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS workspace_sync_queue_pending_unique
                ON workspace_sync_queue (table_name, record_key)
                WHERE synced_at IS NULL;
            CREATE INDEX IF NOT EXISTS workspace_sync_queue_pending_idx
                ON workspace_sync_queue (synced_at, enqueued_at);

            CREATE TABLE IF NOT EXISTS workspace_sync_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            );",
        )?;
        Ok(())
    }

    #[cfg(test)]
    pub fn workspace_sync_enqueue(
        &self,
        table_name: &str,
        record_key: &str,
        operation: &str,
        payload_json: Option<&str>,
    ) -> Result<i64> {
        if operation != "upsert" && operation != "delete" {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "operation sync invalide: {operation}"
            )));
        }
        self.conn.execute(
            "INSERT INTO workspace_sync_queue
                (table_name, record_key, operation, payload_json, enqueued_at, revision, synced_at, error_message)
             VALUES (
                ?1, ?2, ?3, ?4, unixepoch(),
                COALESCE((
                    SELECT MAX(revision) + 1 FROM workspace_sync_queue
                    WHERE table_name = ?1 AND record_key = ?2
                ), 1),
                NULL, NULL
             )
             ON CONFLICT(table_name, record_key) WHERE synced_at IS NULL DO UPDATE SET
                operation = excluded.operation,
                payload_json = excluded.payload_json,
                enqueued_at = excluded.enqueued_at,
                revision = workspace_sync_queue.revision + 1,
                error_message = NULL",
            params![table_name, record_key, operation, payload_json],
        )?;
        self.conn.query_row(
            "SELECT id FROM workspace_sync_queue
             WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL",
            params![table_name, record_key],
            |row| row.get(0),
        )
    }

    #[cfg(test)]
    pub fn workspace_sync_mark_synced(&self, queue_id: i64, revision: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE workspace_sync_queue
             SET synced_at = unixepoch(), error_message = NULL
             WHERE id = ?1 AND revision = ?2 AND synced_at IS NULL",
            params![queue_id, revision],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn workspace_sync_list_pending(&self) -> Result<Vec<WorkspaceSyncQueueItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, revision, table_name, record_key, operation, payload_json, enqueued_at
             FROM workspace_sync_queue
             WHERE synced_at IS NULL
             ORDER BY enqueued_at ASC, id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(WorkspaceSyncQueueItem {
                id: row.get(0)?,
                revision: row.get(1)?,
                table_name: row.get(2)?,
                record_key: row.get(3)?,
                operation: row.get(4)?,
                payload_json: row.get(5)?,
                enqueued_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn workspace_sync_upsert_remote_mapping(
        &self,
        table_name: &str,
        record_key: &str,
        remote_item_id: &str,
        remote_etag: &str,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO workspace_remote_records
                (table_name, record_key, remote_item_id, remote_etag, last_synced_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())
             ON CONFLICT(table_name, record_key) DO UPDATE SET
                remote_item_id = excluded.remote_item_id,
                remote_etag = excluded.remote_etag,
                last_synced_at = excluded.last_synced_at,
                updated_at = excluded.updated_at",
            params![table_name, record_key, remote_item_id, remote_etag],
        )?;
        Ok(())
    }

    pub fn workspace_sync_complete_push(
        &self,
        queue_item: &WorkspaceSyncQueueItem,
        remote_item_id: &str,
        remote_etag: &str,
    ) -> Result<bool> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO workspace_remote_records
                (table_name, record_key, remote_item_id, remote_etag, last_synced_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())
             ON CONFLICT(table_name, record_key) DO UPDATE SET
                remote_item_id = excluded.remote_item_id,
                remote_etag = excluded.remote_etag,
                last_synced_at = excluded.last_synced_at,
                updated_at = excluded.updated_at",
            params![
                &queue_item.table_name,
                &queue_item.record_key,
                remote_item_id,
                remote_etag
            ],
        )?;
        let acknowledged = tx.execute(
            "UPDATE workspace_sync_queue
             SET synced_at = unixepoch(), error_message = NULL
             WHERE id = ?1 AND revision = ?2 AND synced_at IS NULL",
            params![queue_item.id, queue_item.revision],
        )? == 1;
        tx.commit()?;
        Ok(acknowledged)
    }

    pub fn workspace_sync_get_remote_mapping(
        &self,
        table_name: &str,
        record_key: &str,
    ) -> Result<Option<WorkspaceRemoteRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT table_name, record_key, remote_item_id, remote_etag, last_synced_at
             FROM workspace_remote_records
             WHERE table_name = ?1 AND record_key = ?2",
        )?;
        let mut rows = stmt.query_map(params![table_name, record_key], |row| {
            Ok(WorkspaceRemoteRecord {
                table_name: row.get(0)?,
                record_key: row.get(1)?,
                remote_item_id: row.get(2)?,
                remote_etag: row.get(3)?,
                last_synced_at: row.get(4)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn workspace_sync_get_remote_mapping_by_item_id(
        &self,
        remote_item_id: &str,
    ) -> Result<Option<WorkspaceRemoteRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT table_name, record_key, remote_item_id, remote_etag, last_synced_at
             FROM workspace_remote_records
             WHERE remote_item_id = ?1",
        )?;
        let mut rows = stmt.query_map(params![remote_item_id], |row| {
            Ok(WorkspaceRemoteRecord {
                table_name: row.get(0)?,
                record_key: row.get(1)?,
                remote_item_id: row.get(2)?,
                remote_etag: row.get(3)?,
                last_synced_at: row.get(4)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn workspace_sync_get_state(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM workspace_sync_state WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn workspace_sync_has_open_conflict(
        &self,
        table_name: &str,
        record_key: &str,
    ) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workspace_conflicts
             WHERE table_name = ?1 AND record_key = ?2 AND status = 'open'",
            params![table_name, record_key],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn workspace_sync_open_conflict_count(&self) -> Result<usize> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workspace_conflicts WHERE status = 'open'",
            [],
            |row| row.get(0),
        )?;
        usize::try_from(count).map_err(|_| {
            rusqlite::Error::InvalidParameterName("Nombre de conflits hors limites".into())
        })
    }

    pub fn workspace_sync_list_open_conflicts(&self) -> Result<Vec<WorkspaceSyncConflict>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, table_name, record_key, local_payload_json,
                    remote_payload_json, remote_deleted, created_at
             FROM workspace_conflicts
             WHERE status = 'open'
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(WorkspaceSyncConflict {
                id: row.get(0)?,
                table_name: row.get(1)?,
                record_key: row.get(2)?,
                local_payload_json: row.get(3)?,
                remote_payload_json: row.get(4)?,
                remote_deleted: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn workspace_sync_resolve_conflict_keep_local(&self, conflict_id: i64) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        let (table_name, record_key, remote_etag, remote_deleted): (
            String,
            String,
            Option<String>,
            bool,
        ) = tx.query_row(
            "SELECT table_name, record_key, remote_etag, remote_deleted
                 FROM workspace_conflicts
                 WHERE id = ?1 AND status = 'open'",
            params![conflict_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        if remote_deleted {
            tx.execute(
                "DELETE FROM workspace_remote_records
                 WHERE table_name = ?1 AND record_key = ?2",
                params![table_name, record_key],
            )?;
            tx.execute(
                "UPDATE workspace_sync_queue
                 SET synced_at = unixepoch(), error_message = NULL
                 WHERE table_name = ?1 AND record_key = ?2
                   AND operation = 'delete' AND synced_at IS NULL",
                params![table_name, record_key],
            )?;
        } else if let Some(remote_etag) = remote_etag {
            tx.execute(
                "UPDATE workspace_remote_records
                 SET remote_etag = ?3, updated_at = unixepoch()
                 WHERE table_name = ?1 AND record_key = ?2",
                params![table_name, record_key, remote_etag],
            )?;
        }
        let updated = tx.execute(
            "UPDATE workspace_conflicts
             SET status = 'resolved_keep_local', resolved_at = unixepoch()
             WHERE id = ?1 AND status = 'open'",
            params![conflict_id],
        )?;
        if updated != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        tx.commit()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::workspace::{WorkspaceConfig, WORKSPACE_CONFIG_SETTING_KEY};
    use crate::workspace::mode::WorkspaceMode;
    use crate::workspace::team::TeamRole;

    fn test_db() -> Database {
        Database::open_in_memory_for_tests().expect("in-memory db")
    }

    fn seed_core_fixtures(db: &Database) -> rusqlite::Result<()> {
        db.connection().execute_batch(
            "INSERT INTO foyers (nom, type_foyer) VALUES ('FOYER TEST', 'COUPLE');
             INSERT INTO contacts (nom, prenom, categorie, foyer_id)
               VALUES ('DUPONT', 'Jean', 'CLIENT', 1);
             INSERT INTO taches (contact_id, titre, priorite, statut)
               VALUES (1, 'Relance patrimoine', 'NORMALE', 'A_FAIRE');
             INSERT INTO interactions (contact_id, type_interaction, date_interaction)
               VALUES (1, 'APPEL', 1_704_067_200);
             INSERT INTO investissements (contact_id, type_produit, nom_produit)
               VALUES (1, 'SCPI', 'SCPI Exemple');
             INSERT INTO settings (key, value, updated_at)
               VALUES ('mistral_api_key', 'secret-token', 1);
             INSERT INTO contact_gmail_messages (
               contact_id, gmail_message_id, gmail_thread_id, direction, subject, snippet, sent_at
             ) VALUES (1, 'msg-1', 'thread-1', 'IN', 'Sujet', 'Extrait', 1);",
        )
    }

    #[test]
    fn rebuild_reset_clears_sync_metadata_but_preserves_local_settings() {
        let db = test_db();
        db.set_setting("ui_preference", "compact").unwrap();
        db.workspace_sync_enqueue("contacts", "1", "upsert", Some("{}"))
            .unwrap();
        db.connection()
            .execute(
                "INSERT INTO workspace_sync_state (key, value) VALUES ('crm_data_delta_link', 'delta-old')",
                [],
            )
            .unwrap();

        db.workspace_sync_reset_for_rebuild().unwrap();

        assert!(db.workspace_sync_list_pending().unwrap().is_empty());
        assert_eq!(
            db.workspace_sync_get_state("crm_data_delta_link").unwrap(),
            None
        );
        assert_eq!(
            db.get_setting("ui_preference").unwrap().as_deref(),
            Some("compact")
        );
    }

    #[test]
    fn is_table_exportable_excludes_internal_and_workspace_tables() {
        assert!(!is_table_exportable("sqlite_master"));
        assert!(!is_table_exportable("settings"));
        assert!(!is_table_exportable("workspace_sync_queue"));
        assert!(is_table_exportable("contacts"));
        assert!(is_table_exportable("email_send_log"));
    }

    #[test]
    fn every_application_table_has_an_explicit_workspace_policy() {
        let db = test_db();
        let mut stmt = db
            .connection()
            .prepare(
                "SELECT name FROM sqlite_master
                 WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                 ORDER BY name",
            )
            .unwrap();
        let tables = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>>>()
            .unwrap();
        let unclassified = tables
            .into_iter()
            .filter(|table| workspace_table_policy(table).is_none())
            .collect::<Vec<_>>();
        assert!(
            unclassified.is_empty(),
            "Tables workspace non classifiées : {unclassified:?}"
        );
    }

    #[test]
    fn snapshot_exports_core_entities_without_secrets_or_caches() {
        let db = test_db();
        seed_core_fixtures(&db).unwrap();

        let snapshot = build_team_migration_snapshot(&db).unwrap();
        let exported_tables: Vec<_> = snapshot.table_counts.keys().cloned().collect();

        assert!(exported_tables.contains(&"contacts".to_string()));
        assert!(exported_tables.contains(&"foyers".to_string()));
        assert!(exported_tables.contains(&"taches".to_string()));
        assert!(exported_tables.contains(&"interactions".to_string()));
        assert!(exported_tables.contains(&"investissements".to_string()));
        assert!(!exported_tables.contains(&"settings".to_string()));
        assert!(!exported_tables.contains(&"contact_gmail_messages".to_string()));
        assert!(!exported_tables.contains(&"workspace_sync_queue".to_string()));

        let contact = snapshot
            .records
            .iter()
            .find(|record| record.table_name == "contacts")
            .expect("contact row exported");
        assert!(contact.record_key.contains("\"column\":\"id\""));
        assert_eq!(
            contact.payload.get("nom").and_then(Value::as_object),
            Some(
                &serde_json::json!({ "kind": "text", "value": "DUPONT" })
                    .as_object()
                    .unwrap()
                    .clone()
            )
        );
        assert_eq!(
            contact.payload.get("foyer_id").and_then(Value::as_object),
            Some(
                &serde_json::json!({ "kind": "integer", "value": 1 })
                    .as_object()
                    .unwrap()
                    .clone()
            )
        );
    }

    #[test]
    fn snapshot_order_is_deterministic() {
        let db = test_db();
        seed_core_fixtures(&db).unwrap();
        let first = build_team_migration_snapshot(&db).unwrap();
        let second = build_team_migration_snapshot(&db).unwrap();
        assert_eq!(first.records, second.records);
        assert_eq!(first.table_counts, second.table_counts);
        assert_eq!(snapshot_checksum(&first), snapshot_checksum(&second));
    }

    #[test]
    fn preview_includes_checksum_and_warnings_without_records() {
        let db = test_db();
        seed_core_fixtures(&db).unwrap();
        let preview = build_team_migration_preview(&db).unwrap();
        assert_eq!(preview.schema_version, WORKSPACE_SYNC_SCHEMA_VERSION);
        assert!(!preview.checksum_sha256.is_empty());
        assert!(preview.total_records > 0);
        assert!(preview
            .warnings
            .iter()
            .any(|warning| warning.contains("settings")));
        assert!(preview
            .warnings
            .iter()
            .any(|warning| warning.contains("contact_gmail_messages")));
    }

    #[test]
    fn sync_queue_enqueue_mark_and_remote_mapping() {
        let db = test_db();
        db.workspace_sync_enqueue("contacts", "1", "upsert", Some(r#"{"id":1}"#))
            .unwrap();
        let pending = db.workspace_sync_list_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].operation, "upsert");

        db.workspace_sync_upsert_remote_mapping("contacts", "1", "sp-item-1", "etag-1")
            .unwrap();
        let mapping = db
            .workspace_sync_get_remote_mapping("contacts", "1")
            .unwrap()
            .expect("mapping");
        assert_eq!(mapping.remote_item_id.as_deref(), Some("sp-item-1"));
        assert_eq!(mapping.remote_etag.as_deref(), Some("etag-1"));

        db.workspace_sync_mark_synced(pending[0].id, pending[0].revision)
            .unwrap();
        assert!(db.workspace_sync_list_pending().unwrap().is_empty());
    }

    #[test]
    fn sync_queue_replaces_pending_item_for_same_record() {
        let db = test_db();
        db.workspace_sync_enqueue("contacts", "42", "upsert", Some(r#"{"v":1}"#))
            .unwrap();
        db.workspace_sync_enqueue("contacts", "42", "delete", None)
            .unwrap();
        let pending = db.workspace_sync_list_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].operation, "delete");
        assert_eq!(pending[0].revision, 2);
    }

    #[test]
    fn stale_sync_ack_does_not_erase_a_newer_local_mutation() {
        let db = test_db();
        db.workspace_sync_enqueue("contacts", "42", "upsert", Some(r#"{"v":1}"#))
            .unwrap();
        let first = db.workspace_sync_list_pending().unwrap().remove(0);

        db.workspace_sync_enqueue("contacts", "42", "upsert", Some(r#"{"v":2}"#))
            .unwrap();
        assert!(db
            .workspace_sync_mark_synced(first.id, first.revision)
            .is_err());

        let pending = db.workspace_sync_list_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].revision, first.revision + 1);
        assert_eq!(pending[0].payload_json.as_deref(), Some(r#"{"v":2}"#));
    }

    #[test]
    fn resolving_conflict_keeps_queue_and_advances_mapping_etag() {
        let db = test_db();
        db.workspace_sync_enqueue("contacts", "42", "upsert", Some(r#"{"v":2}"#))
            .unwrap();
        db.workspace_sync_upsert_remote_mapping("contacts", "42", "sp-42", "\"1\"")
            .unwrap();
        db.workspace_sync_record_push_conflict(
            "contacts",
            "42",
            "sp-42",
            Some(r#"{"v":3}"#),
            Some("\"2\""),
            false,
        )
        .unwrap();
        let conflict = db.workspace_sync_list_open_conflicts().unwrap().remove(0);

        db.workspace_sync_resolve_conflict_keep_local(conflict.id)
            .unwrap();

        assert!(db.workspace_sync_list_open_conflicts().unwrap().is_empty());
        assert_eq!(db.workspace_sync_list_pending().unwrap().len(), 1);
        let mapping = db
            .workspace_sync_get_remote_mapping("contacts", "42")
            .unwrap()
            .unwrap();
        assert_eq!(mapping.remote_etag.as_deref(), Some("\"2\""));
    }

    #[test]
    fn keeping_local_after_remote_delete_recreates_only_local_upserts() {
        let upsert_db = test_db();
        upsert_db
            .workspace_sync_enqueue("contacts", "42", "upsert", Some(r#"{"v":2}"#))
            .unwrap();
        upsert_db
            .workspace_sync_upsert_remote_mapping("contacts", "42", "sp-42", "\"1\"")
            .unwrap();
        upsert_db
            .workspace_sync_record_push_conflict(
                "contacts",
                "42",
                "sp-42",
                None,
                Some("\"2\""),
                true,
            )
            .unwrap();
        let conflict_id = upsert_db
            .workspace_sync_list_open_conflicts()
            .unwrap()
            .remove(0)
            .id;
        upsert_db
            .workspace_sync_resolve_conflict_keep_local(conflict_id)
            .unwrap();
        assert!(upsert_db
            .workspace_sync_get_remote_mapping("contacts", "42")
            .unwrap()
            .is_none());
        assert_eq!(upsert_db.workspace_sync_list_pending().unwrap().len(), 1);

        let delete_db = test_db();
        delete_db
            .workspace_sync_enqueue("contacts", "42", "delete", None)
            .unwrap();
        delete_db
            .workspace_sync_record_push_conflict(
                "contacts",
                "42",
                "sp-42",
                None,
                Some("\"2\""),
                true,
            )
            .unwrap();
        let conflict_id = delete_db
            .workspace_sync_list_open_conflicts()
            .unwrap()
            .remove(0)
            .id;
        delete_db
            .workspace_sync_resolve_conflict_keep_local(conflict_id)
            .unwrap();
        assert!(delete_db.workspace_sync_list_pending().unwrap().is_empty());
    }

    #[test]
    fn workspace_sync_tables_are_created_on_init() {
        let db = test_db();
        let count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table'
                   AND name IN ('workspace_remote_records', 'workspace_sync_queue', 'workspace_sync_state')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn workspace_config_setting_is_not_exported_via_contacts_snapshot() {
        let db = test_db();
        let team = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            site_id: Some("site-123".into()),
            site_name: None,
            office_mailbox_email: None,
            ..Default::default()
        };
        db.save_workspace_config(&team).unwrap();
        assert!(db
            .get_setting(WORKSPACE_CONFIG_SETTING_KEY)
            .unwrap()
            .is_some());

        let snapshot = build_team_migration_snapshot(&db).unwrap();
        assert!(!snapshot.table_counts.contains_key("settings"));
    }
}
