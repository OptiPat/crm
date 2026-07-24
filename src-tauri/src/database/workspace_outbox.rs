//! Capture transactionnelle des mutations SQLite du mode équipe.
//!
//! Les triggers restent inactifs tant que le cutover n'a pas positionné
//! `capture_enabled=1` dans `workspace_sync_state`.

use super::workspace_sync::is_table_exportable;
use super::Database;
use rusqlite::{params, Connection, Result};

#[derive(Debug)]
struct OutboxColumn {
    name: String,
    declared_type: String,
    pk_rank: u32,
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn quote_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn table_columns(conn: &Connection, table: &str) -> Result<Vec<OutboxColumn>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", quote_identifier(table)))?;
    let rows = stmt.query_map([], |row| {
        Ok(OutboxColumn {
            name: row.get(1)?,
            declared_type: row.get(2)?,
            pk_rank: row.get(5)?,
        })
    })?;
    rows.collect()
}

fn typed_cell_expression(alias: &str, column: &str) -> String {
    let reference = format!("{alias}.{}", quote_identifier(column));
    format!(
        "CASE WHEN typeof({reference}) = 'null' \
            THEN json_object('kind', 'null') \
            ELSE json_object(\
                'kind', CASE typeof({reference}) \
                    WHEN 'integer' THEN 'integer' \
                    WHEN 'real' THEN 'real' \
                    WHEN 'text' THEN 'text' \
                    WHEN 'blob' THEN 'blob' END, \
                'value', CASE WHEN typeof({reference}) = 'blob' \
                    THEN hex({reference}) ELSE {reference} END\
            ) END"
    )
}

fn payload_expression(table: &str, alias: &str, columns: &[OutboxColumn]) -> String {
    let parts = columns
        .iter()
        .flat_map(|column| {
            let value = if table == "documents" && column.name == "chemin_fichier" {
                format!(
                    "json_object('kind', 'text', 'value', 'workspace-document://' || {alias}.\"id\")"
                )
            } else {
                typed_cell_expression(alias, &column.name)
            };
            [
                quote_literal(&column.name),
                value,
            ]
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!("json_object({parts})")
}

fn record_key_expression(alias: &str, columns: &[OutboxColumn]) -> Result<String> {
    let mut primary_key = columns
        .iter()
        .filter(|column| column.pk_rank > 0)
        .collect::<Vec<_>>();
    primary_key.sort_by_key(|column| column.pk_rank);
    if primary_key.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(
            "Table partagée sans clé primaire stable".into(),
        ));
    }
    let parts = primary_key
        .into_iter()
        .map(|column| {
            let reference = format!("{alias}.{}", quote_identifier(&column.name));
            format!(
                "CASE WHEN typeof({reference}) = 'null' \
                    THEN json_object('column', {}, 'kind', 'null') \
                    ELSE json_object(\
                        'column', {}, \
                        'kind', CASE typeof({reference}) \
                            WHEN 'integer' THEN 'integer' \
                            WHEN 'real' THEN 'real' \
                            WHEN 'text' THEN 'text' \
                            WHEN 'blob' THEN 'blob' END, \
                        'value', CASE WHEN typeof({reference}) = 'blob' \
                            THEN hex({reference}) ELSE {reference} END\
                    ) END",
                quote_literal(&column.name),
                quote_literal(&column.name)
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    Ok(format!("json_array({parts})"))
}

fn pending_upsert_sql(table: &str, record_key: &str, operation: &str, payload: &str) -> String {
    format!(
        "INSERT INTO workspace_sync_queue \
            (table_name, record_key, operation, payload_json, enqueued_at, revision, synced_at, error_message) \
         VALUES ({table_name}, {record_key}, '{operation}', {payload}, unixepoch(), \
            COALESCE((SELECT MAX(revision) + 1 FROM workspace_sync_queue \
                      WHERE table_name = {table_name} AND record_key = {record_key}), 1), \
            NULL, NULL) \
         ON CONFLICT(table_name, record_key) WHERE synced_at IS NULL DO UPDATE SET \
            operation = excluded.operation, \
            payload_json = excluded.payload_json, \
            enqueued_at = excluded.enqueued_at, \
            revision = workspace_sync_queue.revision + 1, \
            error_message = NULL;",
        table_name = quote_literal(table),
    )
}

fn trigger_condition() -> &'static str {
    "COALESCE((SELECT value FROM workspace_sync_state WHERE key = 'capture_enabled'), '0') = '1' \
     AND COALESCE((SELECT value FROM workspace_sync_state WHERE key = 'apply_origin'), 'local') <> 'remote'"
}

fn local_id_guard_condition() -> &'static str {
    "COALESCE((SELECT value FROM workspace_sync_state WHERE key = 'capture_enabled'), '0') = '1' \
     AND COALESCE((SELECT value FROM workspace_sync_state WHERE key = 'apply_origin'), 'local') <> 'remote'"
}

fn online_write_guard_condition() -> &'static str {
    "COALESCE((SELECT value FROM workspace_sync_state WHERE key = 'capture_enabled'), '0') = '1' \
     AND COALESCE((SELECT value FROM workspace_sync_state WHERE key = 'apply_origin'), 'local') <> 'remote' \
     AND COALESCE(CAST((SELECT value FROM workspace_sync_state WHERE key = 'last_online_at') AS INTEGER), 0) < unixepoch() - 45"
}

