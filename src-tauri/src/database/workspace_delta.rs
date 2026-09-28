//! Application atomique des changements CRM_Data distants dans le cache équipe.

use super::workspace_restore::decode_typed_cell_json;
use super::workspace_sync::is_table_exportable;
use super::Database;
use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRemoteDeltaChange {
    pub remote_item_id: String,
    pub remote_etag: Option<String>,
    pub table_name: String,
    pub record_key: String,
    pub payload: Option<Map<String, Value>>,
    pub deleted: bool,
    /// Identité Microsoft (`UpdatedBy`) qui a écrit l'élément côté SharePoint.
    #[serde(default)]
    pub updated_by: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenConflictTarget {
    pub conflict_id: i64,
    pub table_name: String,
    pub record_key: String,
    pub remote_item_id: Option<String>,
}

#[derive(Debug)]
struct DeltaColumn {
    name: String,
    pk_rank: u32,
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn table_columns(conn: &Connection, table: &str) -> Result<Vec<DeltaColumn>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", quote_identifier(table)))
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DeltaColumn {
                name: row.get(1)?,
                pk_rank: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

fn primary_key_columns(columns: &[DeltaColumn]) -> Vec<&DeltaColumn> {
    let mut primary_key = columns
        .iter()
        .filter(|column| column.pk_rank > 0)
        .collect::<Vec<_>>();
    primary_key.sort_by_key(|column| column.pk_rank);
    primary_key
}

fn validate_record_identity(
    change: &WorkspaceRemoteDeltaChange,
    payload: &Map<String, Value>,
    primary_key: &[&DeltaColumn],
) -> Result<(), String> {
    let mut canonical = Vec::with_capacity(primary_key.len());
    for column in primary_key {
        let cell = payload.get(&column.name).ok_or_else(|| {
            format!(
                "Payload distant {} sans clé primaire « {} ».",
                change.remote_item_id, column.name
            )
        })?;
        canonical.push(serde_json::json!({
            "column": column.name,
            "kind": cell.get("kind").and_then(Value::as_str).unwrap_or("null"),
            "value": cell.get("value").cloned().unwrap_or(Value::Null),
        }));
    }
    let expected = serde_json::to_string(&canonical).map_err(|error| error.to_string())?;
    if expected != change.record_key {
        return Err(format!(
            "RecordKey distant incohérente pour {} / {}.",
            change.table_name, change.remote_item_id
        ));
    }
    Ok(())
}

fn upsert_remote_record(
    conn: &Connection,
    change: &WorkspaceRemoteDeltaChange,
    columns: &[DeltaColumn],
) -> Result<(), String> {
    let payload = change
        .payload
        .as_ref()
        .ok_or_else(|| "Payload distant absent pour un upsert.".to_string())?;
    let allowed_columns = columns
        .iter()
        .map(|column| column.name.as_str())
        .collect::<std::collections::HashSet<_>>();
    if let Some(unknown) = payload
        .keys()
        .find(|column| !allowed_columns.contains(column.as_str()))
    {
        return Err(format!(
            "Colonne distante inconnue « {unknown} » dans {}.",
            change.table_name
        ));
    }
    let primary_key = primary_key_columns(columns);
    if primary_key.is_empty() {
        return Err(format!(
            "Table partagée sans clé primaire stable : {}.",
            change.table_name
        ));
    }
    validate_record_identity(change, payload, &primary_key)?;

    let mut names = payload.keys().cloned().collect::<Vec<_>>();
    names.sort_unstable();
    let preserved_document_path = if change.table_name == "documents" {
        payload
            .get("id")
            .and_then(|cell| decode_typed_cell_json(cell).ok())
            .and_then(|value| match value {
                SqlValue::Integer(id) => Some(id),
                _ => None,
            })
            .and_then(|id| {
                conn.query_row(
                    "SELECT chemin_fichier FROM documents WHERE id = ?1",
                    [id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .ok()
                .flatten()
            })
            .filter(|path| crate::workspace::documents::logical_document_id(path).is_none())
    } else {
        None
    };
    let values = names
        .iter()
        .map(|name| {
            if name == "chemin_fichier" {
                if let Some(path) = preserved_document_path.as_ref() {
                    return Ok(SqlValue::Text(path.clone()));
                }
            }
            payload
                .get(name)
                .ok_or_else(|| format!("Colonne distante absente : {name}."))
                .and_then(decode_typed_cell_json)
        })
        .collect::<Result<Vec<SqlValue>, String>>()?;
    let quoted_names = names
        .iter()
        .map(|name| quote_identifier(name))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=names.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let conflict_columns = primary_key
        .iter()
        .map(|column| quote_identifier(&column.name))
        .collect::<Vec<_>>()
        .join(", ");
    let updates = names
        .iter()
        .filter(|name| !primary_key.iter().any(|column| column.name == **name))
        .map(|name| {
            let quoted = quote_identifier(name);
            format!("{quoted} = excluded.{quoted}")
        })
        .collect::<Vec<_>>();
    let conflict_action = if updates.is_empty() {
        "DO NOTHING".to_string()
    } else {
        format!("DO UPDATE SET {}", updates.join(", "))
    };
    conn.execute(
        &format!(
            "INSERT INTO {} ({quoted_names}) VALUES ({placeholders})
             ON CONFLICT ({conflict_columns}) {conflict_action}",
            quote_identifier(&change.table_name)
        ),
        params_from_iter(values),
    )
    .map_err(|error| {
        format!(
            "Application distante {} / {} : {error}",
            change.table_name, change.record_key
        )
    })?;
    Ok(())
}

fn delete_remote_record(
    conn: &Connection,
    change: &WorkspaceRemoteDeltaChange,
    columns: &[DeltaColumn],
) -> Result<(), String> {
    let primary_key = primary_key_columns(columns);
    let key_parts: Vec<Value> =
        serde_json::from_str(&change.record_key).map_err(|error| error.to_string())?;
    if key_parts.len() != primary_key.len() {
        return Err(format!(
            "RecordKey distante invalide pour la suppression {}.",
            change.remote_item_id
        ));
    }
    let mut values = Vec::with_capacity(primary_key.len());
    for (part, column) in key_parts.iter().zip(primary_key.iter()) {
        if part.get("column").and_then(Value::as_str) != Some(column.name.as_str()) {
            return Err(format!(
                "Colonne de RecordKey inattendue pour la suppression {}.",
                change.remote_item_id
            ));
        }
        values.push(decode_typed_cell_json(part)?);
    }
    let predicate = primary_key
        .iter()
        .enumerate()
        .map(|(index, column)| format!("{} = ?{}", quote_identifier(&column.name), index + 1))
        .collect::<Vec<_>>()
        .join(" AND ");
    conn.execute(
        &format!(
            "DELETE FROM {} WHERE {predicate}",
            quote_identifier(&change.table_name)
        ),
        params_from_iter(values),
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn has_pending_local_change(
    conn: &Connection,
    table_name: &str,
    record_key: &str,
) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM workspace_sync_queue
         WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL",
        params![table_name, record_key],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn payloads_are_identical(local_json: Option<&str>, remote: Option<&Map<String, Value>>) -> bool {
    let (Some(local_json), Some(remote)) = (local_json, remote) else {
        return false;
    };
    serde_json::from_str::<Value>(local_json)
        .map(|local| local == Value::Object(remote.clone()))
        .unwrap_or(false)
}

/// Une modification locale envoyée à SharePoint mais jamais acquittée (coupure,
/// quota Graph) revient par le delta avec le même contenu : ce n'est pas un conflit.
fn pending_local_change_is_echo(
    conn: &Connection,
    change: &WorkspaceRemoteDeltaChange,
) -> rusqlite::Result<bool> {
    if change.deleted {
        return Ok(false);
    }
    let local_payload: Option<String> = conn
        .query_row(
            "SELECT payload_json FROM workspace_sync_queue
             WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL
               AND operation = 'upsert'",
            params![change.table_name, change.record_key],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    Ok(payloads_are_identical(
        local_payload.as_deref(),
        change.payload.as_ref(),
    ))
}

/// L'élément distant a été écrit par ce poste (même identité Microsoft).
pub fn is_own_remote_write(change: &WorkspaceRemoteDeltaChange, local_actor_id: Option<&str>) -> bool {
    match (change.updated_by.as_deref(), local_actor_id) {
        (Some(remote), Some(local)) => {
            !change.deleted && !remote.trim().is_empty() && remote.eq_ignore_ascii_case(local.trim())
        }
        _ => false,
    }
}

/// Ferme en « conserver ma version » les conflits ouverts d'une ligne dont la
/// version distante est en fait la nôtre : la file locale reste à envoyer.
fn close_open_conflicts_keep_local(
    conn: &Connection,
    table_name: &str,
    record_key: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE workspace_conflicts
         SET status = 'resolved_keep_local', resolved_at = unixepoch()
         WHERE table_name = ?1 AND record_key = ?2 AND status = 'open'",
        params![table_name, record_key],
    )?;
    Ok(())
}

/// Acquitte la file locale et ferme tout conflit ouvert sur la ligne : local et
/// distant sont désormais identiques, il n'y a plus rien à arbitrer.
fn acknowledge_pending_local_change(
    conn: &Connection,
    table_name: &str,
    record_key: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE workspace_sync_queue
         SET synced_at = unixepoch(), error_message = NULL
         WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL",
        params![table_name, record_key],
    )?;
    conn.execute(
        "UPDATE workspace_conflicts
         SET status = 'resolved_accept_remote', resolved_at = unixepoch()
         WHERE table_name = ?1 AND record_key = ?2 AND status = 'open'",
        params![table_name, record_key],
    )?;
    Ok(())
}

fn persist_remote_mapping(
    conn: &Connection,
    change: &WorkspaceRemoteDeltaChange,
) -> rusqlite::Result<()> {
    if change.deleted {
        conn.execute(
            "DELETE FROM workspace_remote_records
             WHERE table_name = ?1 AND record_key = ?2",
            params![change.table_name, change.record_key],
        )?;
        return Ok(());
    }
    conn.execute(
        "INSERT INTO workspace_remote_records
            (table_name, record_key, remote_item_id, remote_etag, last_synced_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())
         ON CONFLICT(table_name, record_key) DO UPDATE SET
            remote_item_id = excluded.remote_item_id,
            remote_etag = excluded.remote_etag,
            last_synced_at = excluded.last_synced_at,
            updated_at = excluded.updated_at",
        params![
            change.table_name,
            change.record_key,
            change.remote_item_id,
            change.remote_etag
        ],
    )?;
    Ok(())
}

fn record_conflict(conn: &Connection, change: &WorkspaceRemoteDeltaChange) -> rusqlite::Result<()> {
    let local_payload: Option<String> = conn.query_row(
        "SELECT payload_json FROM workspace_sync_queue
         WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL",
        params![change.table_name, change.record_key],
        |row| row.get(0),
    )?;
    let base = conn
        .query_row(
            "SELECT remote_etag FROM workspace_remote_records
             WHERE table_name = ?1 AND record_key = ?2",
            params![change.table_name, change.record_key],
            |row| row.get::<_, Option<String>>(0),
        )
        .unwrap_or(None);
    let remote_payload = change
        .payload
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    conn.execute(
        "INSERT INTO workspace_conflicts
            (table_name, record_key, local_payload_json, remote_payload_json,
             base_etag, remote_etag, remote_item_id, remote_deleted)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            change.table_name,
            change.record_key,
            local_payload,
            remote_payload,
            base,
            change.remote_etag,
            change.remote_item_id,
            change.deleted
        ],
    )?;
    Ok(())
}

impl Database {
    pub fn workspace_sync_record_push_conflict(
        &self,
        table_name: &str,
        record_key: &str,
        remote_item_id: &str,
        remote_payload_json: Option<&str>,
        remote_etag: Option<&str>,
        remote_deleted: bool,
    ) -> Result<(), String> {
        let local_payload: Option<String> = self
            .conn
            .query_row(
                "SELECT payload_json FROM workspace_sync_queue
                 WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL",
                params![table_name, record_key],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let base_etag = self
            .conn
            .query_row(
                "SELECT remote_etag FROM workspace_remote_records
                 WHERE table_name = ?1 AND record_key = ?2",
                params![table_name, record_key],
                |row| row.get::<_, Option<String>>(0),
            )
            .unwrap_or(None);
        self.conn
            .execute(
                "INSERT INTO workspace_conflicts
                    (table_name, record_key, local_payload_json, remote_payload_json,
                     base_etag, remote_etag, remote_item_id, remote_deleted)
                 SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
                 WHERE NOT EXISTS (
                    SELECT 1 FROM workspace_conflicts
                    WHERE table_name = ?1 AND record_key = ?2 AND status = 'open'
                 )",
                params![
                    table_name,
                    record_key,
                    local_payload,
                    remote_payload_json,
                    base_etag,
                    remote_etag,
                    remote_item_id,
                    remote_deleted
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn workspace_sync_resolve_conflict_accept_remote(
        &self,
        conflict_id: i64,
    ) -> Result<(), String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        let (
            table_name,
            record_key,
            remote_item_id,
            remote_etag,
            remote_payload_json,
            remote_deleted,
        ): (
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            bool,
        ) = tx
            .query_row(
                "SELECT table_name, record_key, remote_item_id, remote_etag,
                        remote_payload_json, remote_deleted
                 FROM workspace_conflicts
                 WHERE id = ?1 AND status = 'open'",
                params![conflict_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .map_err(|error| error.to_string())?;
        let remote_item_id = remote_item_id
            .or_else(|| {
                tx.query_row(
                    "SELECT remote_item_id FROM workspace_remote_records
                     WHERE table_name = ?1 AND record_key = ?2",
                    params![table_name, record_key],
                    |row| row.get::<_, Option<String>>(0),
                )
                .ok()
                .flatten()
            })
            .ok_or_else(|| "Identifiant SharePoint du conflit indisponible.".to_string())?;
        let payload = match remote_payload_json {
            Some(raw) => Some(
                serde_json::from_str::<Value>(&raw)
                    .map_err(|error| format!("Payload distant du conflit invalide : {error}"))?
                    .as_object()
                    .cloned()
                    .ok_or_else(|| "Payload distant du conflit non objet.".to_string())?,
            ),
            None if remote_deleted => None,
            None => return Err("Version distante du conflit indisponible.".into()),
        };
        let change = WorkspaceRemoteDeltaChange {
            remote_item_id,
            remote_etag,
            table_name: table_name.clone(),
            record_key: record_key.clone(),
            payload,
            deleted: remote_deleted,
            updated_by: None,
        };
        let columns = table_columns(&tx, &table_name)?;
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('apply_origin', 'remote', unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [],
        )
        .map_err(|error| error.to_string())?;
        tx.execute(
            "DELETE FROM workspace_sync_queue
             WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL",
            params![table_name, record_key],
        )
        .map_err(|error| error.to_string())?;
        if change.deleted {
            delete_remote_record(&tx, &change, &columns)?;
        } else {
            upsert_remote_record(&tx, &change, &columns)?;
        }
        persist_remote_mapping(&tx, &change).map_err(|error| error.to_string())?;
        tx.execute(
            "UPDATE workspace_conflicts
             SET status = 'resolved_accept_remote', resolved_at = unixepoch()
             WHERE id = ?1 AND status = 'open'",
            params![conflict_id],
        )
        .map_err(|error| error.to_string())?;
        let violation_count: i64 = tx
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        if violation_count > 0 {
            return Err(format!(
                "Résolution distante rejetée : {violation_count} violation(s) de clé étrangère."
            ));
        }
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('apply_origin', 'local', unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [],
        )
        .map_err(|error| error.to_string())?;
        tx.commit().map_err(|error| error.to_string())
    }

    /// Conflits ouverts avec l'élément SharePoint à relire (id du conflit, sinon
    /// celui du mapping). Sert à reconnaître nos propres écritures après coup.
    pub fn workspace_sync_list_open_conflict_targets(
        &self,
        limit: usize,
    ) -> Result<Vec<OpenConflictTarget>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT c.id, c.table_name, c.record_key,
                        COALESCE(c.remote_item_id, r.remote_item_id)
                 FROM workspace_conflicts c
                 LEFT JOIN workspace_remote_records r
                   ON r.table_name = c.table_name AND r.record_key = c.record_key
                 WHERE c.status = 'open' AND c.remote_deleted = 0
                 ORDER BY c.id
                 LIMIT ?1",
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(OpenConflictTarget {
                    conflict_id: row.get(0)?,
                    table_name: row.get(1)?,
                    record_key: row.get(2)?,
                    remote_item_id: row.get(3)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())
    }

    /// Ferme un conflit dont la version distante est en fait la nôtre : on garde
    /// la version locale en attente et on retient l'ETag distant pour le PATCH.
    pub fn workspace_sync_resolve_own_conflict(
        &self,
        conflict_id: i64,
        table_name: &str,
        record_key: &str,
        remote_item_id: &str,
        remote_etag: &str,
    ) -> Result<(), String> {
        match self.workspace_sync_resolve_conflict_keep_local(conflict_id) {
            Ok(()) => {}
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
            Err(error) => return Err(error.to_string()),
        }
        self.workspace_sync_upsert_remote_mapping(table_name, record_key, remote_item_id, remote_etag)
            .map_err(|error| error.to_string())
    }

    /// Ferme les conflits dont les deux versions sont identiques (écho d'un envoi
    /// non acquitté). La comparaison porte sur la version locale **en attente**,
    /// pas sur le snapshot figé : une retouche faite depuis reste un vrai conflit.
    /// Retourne le nombre de conflits fermés.
    pub fn workspace_sync_auto_resolve_identical_conflicts(&self) -> Result<usize, String> {
        let candidates: Vec<(i64, String, String, Option<String>)> = {
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT c.id, c.table_name, c.record_key, c.remote_payload_json
                     FROM workspace_conflicts c
                     WHERE c.status = 'open' AND c.remote_deleted = 0
                     ORDER BY c.id",
                )
                .map_err(|error| error.to_string())?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|error| error.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|error| error.to_string())?
        };
        let mut resolved = 0;
        for (conflict_id, table_name, record_key, remote_json) in candidates {
            let remote = remote_json
                .as_deref()
                .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
                .and_then(|value| value.as_object().cloned());
            let pending_local: Option<String> = self
                .conn
                .query_row(
                    "SELECT payload_json FROM workspace_sync_queue
                     WHERE table_name = ?1 AND record_key = ?2 AND synced_at IS NULL
                       AND operation = 'upsert'",
                    params![table_name, record_key],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| error.to_string())?
                .flatten();
            if !payloads_are_identical(pending_local.as_deref(), remote.as_ref()) {
                continue;
            }
            self.workspace_sync_resolve_conflict_accept_remote(conflict_id)?;
            resolved += 1;
        }
        Ok(resolved)
    }

    pub fn workspace_sync_apply_remote_delta(
        &self,
        changes: &[WorkspaceRemoteDeltaChange],
        delta_link: &str,
    ) -> Result<(), String> {
        self.workspace_sync_apply_remote_delta_for_actor(changes, delta_link, None)
    }

    /// Applique le delta en connaissant l'identité Microsoft de ce poste : une
    /// ligne distante écrite par ce même compte est une écriture antérieure de
    /// ce poste (envoi non acquitté), jamais un conflit — la version locale en
    /// attente est plus récente et sera renvoyée avec le bon ETag.
    ///
    /// Limite assumée : une même personne sur deux postes partage cette identité.
    pub fn workspace_sync_apply_remote_delta_for_actor(
        &self,
        changes: &[WorkspaceRemoteDeltaChange],
        delta_link: &str,
        local_actor_id: Option<&str>,
    ) -> Result<(), String> {
        if delta_link.trim().is_empty() {
            return Err("DeltaLink SharePoint vide.".into());
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        tx.execute("PRAGMA defer_foreign_keys = ON", [])
            .map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('apply_origin', 'remote', unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [],
        )
        .map_err(|error| error.to_string())?;

        for change in changes {
            if !is_table_exportable(&change.table_name) {
                return Err(format!(
                    "Table distante non partagée : {}.",
                    change.table_name
                ));
            }
            let columns = table_columns(&tx, &change.table_name)?;
            let staged_payload = change
                .payload
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|error| error.to_string())?;
            tx.execute(
                "INSERT INTO workspace_inbound_stage
                    (remote_item_id, remote_etag, sync_key, payload_json, deleted, received_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())
                 ON CONFLICT(remote_item_id) DO UPDATE SET
                    remote_etag = excluded.remote_etag,
                    sync_key = excluded.sync_key,
                    payload_json = excluded.payload_json,
                    deleted = excluded.deleted,
                    received_at = excluded.received_at",
                params![
                    change.remote_item_id,
                    change.remote_etag,
                    crate::workspace::migration::compute_sync_key(
                        &change.table_name,
                        &change.record_key
                    ),
                    staged_payload,
                    change.deleted
                ],
            )
            .map_err(|error| error.to_string())?;

            if has_pending_local_change(&tx, &change.table_name, &change.record_key)
                .map_err(|error| error.to_string())?
            {
                if pending_local_change_is_echo(&tx, change).map_err(|error| error.to_string())? {
                    acknowledge_pending_local_change(&tx, &change.table_name, &change.record_key)
                        .map_err(|error| error.to_string())?;
                    persist_remote_mapping(&tx, change).map_err(|error| error.to_string())?;
                    continue;
                }
                if is_own_remote_write(change, local_actor_id) {
                    // Notre propre révision antérieure : on retient l'ETag pour le
                    // prochain envoi et on garde la version locale, plus récente.
                    persist_remote_mapping(&tx, change).map_err(|error| error.to_string())?;
                    close_open_conflicts_keep_local(&tx, &change.table_name, &change.record_key)
                        .map_err(|error| error.to_string())?;
                    continue;
                }
                record_conflict(&tx, change).map_err(|error| error.to_string())?;
                persist_remote_mapping(&tx, change).map_err(|error| error.to_string())?;
                continue;
            }
            if change.deleted {
                delete_remote_record(&tx, change, &columns)?;
            } else {
                upsert_remote_record(&tx, change, &columns)?;
            }
            persist_remote_mapping(&tx, change).map_err(|error| error.to_string())?;
        }

        let violation_count: i64 = tx
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        if violation_count > 0 {
            return Err(format!(
                "Delta SharePoint rejeté : {violation_count} violation(s) de clé étrangère."
            ));
        }
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('crm_data_delta_link', ?1, unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![delta_link],
        )
        .map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT INTO workspace_sync_state (key, value, updated_at)
             VALUES ('apply_origin', 'local', unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [],
        )
        .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM workspace_inbound_stage", [])
            .map_err(|error| error.to_string())?;
        tx.commit().map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contact_change(name: &str, etag: &str) -> WorkspaceRemoteDeltaChange {
        WorkspaceRemoteDeltaChange {
            remote_item_id: "sp-1".into(),
            remote_etag: Some(etag.into()),
            table_name: "contacts".into(),
            record_key: r#"[{"column":"id","kind":"integer","value":1}]"#.into(),
            payload: Some(
                serde_json::json!({
                    "id": {"kind":"integer","value":1},
                    "nom": {"kind":"text","value":name},
                    "prenom": {"kind":"text","value":"Jean"},
                    "categorie": {"kind":"text","value":"CLIENT"}
                })
                .as_object()
                .unwrap()
                .clone(),
            ),
            deleted: false,
            updated_by: None,
        }
    }

    #[test]
    fn remote_delta_is_atomic_and_does_not_feed_the_outbox() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_sync_set_capture_enabled(true).unwrap();
        db.workspace_sync_apply_remote_delta(
            &[contact_change("DUPONT", "\"2\"")],
            "https://graph.microsoft.com/delta?token=2",
        )
        .unwrap();
        let name: String = db
            .connection()
            .query_row("SELECT nom FROM contacts WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name, "DUPONT");
        assert!(db.workspace_sync_list_pending().unwrap().is_empty());
    }

    #[test]
    fn local_and_remote_edits_create_a_conflict_without_overwriting_local_data() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (id, nom, prenom, categorie)
                 VALUES (1, 'LOCAL', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap();
        db.workspace_sync_enqueue(
            "contacts",
            r#"[{"column":"id","kind":"integer","value":1}]"#,
            "upsert",
            Some(r#"{"nom":{"kind":"text","value":"LOCAL"}}"#),
        )
        .unwrap();
        db.workspace_sync_apply_remote_delta(
            &[contact_change("DISTANT", "\"3\"")],
            "https://graph.microsoft.com/delta?token=3",
        )
        .unwrap();
        let name: String = db
            .connection()
            .query_row("SELECT nom FROM contacts WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name, "LOCAL");
        let conflicts: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM workspace_conflicts WHERE status = 'open'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(conflicts, 1);

        let conflict_id: i64 = db
            .connection()
            .query_row(
                "SELECT id FROM workspace_conflicts WHERE status = 'open'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        db.workspace_sync_resolve_conflict_accept_remote(conflict_id)
            .unwrap();
        let resolved_name: String = db
            .connection()
            .query_row("SELECT nom FROM contacts WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(resolved_name, "DISTANT");
        assert!(db.workspace_sync_list_pending().unwrap().is_empty());
    }

    #[test]
    fn echo_of_an_unacknowledged_push_is_acknowledged_not_conflicted() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (id, nom, prenom, categorie)
                 VALUES (1, 'DUPONT', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap();
        let change = contact_change("DUPONT", "\"2\"");
        let local_payload = serde_json::to_string(change.payload.as_ref().unwrap()).unwrap();
        db.workspace_sync_enqueue(
            "contacts",
            r#"[{"column":"id","kind":"integer","value":1}]"#,
            "upsert",
            Some(&local_payload),
        )
        .unwrap();
        // Un conflit déjà ouvert sur cette ligne doit se fermer avec l'écho.
        db.connection()
            .execute(
                "INSERT INTO workspace_conflicts
                    (table_name, record_key, local_payload_json, remote_payload_json,
                     remote_etag, remote_item_id, remote_deleted)
                 VALUES ('contacts', ?1, ?2, ?3, '\"1\"', 'sp-1', 0)",
                params![
                    change.record_key,
                    local_payload,
                    r#"{"nom":{"kind":"text","value":"ANCIEN"}}"#
                ],
            )
            .unwrap();

        db.workspace_sync_apply_remote_delta(&[change], "https://graph.microsoft.com/delta?token=2")
            .unwrap();

        let conflicts: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM workspace_conflicts WHERE status = 'open'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(conflicts, 0);
        assert!(db.workspace_sync_list_pending().unwrap().is_empty());
        let mapping = db
            .workspace_sync_get_remote_mapping(
                "contacts",
                r#"[{"column":"id","kind":"integer","value":1}]"#,
            )
            .unwrap()
            .expect("mapping distant");
        assert_eq!(mapping.remote_item_id.as_deref(), Some("sp-1"));
    }

    #[test]
    fn own_earlier_write_returning_with_a_newer_local_revision_is_not_a_conflict() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (id, nom, prenom, categorie)
                 VALUES (1, 'DUPONT', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap();
        // Révision 2 locale : contenu différent de ce qui est parti en révision 1.
        db.workspace_sync_enqueue(
            "contacts",
            r#"[{"column":"id","kind":"integer","value":1}]"#,
            "upsert",
            Some(r#"{"nom":{"kind":"text","value":"DUPONT-REV2"}}"#),
        )
        .unwrap();
        // Un conflit déjà ouvert (ancienne version du CRM) sur la même ligne.
        db.connection()
            .execute(
                "INSERT INTO workspace_conflicts
                    (table_name, record_key, local_payload_json, remote_payload_json,
                     remote_etag, remote_item_id, remote_deleted)
                 VALUES ('contacts', ?1, '{}', '{}', '\"1\"', 'sp-1', 0)",
                params![r#"[{"column":"id","kind":"integer","value":1}]"#],
            )
            .unwrap();
        let mut echo = contact_change("DUPONT", "\"1\"");
        echo.updated_by = Some("actor-tony".into());

        db.workspace_sync_apply_remote_delta_for_actor(
            &[echo],
            "https://graph.microsoft.com/delta?token=2",
            Some("actor-tony"),
        )
        .unwrap();

        // Pas de nouveau conflit, l'ancien est fermé, la ligne locale n'a pas bougé.
        let open: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM workspace_conflicts WHERE status = 'open'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(open, 0);
        let name: String = db
            .connection()
            .query_row("SELECT nom FROM contacts WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(name, "DUPONT");
        // La révision 2 reste à envoyer, avec l'ETag distant mémorisé pour le PATCH.
        assert_eq!(db.workspace_sync_list_pending().unwrap().len(), 1);
        let mapping = db
            .workspace_sync_get_remote_mapping(
                "contacts",
                r#"[{"column":"id","kind":"integer","value":1}]"#,
            )
            .unwrap()
            .expect("mapping distant");
        assert_eq!(mapping.remote_etag.as_deref(), Some("\"1\""));

        // Écrit par quelqu'un d'autre : reste un vrai conflit.
        let mut other = contact_change("DISTANT", "\"5\"");
        other.updated_by = Some("actor-violette".into());
        db.workspace_sync_apply_remote_delta_for_actor(
            &[other],
            "https://graph.microsoft.com/delta?token=3",
            Some("actor-tony"),
        )
        .unwrap();
        let open: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM workspace_conflicts WHERE status = 'open'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(open, 1);
    }

    #[test]
    fn identical_open_conflicts_are_closed_automatically() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (id, nom, prenom, categorie)
                 VALUES (1, 'DUPONT', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap();
        let change = contact_change("DUPONT", "\"2\"");
        let payload_json = serde_json::to_string(change.payload.as_ref().unwrap()).unwrap();
        // Écho : la version en attente est identique au distant.
        db.workspace_sync_enqueue("contacts", &change.record_key, "upsert", Some(&payload_json))
            .unwrap();
        db.connection()
            .execute(
                "INSERT INTO workspace_conflicts
                    (table_name, record_key, local_payload_json, remote_payload_json,
                     remote_etag, remote_item_id, remote_deleted)
                 VALUES ('contacts', ?1, ?2, ?2, '\"2\"', 'sp-1', 0)",
                params![change.record_key, payload_json],
            )
            .unwrap();
        // Vrai conflit : le snapshot figé était identique, mais l'utilisateur a
        // retouché la fiche depuis. On ne doit pas écraser cette retouche.
        let record_key_2 = r#"[{"column":"id","kind":"integer","value":2}]"#;
        db.workspace_sync_enqueue(
            "contacts",
            record_key_2,
            "upsert",
            Some(r#"{"nom":{"kind":"text","value":"RETOUCHE"}}"#),
        )
        .unwrap();
        db.connection()
            .execute(
                "INSERT INTO workspace_conflicts
                    (table_name, record_key, local_payload_json, remote_payload_json,
                     remote_etag, remote_item_id, remote_deleted)
                 VALUES ('contacts', ?1, ?2, ?2, '\"3\"', 'sp-2', 0)",
                params![record_key_2, r#"{"nom":{"kind":"text","value":"A"}}"#],
            )
            .unwrap();

        let resolved = db.workspace_sync_auto_resolve_identical_conflicts().unwrap();
        assert_eq!(resolved, 1);
        let remaining: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM workspace_conflicts WHERE status = 'open'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 1);
        let pending = db.workspace_sync_list_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].record_key, record_key_2);
    }

    #[test]
    fn invalid_delta_rolls_back_data_and_delta_token() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let mut invalid = contact_change("DUPONT", "\"2\"");
        invalid.record_key = r#"[{"column":"id","kind":"integer","value":99}]"#.into();
        assert!(db
            .workspace_sync_apply_remote_delta(
                &[invalid],
                "https://graph.microsoft.com/delta?token=bad"
            )
            .is_err());
        let contacts: i64 = db
            .connection()
            .query_row("SELECT COUNT(*) FROM contacts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(contacts, 0);
        let tokens: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM workspace_sync_state WHERE key = 'crm_data_delta_link'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tokens, 0);
    }

    #[test]
    fn accepting_remote_delete_discards_pending_local_change() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (id, nom, prenom, categorie)
                 VALUES (1, 'LOCAL', 'Jean', 'CLIENT')",
                [],
            )
            .unwrap();
        let record_key = r#"[{"column":"id","kind":"integer","value":1}]"#;
        db.workspace_sync_enqueue(
            "contacts",
            record_key,
            "upsert",
            Some(r#"{"nom":{"kind":"text","value":"LOCAL"}}"#),
        )
        .unwrap();
        let deletion = WorkspaceRemoteDeltaChange {
            remote_item_id: "sp-1".into(),
            remote_etag: Some("\"4\"".into()),
            table_name: "contacts".into(),
            record_key: record_key.into(),
            payload: None,
            deleted: true,
            updated_by: None,
        };
        db.workspace_sync_apply_remote_delta(
            &[deletion],
            "https://graph.microsoft.com/delta?token=4",
        )
        .unwrap();
        let conflict_id = db
            .workspace_sync_list_open_conflicts()
            .unwrap()
            .remove(0)
            .id;

        db.workspace_sync_resolve_conflict_accept_remote(conflict_id)
            .unwrap();

        let contact_count: i64 = db
            .connection()
            .query_row("SELECT COUNT(*) FROM contacts WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(contact_count, 0);
        assert!(db.workspace_sync_list_pending().unwrap().is_empty());
    }
}
