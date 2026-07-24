//! Export déterministe SQLite → JSON et file d'attente sync workspace (mode équipe).
//! Lecture seule pour les snapshots de migration — aucun apply/import dans ce jalon.

use super::Database;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use rusqlite::{params, Connection, Result, Row};
use rusqlite::types::ValueRef;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const WORKSPACE_SYNC_SCHEMA_VERSION: u32 = 1;

/// Tables explicitement exclues de l'export (settings, caches, secrets locaux).
const EXCLUDED_TABLES: &[&str] = &[
    "settings",
    "contact_gmail_messages",
    "contact_mail_sync_state",
    "shared_notes_cache",
    "shared_note_contributions_cache",
    "email_send_log",
    "google_contact_name_proposal_dismissals",
    "contact_etiquette_auto_log",
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

#[derive(Debug, Clone)]
struct ColumnMeta {
    name: String,
    pk_rank: u32,
}

/// Indique si une table utilisateur peut être exportée vers SharePoint.
pub fn is_table_exportable(name: &str) -> bool {
    if name.starts_with("sqlite_") {
        return false;
    }
    if name.starts_with("workspace_") {
        return false;
    }
    !EXCLUDED_TABLES.contains(&name)
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
    for table in EXCLUDED_TABLES {
        if !table_exists(conn, table)? {
            continue;
        }
        let count: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM \"{table}\""),
            [],
            |row| row.get(0),
        )?;
        if count > 0 {
            warnings.push(format!(
                "Table locale « {table} » ({count} ligne(s)) exclue de la migration."
            ));
        }
    }
    if table_exists(conn, "documents")? {
        let doc_count: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |row| {
            row.get(0)
        })?;
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
        if is_table_exportable(&table) {
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
    let mut pk: Vec<_> = columns
        .iter()
        .filter(|column| column.pk_rank > 0)
        .collect();
    pk.sort_by_key(|column| column.pk_rank);
    pk.into_iter().map(|column| column.name.clone()).collect()
}

fn export_table_records(conn: &Connection, table: &str) -> Result<Vec<SnapshotRecord>> {
    let columns = discover_columns(conn, table)?;
    if columns.is_empty() {
        return Ok(Vec::new());
    }
    let pk_columns = primary_key_columns(&columns);
    let order_clause = if pk_columns.is_empty() {
        "rowid".to_string()
    } else {
        pk_columns
            .iter()
            .map(|name| format!("\"{name}\""))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let sql = format!(
        "SELECT rowid AS \"__crm_rowid__\", * FROM \"{table}\" ORDER BY {order_clause}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let column_names: Vec<String> = columns.iter().map(|column| column.name.clone()).collect();
    let rows = stmt.query_map([], |row| {
        let rowid: i64 = row.get(0)?;
        let payload = export_row_as_payload(row, 1, &column_names)?;
        Ok((rowid, payload))
    })?;

    let mut records = Vec::new();
    for row_result in rows {
        let (rowid, payload) = row_result?;
        let record_key = if pk_columns.is_empty() {
            format!("rowid:{rowid}")
        } else {
            canonical_record_key_from_payload(&payload, &pk_columns)?
        };
        records.push(SnapshotRecord {
            table_name: table.to_string(),
            record_key,
            payload,
        });
    }
    Ok(records)
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
            rusqlite::Error::InvalidParameterName(format!("PK column missing in payload: {pk_name}"))
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
            "DELETE FROM workspace_sync_queue
             WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL",
            params![table_name, record_key],
        )?;
        self.conn.execute(
            "INSERT INTO workspace_sync_queue (table_name, record_key, operation, payload_json)
             VALUES (?1, ?2, ?3, ?4)",
            params![table_name, record_key, operation, payload_json],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn workspace_sync_mark_synced(&self, queue_id: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE workspace_sync_queue
             SET synced_at = unixepoch(), error_message = NULL
             WHERE id = ?1 AND synced_at IS NULL",
            params![queue_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn workspace_sync_list_pending(&self) -> Result<Vec<WorkspaceSyncQueueItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, table_name, record_key, operation, payload_json, enqueued_at
             FROM workspace_sync_queue
             WHERE synced_at IS NULL
             ORDER BY enqueued_at ASC, id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(WorkspaceSyncQueueItem {
                id: row.get(0)?,
                table_name: row.get(1)?,
                record_key: row.get(2)?,
                operation: row.get(3)?,
                payload_json: row.get(4)?,
                enqueued_at: row.get(5)?,
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
    fn is_table_exportable_excludes_internal_and_workspace_tables() {
        assert!(!is_table_exportable("sqlite_master"));
        assert!(!is_table_exportable("settings"));
        assert!(!is_table_exportable("workspace_sync_queue"));
        assert!(is_table_exportable("contacts"));
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

        db.workspace_sync_mark_synced(pending[0].id).unwrap();
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