fn autoincrement_primary_key(
    conn: &Connection,
    table: &str,
    columns: &[OutboxColumn],
) -> Result<Option<String>> {
    let create_sql: Option<String> = conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
        params![table],
        |row| row.get(0),
    )?;
    if !create_sql
        .as_deref()
        .is_some_and(|sql| sql.to_ascii_uppercase().contains("AUTOINCREMENT"))
    {
        return Ok(None);
    }
    let primary_key = columns
        .iter()
        .filter(|column| column.pk_rank > 0)
        .collect::<Vec<_>>();
    if primary_key.len() != 1 || !primary_key[0].declared_type.eq_ignore_ascii_case("INTEGER") {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "AUTOINCREMENT partagé sans PK INTEGER simple : {table}"
        )));
    }
    Ok(Some(primary_key[0].name.clone()))
}

fn install_table_triggers(conn: &Connection, table: &str) -> Result<()> {
    let columns = table_columns(conn, table)?;
    if columns
        .iter()
        .any(|column| column.declared_type.eq_ignore_ascii_case("BLOB"))
    {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "Table partagée avec colonne BLOB non supportée par l'outbox JSON : {table}"
        )));
    }
    let new_key = record_key_expression("NEW", &columns).map_err(|_| {
        rusqlite::Error::InvalidParameterName(format!(
            "Table partagée sans clé primaire stable : {table}"
        ))
    })?;
    let old_key = record_key_expression("OLD", &columns).map_err(|_| {
        rusqlite::Error::InvalidParameterName(format!(
            "Table partagée sans clé primaire stable : {table}"
        ))
    })?;
    let new_payload = payload_expression(table, "NEW", &columns);
    let old_payload = payload_expression(table, "OLD", &columns);
    let insert_sql = pending_upsert_sql(table, &new_key, "upsert", &new_payload);
    let delete_sql = pending_upsert_sql(table, &old_key, "delete", &old_payload);
    let table_identifier = quote_identifier(table);
    let trigger_prefix = format!("workspace_outbox_{}", table.replace('-', "_"));

    conn.execute_batch(&format!(
        "CREATE TRIGGER IF NOT EXISTS {offline_insert_guard} \
         BEFORE INSERT ON {table_identifier} \
         WHEN {offline_condition} BEGIN \
            SELECT RAISE(ABORT, 'Mode équipe hors connexion : modification interdite'); \
         END;
         CREATE TRIGGER IF NOT EXISTS {offline_update_guard} \
         BEFORE UPDATE ON {table_identifier} \
         WHEN {offline_condition} BEGIN \
            SELECT RAISE(ABORT, 'Mode équipe hors connexion : modification interdite'); \
         END;
         CREATE TRIGGER IF NOT EXISTS {offline_delete_guard} \
         BEFORE DELETE ON {table_identifier} \
         WHEN {offline_condition} BEGIN \
            SELECT RAISE(ABORT, 'Mode équipe hors connexion : modification interdite'); \
         END;
         CREATE TRIGGER IF NOT EXISTS {insert_trigger} \
         AFTER INSERT ON {table_identifier} \
         WHEN {condition} BEGIN {insert_sql} END;
         CREATE TRIGGER IF NOT EXISTS {update_delete_trigger} \
         AFTER UPDATE ON {table_identifier} \
         WHEN ({condition}) AND {old_key} <> {new_key} \
         BEGIN {delete_sql} END;
         CREATE TRIGGER IF NOT EXISTS {update_trigger} \
         AFTER UPDATE ON {table_identifier} \
         WHEN {condition} BEGIN {insert_sql} END;
         CREATE TRIGGER IF NOT EXISTS {delete_trigger} \
         AFTER DELETE ON {table_identifier} \
         WHEN {condition} BEGIN {delete_sql} END;",
        insert_trigger = quote_identifier(&format!("{trigger_prefix}_ai")),
        update_trigger = quote_identifier(&format!("{trigger_prefix}_au")),
        update_delete_trigger = quote_identifier(&format!("{trigger_prefix}_au_pk_delete")),
        delete_trigger = quote_identifier(&format!("{trigger_prefix}_ad")),
        offline_insert_guard = quote_identifier(&format!("{trigger_prefix}_offline_bi")),
        offline_update_guard = quote_identifier(&format!("{trigger_prefix}_offline_bu")),
        offline_delete_guard = quote_identifier(&format!("{trigger_prefix}_offline_bd")),
        offline_condition = online_write_guard_condition(),
        condition = trigger_condition(),
    ))?;

    if let Some(pk_column) = autoincrement_primary_key(conn, table, &columns)? {
        let pk_reference_new = format!("NEW.{}", quote_identifier(&pk_column));
        conn.execute_batch(&format!(
            "CREATE TRIGGER IF NOT EXISTS {insert_guard}
             AFTER INSERT ON {table_identifier}
             WHEN ({condition}) AND NOT EXISTS (
                SELECT 1 FROM workspace_id_blocks
                WHERE table_name = {table_name}
                  AND {pk_reference_new} BETWEEN start_id AND end_id
             )
             BEGIN
                SELECT RAISE(ABORT, 'Bloc d identifiants équipe absent ou épuisé');
             END;
             CREATE TRIGGER IF NOT EXISTS {update_guard}
             AFTER UPDATE OF {pk_column} ON {table_identifier}
             WHEN ({condition}) AND NOT EXISTS (
                SELECT 1 FROM workspace_id_blocks
                WHERE table_name = {table_name}
                  AND {pk_reference_new} BETWEEN start_id AND end_id
             )
             BEGIN
                SELECT RAISE(ABORT, 'Identifiant hors du bloc équipe réservé');
             END;",
            insert_guard = quote_identifier(&format!("{trigger_prefix}_id_guard_ai")),
            update_guard = quote_identifier(&format!("{trigger_prefix}_id_guard_au")),
            condition = local_id_guard_condition(),
            table_name = quote_literal(table),
            pk_column = quote_identifier(&pk_column),
        ))?;
    }
    Ok(())
}

