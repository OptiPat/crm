//! Restauration strictement en mémoire d'un snapshot migration (validation seule, sans disque).

use super::workspace_sync::{
    build_team_migration_snapshot, is_table_exportable, snapshot_checksum, SnapshotRecord,
    TeamMigrationSnapshot, WORKSPACE_SYNC_SCHEMA_VERSION,
};
use super::Database;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::{params_from_iter, types::Value as SqlValue, Connection, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRestoreValidationResult {
    pub valid: bool,
    pub checksum: String,
    pub expected_checksum: String,
    pub checksum_match: bool,
    pub table_counts: BTreeMap<String, usize>,
    pub total_records: usize,
    pub foreign_key_ok: bool,
    pub integrity_ok: bool,
    pub errors: Vec<String>,
}

struct SchemaCache {
    tables: HashMap<String, HashSet<String>>,
}

impl SchemaCache {
    fn build(conn: &Connection) -> Result<Self> {
        let mut tables = HashMap::new();
        let mut stmt = conn.prepare(
            "SELECT name FROM sqlite_master
             WHERE type = 'table'
               AND name NOT LIKE 'sqlite_%'
             ORDER BY name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for table in rows {
            let table = table?;
            if !is_table_exportable(&table) {
                continue;
            }
            let columns = discover_table_columns(conn, &table)?;
            tables.insert(table, columns);
        }
        Ok(Self { tables })
    }

    fn validate_record(&self, record: &SnapshotRecord) -> Result<(), String> {
        let Some(columns) = self.tables.get(&record.table_name) else {
            return Err(format!(
                "Table inconnue ou non exportable : « {} ».",
                record.table_name
            ));
        };
        for column_name in record.payload.keys() {
            if !columns.contains(column_name) {
                return Err(format!(
                    "Colonne inconnue « {column_name} » dans la table « {} ».",
                    record.table_name
                ));
            }
        }
        Ok(())
    }
}

fn discover_table_columns(conn: &Connection, table: &str) -> Result<HashSet<String>> {
    let sql = format!("PRAGMA table_info(\"{table}\")");
    let mut stmt = conn.prepare(&sql)?;
    let mut columns = HashSet::new();
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for column in rows {
        columns.insert(column?);
    }
    Ok(columns)
}

fn table_has_primary_key(conn: &Connection, table: &str) -> Result<bool> {
    let sql = format!("PRAGMA table_info(\"{table}\")");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, u32>(5))?;
    for pk_rank in rows {
        if pk_rank? > 0 {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn decode_typed_cell_json(cell: &Value) -> Result<SqlValue, String> {
    let kind = cell
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| "Cellule typée sans champ « kind ».".to_string())?;
    match kind {
        "null" => Ok(SqlValue::Null),
        "integer" => {
            let value = cell
                .get("value")
                .and_then(Value::as_i64)
                .ok_or_else(|| "Cellule integer sans valeur.".to_string())?;
            Ok(SqlValue::Integer(value))
        }
        "real" => {
            let value = cell
                .get("value")
                .and_then(Value::as_f64)
                .ok_or_else(|| "Cellule real sans valeur.".to_string())?;
            Ok(SqlValue::Real(value))
        }
        "text" => {
            let value = cell
                .get("value")
                .and_then(Value::as_str)
                .ok_or_else(|| "Cellule text sans valeur.".to_string())?;
            Ok(SqlValue::Text(value.to_string()))
        }
        "blob" => {
            let encoded = cell
                .get("value")
                .and_then(Value::as_str)
                .ok_or_else(|| "Cellule blob sans valeur base64.".to_string())?;
            let bytes = BASE64
                .decode(encoded.as_bytes())
                .map_err(|error| format!("Blob base64 invalide : {error}"))?;
            Ok(SqlValue::Blob(bytes))
        }
        other => Err(format!("Kind de cellule inconnu : {other}.")),
    }
}

fn parse_rowid_record_key(record_key: &str) -> Option<i64> {
    record_key
        .strip_prefix("rowid:")
        .and_then(|value| value.parse::<i64>().ok())
}

fn insert_snapshot_record(
    conn: &Connection,
    schema: &SchemaCache,
    record: &SnapshotRecord,
) -> Result<(), String> {
    schema.validate_record(record)?;

    let mut column_names: Vec<String> = record.payload.keys().cloned().collect();
    column_names.sort_unstable();

    let mut values = Vec::with_capacity(column_names.len());
    for column_name in &column_names {
        let cell = record.payload.get(column_name).ok_or_else(|| {
            format!("Colonne « {column_name} » absente du payload.")
        })?;
        values.push(decode_typed_cell_json(cell)?);
    }

    if !table_has_primary_key(conn, &record.table_name)
        .map_err(|error| format!("PRAGMA table_info : {error}"))?
        && parse_rowid_record_key(&record.record_key).is_some()
    {
        let rowid = parse_rowid_record_key(&record.record_key)
            .ok_or_else(|| format!("Clé rowid invalide : {}", record.record_key))?;
        let quoted_columns = column_names
            .iter()
            .map(|name| format!("\"{name}\""))
            .collect::<Vec<_>>()
            .join(", ");
        let placeholders = (2..=column_names.len() + 1)
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO \"{}\" (rowid, {quoted_columns}) VALUES (?1, {placeholders})",
            record.table_name
        );
        let mut params: Vec<SqlValue> = Vec::with_capacity(values.len() + 1);
        params.push(SqlValue::Integer(rowid));
        params.extend(values);
        conn.execute(&sql, params_from_iter(params))
            .map_err(|error| {
                format!(
                    "Insertion « {} » / {} : {error}",
                    record.table_name, record.record_key
                )
            })?;
        return Ok(());
    }

    if !table_has_primary_key(conn, &record.table_name)
        .map_err(|error| format!("PRAGMA table_info : {error}"))?
        && !record.record_key.starts_with("rowid:")
    {
        return Err(format!(
            "Table sans PK « {} » : clé rowid:N attendue, reçu {}.",
            record.table_name, record.record_key
        ));
    }

    let quoted_columns = column_names
        .iter()
        .map(|name| format!("\"{name}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=column_names.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT INTO \"{}\" ({quoted_columns}) VALUES ({placeholders})",
        record.table_name
    );
    conn.execute(&sql, params_from_iter(values)).map_err(|error| {
        format!(
            "Insertion « {} » / {} : {error}",
            record.table_name, record.record_key
        )
    })?;
    Ok(())
}

fn foreign_key_violations(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("PRAGMA foreign_key_check")?;
    let rows = stmt.query_map([], |row| {
        let table: String = row.get(0)?;
        let rowid: i64 = row.get(1)?;
        let parent: String = row.get(2)?;
        let fkid: i64 = row.get(3)?;
        Ok(format!(
            "{table} rowid={rowid} → {parent} rowid={fkid}"
        ))
    })?;
    rows.collect()
}

fn integrity_check_message(conn: &Connection) -> Result<String> {
    let message: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    Ok(message)
}

fn count_exportable_tables(conn: &Connection) -> Result<BTreeMap<String, usize>> {
    let cache = SchemaCache::build(conn)?;
    let mut counts = BTreeMap::new();
    for table in cache.tables.keys() {
        let sql = format!("SELECT COUNT(*) FROM \"{table}\"");
        let count: i64 = conn.query_row(&sql, [], |row| row.get(0))?;
        counts.insert(table.clone(), count as usize);
    }
    Ok(counts)
}

fn clear_exportable_table_rows(conn: &Connection) -> Result<(), String> {
    let cache = SchemaCache::build(conn).map_err(|error| format!("Cache schéma : {error}"))?;
    for table in cache.tables.keys() {
        let sql = format!("DELETE FROM \"{table}\"");
        conn.execute(&sql, [])
            .map_err(|error| format!("Vidage table « {table} » : {error}"))?;
    }
    Ok(())
}

/// Comptages exportables alignés sur l'export local (tables vides incluses).
pub fn table_counts_for_snapshot_records(
    conn: &Connection,
    records: &[SnapshotRecord],
) -> Result<BTreeMap<String, usize>, String> {
    let cache = SchemaCache::build(conn).map_err(|error| format!("Cache schéma : {error}"))?;
    let mut counts: BTreeMap<String, usize> = cache
        .tables
        .keys()
        .map(|table| (table.clone(), 0))
        .collect();
    for record in records {
        *counts.entry(record.table_name.clone()).or_insert(0) += 1;
    }
    Ok(counts)
}

pub fn restore_snapshot_into_database(
    db: &Database,
    snapshot: &TeamMigrationSnapshot,
) -> Result<(), String> {
    if snapshot.schema_version != WORKSPACE_SYNC_SCHEMA_VERSION {
        return Err(format!(
            "Version de schéma snapshot incompatible (attendu v{WORKSPACE_SYNC_SCHEMA_VERSION}, reçu v{}).",
            snapshot.schema_version
        ));
    }
    let conn = db.connection();
    let normalized_counts = table_counts_for_snapshot_records(conn, &snapshot.records)?;
    if normalized_counts != snapshot.table_counts {
        return Err("Comptages du snapshot distant incohérents.".into());
    }
    conn.execute("PRAGMA foreign_keys = OFF", [])
        .map_err(|error| format!("PRAGMA foreign_keys OFF : {error}"))?;
    let restore_result = (|| {
        db.begin_import_transaction()
            .map_err(|error| format!("Transaction reconstruction : {error}"))?;
        let schema =
            SchemaCache::build(conn).map_err(|error| format!("Cache schéma : {error}"))?;
        if let Err(error) = clear_exportable_table_rows(conn) {
            let _ = db.rollback_import_transaction();
            return Err(error);
        }
        for record in &snapshot.records {
            if let Err(error) = insert_snapshot_record(conn, &schema, record) {
                let _ = db.rollback_import_transaction();
                return Err(error);
            }
        }
        db.commit_import_transaction()
            .map_err(|error| format!("Commit reconstruction : {error}"))
    })();
    let foreign_keys_result = conn
        .execute("PRAGMA foreign_keys = ON", [])
        .map_err(|error| format!("PRAGMA foreign_keys ON : {error}"));
    restore_result?;
    foreign_keys_result?;
    let violations = foreign_key_violations(conn)
        .map_err(|error| format!("PRAGMA foreign_key_check : {error}"))?;
    if !violations.is_empty() {
        return Err(format!(
            "Clés étrangères invalides après reconstruction : {}",
            violations.join("; ")
        ));
    }
    let integrity =
        integrity_check_message(conn).map_err(|error| format!("PRAGMA integrity_check : {error}"))?;
    if !integrity.eq_ignore_ascii_case("ok") {
        return Err(format!(
            "Intégrité SQLite invalide après reconstruction : {integrity}"
        ));
    }
    Ok(())
}

pub fn validate_snapshot_in_memory(
    snapshot: &TeamMigrationSnapshot,
    expected_checksum: &str,
) -> WorkspaceRestoreValidationResult {
    let mut errors = Vec::new();
    let expected = expected_checksum.trim().to_string();
    let snapshot_checksum_value = snapshot_checksum(snapshot);
    let checksum_match = expected == snapshot_checksum_value;

    if snapshot.schema_version != WORKSPACE_SYNC_SCHEMA_VERSION {
        errors.push(format!(
            "Version de schéma snapshot incompatible (attendu v{WORKSPACE_SYNC_SCHEMA_VERSION}, reçu v{}).",
            snapshot.schema_version
        ));
    }
    if !checksum_match {
        errors.push(format!(
            "Checksum divergent (attendu {expected}, recalculé {snapshot_checksum_value})."
        ));
    }

    let db = match Database::open_in_memory_workspace_cache() {
        Ok(db) => db,
        Err(error) => {
            errors.push(format!("Base mémoire workspace : {error}"));
            return failure_result(
                snapshot,
                expected,
                snapshot_checksum_value,
                checksum_match,
                errors,
            );
        }
    };
    let conn = db.connection();

    let normalized_table_counts = match table_counts_for_snapshot_records(conn, &snapshot.records) {
        Ok(counts) => counts,
        Err(message) => {
            errors.push(message);
            return failure_result(
                snapshot,
                expected,
                snapshot_checksum_value,
                checksum_match,
                errors,
            );
        }
    };
    if normalized_table_counts != snapshot.table_counts {
        errors.push(format!(
            "Comptages snapshot incohérents (déclaré {:?}, recalculé {:?}).",
            snapshot.table_counts, normalized_table_counts
        ));
    }

    if let Err(error) = conn.execute("PRAGMA foreign_keys = OFF", []) {
        errors.push(format!("PRAGMA foreign_keys OFF : {error}"));
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    if let Err(error) = db.begin_import_transaction() {
        errors.push(format!("Transaction import : {error}"));
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    let schema = match SchemaCache::build(conn) {
        Ok(schema) => schema,
        Err(error) => {
            errors.push(format!("Cache schéma : {error}"));
            let _ = db.rollback_import_transaction();
            return failure_result(
                snapshot,
                expected,
                snapshot_checksum_value,
                checksum_match,
                errors,
            );
        }
    };

    if let Err(message) = clear_exportable_table_rows(conn) {
        errors.push(message);
        let _ = db.rollback_import_transaction();
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    for record in &snapshot.records {
        if let Err(message) = insert_snapshot_record(conn, &schema, record) {
            errors.push(message);
            let _ = db.rollback_import_transaction();
            return failure_result(
                snapshot,
                expected,
                snapshot_checksum_value,
                checksum_match,
                errors,
            );
        }
    }

    if let Err(error) = db.commit_import_transaction() {
        errors.push(format!("Commit import : {error}"));
        let _ = db.rollback_import_transaction();
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    if let Err(error) = conn.execute("PRAGMA foreign_keys = ON", []) {
        errors.push(format!("PRAGMA foreign_keys ON : {error}"));
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    let fk_violations = match foreign_key_violations(conn) {
        Ok(violations) => violations,
        Err(error) => {
            errors.push(format!("PRAGMA foreign_key_check : {error}"));
            return failure_result(
                snapshot,
                expected,
                snapshot_checksum_value,
                checksum_match,
                errors,
            );
        }
    };
    let foreign_key_ok = fk_violations.is_empty();
    if !foreign_key_ok {
        errors.extend(fk_violations);
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    let integrity_message = match integrity_check_message(conn) {
        Ok(message) => message,
        Err(error) => {
            errors.push(format!("PRAGMA integrity_check : {error}"));
            return failure_result(
                snapshot,
                expected,
                snapshot_checksum_value,
                checksum_match,
                errors,
            );
        }
    };
    let integrity_ok = integrity_message.eq_ignore_ascii_case("ok");
    if !integrity_ok {
        errors.push(format!("Intégrité SQLite : {integrity_message}"));
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    let actual_counts = match count_exportable_tables(conn) {
        Ok(counts) => counts,
        Err(error) => {
            errors.push(format!("Comptage tables : {error}"));
            return failure_result(
                snapshot,
                expected,
                snapshot_checksum_value,
                checksum_match,
                errors,
            );
        }
    };
    if actual_counts != normalized_table_counts {
        errors.push(format!(
            "Comptages divergents (attendu {normalized_table_counts:?}, obtenu {actual_counts:?})."
        ));
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    let rebuilt = match build_team_migration_snapshot(&db) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            errors.push(format!("Reconstruction snapshot : {error}"));
            return failure_result(
                snapshot,
                expected,
                snapshot_checksum_value,
                checksum_match,
                errors,
            );
        }
    };
    let rebuilt_checksum = snapshot_checksum(&rebuilt);
    if rebuilt_checksum != snapshot_checksum_value {
        errors.push(format!(
            "Roundtrip checksum divergent (source {snapshot_checksum_value}, reconstruit {rebuilt_checksum})."
        ));
        return failure_result(
            snapshot,
            expected,
            snapshot_checksum_value,
            checksum_match,
            errors,
        );
    }

    WorkspaceRestoreValidationResult {
        valid: errors.is_empty(),
        checksum: rebuilt_checksum,
        expected_checksum: expected,
        checksum_match,
        table_counts: normalized_table_counts.clone(),
        total_records: snapshot.records.len(),
        foreign_key_ok,
        integrity_ok,
        errors,
    }
}

fn failure_result(
    snapshot: &TeamMigrationSnapshot,
    expected_checksum: String,
    checksum: String,
    checksum_match: bool,
    errors: Vec<String>,
) -> WorkspaceRestoreValidationResult {
    WorkspaceRestoreValidationResult {
        valid: false,
        checksum,
        expected_checksum,
        checksum_match,
        table_counts: snapshot.table_counts.clone(),
        total_records: snapshot.records.len(),
        foreign_key_ok: false,
        integrity_ok: false,
        errors,
    }
}

impl Database {
    /// Schéma CRM en SQLite mémoire — aucune lecture/écriture disque prod.
    pub(crate) fn open_in_memory_workspace_cache() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        crate::licensing::install_authorizer(&conn);
        let db = Database { conn };
        db.init_tables()?;
        Ok(db)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::workspace_sync::build_team_migration_snapshot;
    use crate::workspace::migration::{rebuild_snapshot_from_remote_items, snapshot_to_crm_data_items};
    use serde_json::{json, Map};

    fn test_db() -> Database {
        Database::open_in_memory_workspace_cache().expect("workspace cache db")
    }

    fn seed_roundtrip_fixtures(db: &Database) {
        db.connection()
            .execute_batch(
                "INSERT INTO foyers (nom, type_foyer) VALUES ('FOYER TEST', 'COUPLE');
                 INSERT INTO contacts (nom, prenom, categorie, foyer_id)
                   VALUES ('DUPONT', 'Jean', 'CLIENT', 1);",
            )
            .unwrap();
    }

    #[test]
    fn roundtrip_local_snapshot_via_simulated_remote_items() {
        let db = test_db();
        seed_roundtrip_fixtures(&db);
        let source = build_team_migration_snapshot(&db).unwrap();
        let expected = snapshot_checksum(&source);
        let remote_items = snapshot_to_crm_data_items(&source).unwrap();
        let (rebuilt, tombstones, parse_errors) =
            rebuild_snapshot_from_remote_items(&remote_items).unwrap();
        assert_eq!(tombstones, 0);
        assert!(parse_errors.is_empty());
        let mut rebuilt = rebuilt;
        rebuilt.table_counts =
            table_counts_for_snapshot_records(db.connection(), &rebuilt.records).unwrap();
        let report = validate_snapshot_in_memory(&rebuilt, &expected);
        assert!(report.valid, "{:?}", report.errors);
        assert!(report.checksum_match);
        assert!(report.foreign_key_ok);
        assert!(report.integrity_ok);
    }

    #[test]
    fn restores_snapshot_into_a_fresh_workspace_database() {
        let source_db = test_db();
        seed_roundtrip_fixtures(&source_db);
        let snapshot = build_team_migration_snapshot(&source_db).unwrap();
        let target_db = test_db();

        restore_snapshot_into_database(&target_db, &snapshot).unwrap();

        let restored = build_team_migration_snapshot(&target_db).unwrap();
        assert_eq!(snapshot_checksum(&restored), snapshot_checksum(&snapshot));
        let contact_count: i64 = target_db
            .connection()
            .query_row("SELECT COUNT(*) FROM contacts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(contact_count, 1);
    }

    #[test]
    fn rejects_broken_foreign_key() {
        let mut payload = Map::new();
        payload.insert(
            "id".into(),
            json!({ "kind": "integer", "value": 1 }),
        );
        payload.insert(
            "nom".into(),
            json!({ "kind": "text", "value": "DUPONT" }),
        );
        payload.insert(
            "prenom".into(),
            json!({ "kind": "text", "value": "Jean" }),
        );
        payload.insert(
            "categorie".into(),
            json!({ "kind": "text", "value": "CLIENT" }),
        );
        payload.insert(
            "foyer_id".into(),
            json!({ "kind": "integer", "value": 999 }),
        );
        let snapshot = TeamMigrationSnapshot {
            schema_version: WORKSPACE_SYNC_SCHEMA_VERSION,
            generated_at: "2026-01-01T00:00:00Z".into(),
            table_counts: BTreeMap::from([("contacts".into(), 1)]),
            records: vec![SnapshotRecord {
                table_name: "contacts".into(),
                record_key: r#"[{"column":"id","kind":"integer","value":1}]"#.into(),
                payload,
            }],
        };
        let checksum = snapshot_checksum(&snapshot);
        let report = validate_snapshot_in_memory(&snapshot, &checksum);
        assert!(!report.valid);
        assert!(!report.foreign_key_ok);
        assert!(report.errors.iter().any(|e| e.contains("contacts")));
    }

    #[test]
    fn rejects_unknown_table_and_column() {
        let mut snapshot = TeamMigrationSnapshot {
            schema_version: WORKSPACE_SYNC_SCHEMA_VERSION,
            generated_at: "2026-01-01T00:00:00Z".into(),
            table_counts: BTreeMap::from([("unknown_table".into(), 1)]),
            records: vec![SnapshotRecord {
                table_name: "unknown_table".into(),
                record_key: "rowid:1".into(),
                payload: Map::new(),
            }],
        };
        let checksum = snapshot_checksum(&snapshot);
        let report = validate_snapshot_in_memory(&snapshot, &checksum);
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|e| e.contains("Table inconnue")));

        snapshot = TeamMigrationSnapshot {
            schema_version: WORKSPACE_SYNC_SCHEMA_VERSION,
            generated_at: "2026-01-01T00:00:00Z".into(),
            table_counts: BTreeMap::from([("foyers".into(), 1)]),
            records: vec![SnapshotRecord {
                table_name: "foyers".into(),
                record_key: r#"[{"column":"id","kind":"integer","value":1}]"#.into(),
                payload: Map::from_iter([(
                    "bogus_column".into(),
                    json!({ "kind": "text", "value": "x" }),
                )]),
            }],
        };
        let checksum = snapshot_checksum(&snapshot);
        let report = validate_snapshot_in_memory(&snapshot, &checksum);
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|e| e.contains("Colonne inconnue")));
    }

    #[test]
    fn decodes_blob_base64() {
        let bytes = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let encoded = BASE64.encode(bytes.clone());
        let cell = json!({ "kind": "blob", "value": encoded });
        match decode_typed_cell_json(&cell).unwrap() {
            SqlValue::Blob(decoded) => assert_eq!(decoded, bytes),
            other => panic!("expected blob, got {other:?}"),
        }
    }

    #[test]
    fn rejects_checksum_mismatch_before_import() {
        let snapshot = TeamMigrationSnapshot {
            schema_version: WORKSPACE_SYNC_SCHEMA_VERSION,
            generated_at: "2026-01-01T00:00:00Z".into(),
            table_counts: BTreeMap::new(),
            records: vec![],
        };
        let report = validate_snapshot_in_memory(&snapshot, "deadbeef");
        assert!(!report.valid);
        assert!(!report.checksum_match);
    }
}