fn ensure_queue_revision_column(conn: &Connection) -> Result<()> {
    let has_revision = table_columns(conn, "workspace_sync_queue")?
        .iter()
        .any(|column| column.name == "revision");
    if !has_revision {
        conn.execute(
            "ALTER TABLE workspace_sync_queue ADD COLUMN revision INTEGER NOT NULL DEFAULT 1",
            [],
        )?;
    }
    Ok(())
}

fn ensure_conflict_remote_columns(conn: &Connection) -> Result<()> {
    let columns = table_columns(conn, "workspace_conflicts")?;
    if !columns.iter().any(|column| column.name == "remote_item_id") {
        conn.execute(
            "ALTER TABLE workspace_conflicts ADD COLUMN remote_item_id TEXT",
            [],
        )?;
    }
    if !columns.iter().any(|column| column.name == "remote_deleted") {
        conn.execute(
            "ALTER TABLE workspace_conflicts
             ADD COLUMN remote_deleted INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

impl Database {
    pub(crate) fn migrate_workspace_outbox(&self) -> Result<()> {
        ensure_queue_revision_column(&self.conn)?;
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workspace_inbound_stage (
                remote_item_id TEXT PRIMARY KEY,
                remote_etag TEXT,
                sync_key TEXT,
                payload_json TEXT,
                deleted INTEGER NOT NULL DEFAULT 0,
                received_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS workspace_conflicts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                record_key TEXT NOT NULL,
                base_payload_json TEXT,
                local_payload_json TEXT,
                remote_payload_json TEXT,
                base_etag TEXT,
                remote_etag TEXT,
                remote_item_id TEXT,
                remote_deleted INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'open',
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                resolved_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS workspace_id_blocks (
                table_name TEXT PRIMARY KEY,
                start_id INTEGER NOT NULL,
                end_id INTEGER NOT NULL,
                remote_item_id TEXT NOT NULL,
                remote_etag TEXT NOT NULL,
                reserved_at INTEGER NOT NULL DEFAULT (unixepoch()),
                CHECK(start_id > 0),
                CHECK(end_id >= start_id)
            );",
        )?;
        ensure_conflict_remote_columns(&self.conn)?;

        let mut stmt = self.conn.prepare(
            "SELECT name FROM sqlite_master
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name",
        )?;
        let tables = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>>>()?;
        for table in tables {
            if is_table_exportable(&table) {
                install_table_triggers(&self.conn, &table)?;
            }
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn workspace_sync_set_capture_enabled(&self, enabled: bool) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('capture_enabled', ?1, unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![if enabled { "1" } else { "0" }],
        )?;
        if enabled {
            tx.execute(
                "INSERT INTO workspace_sync_state (key, value, updated_at)
                 VALUES ('last_online_at', CAST(unixepoch() AS TEXT), unixepoch())
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                [],
            )?;
        }
        tx.commit()
    }

    pub fn workspace_sync_mark_online(&self) -> Result<()> {
        self.conn.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('last_online_at', CAST(unixepoch() AS TEXT), unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [],
        )?;
        Ok(())
    }

    #[cfg(test)]
    pub fn workspace_sync_set_apply_origin(&self, origin: &str) -> Result<()> {
        if origin != "local" && origin != "remote" {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Origine sync invalide : {origin}"
            )));
        }
        self.conn.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('apply_origin', ?1, unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![origin],
        )?;
        Ok(())
    }

    pub fn workspace_sync_install_id_block(
        &self,
        table_name: &str,
        start_id: i64,
        end_id: i64,
        remote_item_id: &str,
        remote_etag: &str,
    ) -> Result<()> {
        if start_id <= 0 || end_id < start_id || !is_table_exportable(table_name) {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Bloc d'identifiants invalide pour {table_name}"
            )));
        }
        let columns = table_columns(&self.conn, table_name)?;
        if autoincrement_primary_key(&self.conn, table_name, &columns)?.is_none() {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Table sans AUTOINCREMENT distribué : {table_name}"
            )));
        }
        let tx = self.conn.unchecked_transaction()?;
        let max_id: i64 = tx.query_row(
            &format!(
                "SELECT COALESCE(MAX({}), 0) FROM {}",
                quote_identifier(
                    &columns
                        .iter()
                        .find(|column| column.pk_rank == 1)
                        .ok_or_else(|| rusqlite::Error::InvalidParameterName(table_name.into()))?
                        .name
                ),
                quote_identifier(table_name)
            ),
            [],
            |row| row.get(0),
        )?;
        if max_id >= start_id {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Le bloc {start_id}–{end_id} chevauche les identifiants locaux de {table_name} (max {max_id})"
            )));
        }
        tx.execute(
            "INSERT INTO workspace_id_blocks
                (table_name, start_id, end_id, remote_item_id, remote_etag, reserved_at)
             VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())
             ON CONFLICT(table_name) DO UPDATE SET
                start_id = excluded.start_id,
                end_id = excluded.end_id,
                remote_item_id = excluded.remote_item_id,
                remote_etag = excluded.remote_etag,
                reserved_at = excluded.reserved_at",
            params![table_name, start_id, end_id, remote_item_id, remote_etag],
        )?;
        let updated = tx.execute(
            "UPDATE sqlite_sequence SET seq = ?2 WHERE name = ?1",
            params![table_name, start_id - 1],
        )?;
        if updated == 0 {
            tx.execute(
                "INSERT INTO sqlite_sequence (name, seq) VALUES (?1, ?2)",
                params![table_name, start_id - 1],
            )?;
        }
        tx.commit()
    }

    pub fn workspace_sync_autoincrement_tables(&self) -> Result<Vec<(String, i64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT name FROM sqlite_master
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name",
        )?;
        let tables = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>>>()?;
        let mut result = Vec::new();
        for table in tables {
            if !is_table_exportable(&table) {
                continue;
            }
            let columns = table_columns(&self.conn, &table)?;
            let Some(pk_column) = autoincrement_primary_key(&self.conn, &table, &columns)? else {
                continue;
            };
            let max_id = self.conn.query_row(
                &format!(
                    "SELECT COALESCE(MAX({}), 0) FROM {}",
                    quote_identifier(&pk_column),
                    quote_identifier(&table)
                ),
                [],
                |row| row.get(0),
            )?;
            result.push((table, max_id));
        }
        Ok(result)
    }

    pub fn workspace_sync_activate_capture(&self, delta_link: &str) -> Result<()> {
        if delta_link.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "DeltaLink vide lors de l'activation".into(),
            ));
        }
        let expected_blocks = self.workspace_sync_autoincrement_tables()?.len() as i64;
        let installed_blocks: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM workspace_id_blocks", [], |row| {
                    row.get(0)
                })?;
        if installed_blocks != expected_blocks {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Blocs d'identifiants incomplets : {installed_blocks}/{expected_blocks}"
            )));
        }
        let pending: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workspace_sync_queue WHERE synced_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        if pending != 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Activation impossible avec {pending} mutation(s) locale(s) en attente"
            )));
        }
        let conflicts: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workspace_conflicts WHERE status = 'open'",
            [],
            |row| row.get(0),
        )?;
        if conflicts != 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Activation impossible avec {conflicts} conflit(s)"
            )));
        }
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('crm_data_delta_link', ?1, unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![delta_link],
        )?;
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('capture_enabled', '1', unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [],
        )?;
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('last_online_at', CAST(unixepoch() AS TEXT), unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [],
        )?;
        tx.commit()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::workspace_sync::build_team_migration_snapshot;

    #[test]
    fn document_payload_never_contains_a_local_path() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_sync_install_id_block("documents", 1, 100, "seq-documents", "\"1\"")
            .unwrap();
        db.workspace_sync_set_capture_enabled(true).unwrap();
        db.connection()
            .execute(
                "INSERT INTO documents
                   (type_document, nom_fichier, chemin_fichier, taille_fichier)
                 VALUES ('QPI', 'questionnaire.pdf', 'D:\\source\\questionnaire.pdf', 123)",
                [],
            )
            .unwrap();

        let payload: String = db
            .connection()
            .query_row(
                "SELECT payload_json FROM workspace_sync_queue
                 WHERE table_name = 'documents' AND synced_at IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(payload.contains("workspace-document://1"));
        assert!(!payload.contains("source"));

        let snapshot = build_team_migration_snapshot(&db).unwrap();
        let document = snapshot
            .records
            .iter()
            .find(|record| record.table_name == "documents")
            .unwrap();
        assert_eq!(
            document
                .payload
                .get("chemin_fichier")
                .and_then(|value| value.get("value"))
                .and_then(serde_json::Value::as_str),
            Some("workspace-document://1")
        );
    }

    #[test]
    fn outbox_is_transactional_compacted_and_suppressed_for_remote_apply() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_sync_install_id_block("contacts", 1, 100, "seq-contacts", "\"1\"")
            .unwrap();
        db.workspace_sync_set_capture_enabled(true).unwrap();

        db.connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie) VALUES ('DUPONT', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap();
        db.connection()
            .execute("UPDATE contacts SET prenom = 'Paul' WHERE id = 1", [])
            .unwrap();

        let (operation, revision, record_key, payload): (String, i64, String, String) = db
            .connection()
            .query_row(
                "SELECT operation, revision, record_key, payload_json
                 FROM workspace_sync_queue
                 WHERE table_name = 'contacts' AND synced_at IS NULL",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(operation, "upsert");
        assert_eq!(revision, 2);
        assert!(payload.contains("Paul"));
        let snapshot = build_team_migration_snapshot(&db).unwrap();
        let snapshot_contact = snapshot
            .records
            .iter()
            .find(|record| record.table_name == "contacts" && record.record_key == record_key)
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&payload).unwrap(),
            serde_json::Value::Object(snapshot_contact.payload.clone())
        );

        db.connection()
            .execute_batch("BEGIN; UPDATE contacts SET prenom = 'ROLLBACK' WHERE id = 1; ROLLBACK;")
            .unwrap();
        let revision_after_rollback: i64 = db
            .connection()
            .query_row(
                "SELECT revision FROM workspace_sync_queue
                 WHERE table_name = 'contacts' AND synced_at IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revision_after_rollback, 2);

        db.workspace_sync_set_apply_origin("remote").unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie) VALUES ('LEGRAND', 'Luc', 'CLIENT')",
                [],
            )
            .unwrap();
        let pending_count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM workspace_sync_queue WHERE synced_at IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending_count, 1);

        db.workspace_sync_set_apply_origin("local").unwrap();
        db.connection()
            .execute("DELETE FROM contacts WHERE id = 1", [])
            .unwrap();
        let (operation, revision): (String, i64) = db
            .connection()
            .query_row(
                "SELECT operation, revision FROM workspace_sync_queue
                 WHERE table_name = 'contacts' AND synced_at IS NULL",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(operation, "delete");
        assert_eq!(revision, 3);
    }

    #[test]
    fn shared_writes_fail_closed_when_online_lease_is_stale() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_sync_set_capture_enabled(true).unwrap();
        db.connection()
            .execute(
                "UPDATE workspace_sync_state SET value = '1' WHERE key = 'last_online_at'",
                [],
            )
            .unwrap();

        let error = db
            .connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie)
                 VALUES ('DUPONT', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap_err();
        assert!(error.to_string().contains("Mode équipe hors connexion"));

        db.workspace_sync_set_apply_origin("remote").unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie)
                 VALUES ('LEGRAND', 'Paul', 'CLIENT')",
                [],
            )
            .unwrap();
    }

    #[test]
    fn reserved_id_block_prevents_cross_client_collisions() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_sync_install_id_block("contacts", 100, 101, "seq-contacts", "\"2\"")
            .unwrap();
        db.workspace_sync_set_capture_enabled(true).unwrap();

        db.connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie)
                 VALUES ('DUPONT', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie)
                 VALUES ('LEGRAND', 'Paul', 'CLIENT')",
                [],
            )
            .unwrap();
        let ids = {
            let mut stmt = db
                .connection()
                .prepare("SELECT id FROM contacts ORDER BY id")
                .unwrap();
            stmt.query_map([], |row| row.get::<_, i64>(0))
                .unwrap()
                .collect::<Result<Vec<_>>>()
                .unwrap()
        };
        assert_eq!(ids, vec![100, 101]);
        assert!(db
            .connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie)
                 VALUES ('BERNARD', 'Luc', 'CLIENT')",
                [],
            )
            .is_err());

        db.workspace_sync_set_apply_origin("remote").unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (id, nom, prenom, categorie)
                 VALUES (500, 'MARTIN', 'Anne', 'CLIENT')",
                [],
            )
            .unwrap();
    }

    #[test]
    fn team_cache_copy_does_not_modify_the_historical_database() {
        let source = Database::open_in_memory_for_tests().unwrap();
        source
            .connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie)
                 VALUES ('DUPONT', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap();
        let path = std::env::temp_dir().join(format!(
            "patrimoine-crm-team-cache-test-{}-{}.db",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        source.backup_to_path(&path).unwrap();
        {
            let copy = Connection::open(&path).unwrap();
            copy.execute("UPDATE contacts SET nom = 'CACHE' WHERE id = 1", [])
                .unwrap();
        }
        let historical_name: String = source
            .connection()
            .query_row("SELECT nom FROM contacts WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(historical_name, "DUPONT");
        let _ = std::fs::remove_file(path);
    }
}
