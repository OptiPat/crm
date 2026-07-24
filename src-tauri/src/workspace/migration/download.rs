//! Téléchargement CRM_Data SharePoint → snapshot migration + validation mémoire (lecture seule).

use super::sync_key::compute_sync_key;
use super::upload::{payload_exceeds_sharepoint_limit, MAX_SHAREPOINT_PAYLOAD_JSON_BYTES};
use crate::database::workspace_restore::{table_counts_for_snapshot_records, validate_snapshot_in_memory};
use crate::database::workspace_sync::{
    snapshot_checksum, SnapshotRecord, TableRecordCount, TeamMigrationSnapshot,
    WORKSPACE_SYNC_SCHEMA_VERSION,
};
use crate::database::Database;
use crate::workspace::collaboration::require_provisioned_team_workspace;
use crate::workspace::guard::resolve_sharepoint_site_ref;
use crate::workspace::sharepoint::{
    ParsedSharePointListItem, SharePointGraphClient, LIST_CRM_DATA,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashSet};
use tauri::AppHandle;

use crate::workspace::commands::resolve_microsoft_team_connection;
use crate::database::workspace::WorkspaceConfig;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMigrationValidateReport {
    pub valid: bool,
    pub checksum: String,
    pub expected_checksum: String,
    pub checksum_match: bool,
    pub table_counts: Vec<TableRecordCount>,
    pub total_records: usize,
    pub tombstone_count: usize,
    pub foreign_key_ok: bool,
    pub integrity_ok: bool,
    pub errors: Vec<String>,
}

fn field_string(fields: &Value, name: &str) -> Option<String> {
    fields
        .get(name)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn field_bool(fields: &Value, name: &str) -> bool {
    match fields.get(name) {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "true" | "1" | "yes"
        ),
        Some(Value::Number(value)) => value.as_i64().is_some_and(|n| n != 0),
        _ => false,
    }
}

pub(crate) fn remote_item_record_identity(
    item: &ParsedSharePointListItem,
) -> Option<(String, String)> {
    if field_bool(&item.fields, "Deleted") {
        return None;
    }
    Some((
        field_string(&item.fields, "TableName")?,
        field_string(&item.fields, "RecordKey")?,
    ))
}

fn parse_payload_map(payload_json: &str, sync_key: &str) -> Result<Map<String, Value>, String> {
    let parsed: Value = serde_json::from_str(payload_json).map_err(|error| {
        format!("PayloadJson illisible (SyncKey {sync_key}) : {error}")
    })?;
    parsed
        .as_object()
        .cloned()
        .ok_or_else(|| format!("PayloadJson doit être un objet JSON (SyncKey {sync_key})."))
}

/// Simule des éléments CRM_Data distants à partir d'un snapshot local (tests).
#[cfg(test)]
pub fn snapshot_to_crm_data_items(
    snapshot: &TeamMigrationSnapshot,
) -> Result<Vec<ParsedSharePointListItem>, String> {
    let mut items = Vec::with_capacity(snapshot.records.len());
    for record in &snapshot.records {
        let sync_key = compute_sync_key(&record.table_name, &record.record_key);
        let payload_json = serde_json::to_string(&record.payload)
            .map_err(|error| format!("Sérialisation PayloadJson : {error}"))?;
        items.push(ParsedSharePointListItem {
            id: format!("sim-{sync_key}"),
            etag: "\"sim\"".into(),
            fields: serde_json::json!({
                "SyncKey": sync_key,
                "TableName": record.table_name,
                "RecordKey": record.record_key,
                "PayloadJson": payload_json,
                "Deleted": false,
            }),
        });
    }
    Ok(items)
}

/// Reconstruit un snapshot migration depuis des éléments CRM_Data (Deleted ignorés).
pub fn rebuild_snapshot_from_remote_items(
    items: &[ParsedSharePointListItem],
) -> Result<(TeamMigrationSnapshot, usize, Vec<String>), String> {
    let mut errors = Vec::new();
    let mut seen_sync_keys = HashSet::new();
    let mut tombstone_count = 0_usize;
    let mut records = Vec::new();
    let mut table_counts = BTreeMap::new();

    for item in items {
        let Some(sync_key) = field_string(&item.fields, "SyncKey") else {
            errors.push(format!("Élément SharePoint {} sans SyncKey.", item.id));
            continue;
        };
        if !seen_sync_keys.insert(sync_key.clone()) {
            return Err(format!("SyncKey dupliquée : {sync_key}."));
        }

        if field_bool(&item.fields, "Deleted") {
            tombstone_count += 1;
            continue;
        }

        let Some(table_name) = field_string(&item.fields, "TableName") else {
            errors.push(format!("SyncKey {sync_key} sans TableName."));
            continue;
        };
        let Some(record_key) = field_string(&item.fields, "RecordKey") else {
            errors.push(format!("SyncKey {sync_key} sans RecordKey."));
            continue;
        };
        let expected_sync_key = compute_sync_key(&table_name, &record_key);
        if expected_sync_key != sync_key {
            errors.push(format!(
                "SyncKey incohérente pour {table_name} / {record_key} (attendu {expected_sync_key}, reçu {sync_key})."
            ));
            continue;
        }

        let Some(payload_json) = field_string(&item.fields, "PayloadJson") else {
            errors.push(format!("SyncKey {sync_key} sans PayloadJson."));
            continue;
        };
        if payload_exceeds_sharepoint_limit(&payload_json) {
            errors.push(format!(
                "PayloadJson trop volumineux ({}/{} octets) — SyncKey {sync_key}.",
                payload_json.len(),
                MAX_SHAREPOINT_PAYLOAD_JSON_BYTES
            ));
            continue;
        }

        let payload = match parse_payload_map(&payload_json, &sync_key) {
            Ok(payload) => payload,
            Err(message) => {
                errors.push(message);
                continue;
            }
        };

        table_counts
            .entry(table_name.clone())
            .and_modify(|count| *count += 1)
            .or_insert(1);
        records.push(SnapshotRecord {
            table_name,
            record_key,
            payload,
        });
    }

    records.sort_by(|left, right| {
        left.table_name
            .cmp(&right.table_name)
            .then_with(|| left.record_key.cmp(&right.record_key))
    });

    let snapshot = TeamMigrationSnapshot {
        schema_version: WORKSPACE_SYNC_SCHEMA_VERSION,
        generated_at: Utc::now().to_rfc3339(),
        table_counts,
        records,
    };
    Ok((snapshot, tombstone_count, errors))
}

pub fn validate_rebuilt_snapshot_in_memory(
    snapshot: &TeamMigrationSnapshot,
    expected_checksum: &str,
    tombstone_count: usize,
    parse_errors: Vec<String>,
) -> TeamMigrationValidateReport {
    let mut errors = parse_errors;
    let mut snapshot = snapshot.clone();
    if errors.is_empty() {
        match Database::open_in_memory_workspace_cache() {
            Ok(db) => {
                match table_counts_for_snapshot_records(db.connection(), &snapshot.records) {
                    Ok(counts) => snapshot.table_counts = counts,
                    Err(message) => errors.push(message),
                }
            }
            Err(error) => errors.push(format!("Base mémoire workspace : {error}")),
        }
    }
    let restore = validate_snapshot_in_memory(&snapshot, expected_checksum);
    errors.extend(restore.errors.clone());

    let table_counts = restore
        .table_counts
        .iter()
        .map(|(table_name, count)| TableRecordCount {
            table_name: table_name.clone(),
            count: *count,
        })
        .collect();

    TeamMigrationValidateReport {
        valid: restore.valid && errors.is_empty(),
        checksum: restore.checksum,
        expected_checksum: restore.expected_checksum,
        checksum_match: restore.checksum_match,
        table_counts,
        total_records: restore.total_records,
        tombstone_count,
        foreign_key_ok: restore.foreign_key_ok,
        integrity_ok: restore.integrity_ok,
        errors,
    }
}

struct MigrationDownloadSession {
    client: SharePointGraphClient,
    access_token: String,
    site_id: String,
    list_id: String,
}

fn open_migration_download_session(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<MigrationDownloadSession, String> {
    require_provisioned_team_workspace(config)?;
    let connection = resolve_microsoft_team_connection(app)?
        .ok_or_else(|| "Connectez d'abord un compte Microsoft équipe.".to_string())?;
    let site_id = config
        .site_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "Espace équipe non provisionné sur SharePoint.".to_string()
        })?
        .to_string();
    let site = resolve_sharepoint_site_ref(config)?;
    let client = SharePointGraphClient::new(site);
    let list_id = client
        .find_list_by_display_name_blocking(
            &connection.access_token,
            &site_id,
            LIST_CRM_DATA,
        )?
        .map(|list| list.id)
        .ok_or_else(|| format!("Liste SharePoint introuvable : {LIST_CRM_DATA}"))?;
    Ok(MigrationDownloadSession {
        client,
        access_token: connection.access_token,
        site_id,
        list_id,
    })
}

pub fn validate_team_remote_snapshot(
    app: &AppHandle,
    config: &WorkspaceConfig,
    expected_checksum: &str,
) -> Result<TeamMigrationValidateReport, String> {
    let session = open_migration_download_session(app, config)?;
    let remote_items = session.client.list_items_all_blocking(
        &session.access_token,
        &session.site_id,
        &session.list_id,
        None,
    )?;

    let (snapshot, tombstone_count, parse_errors) = rebuild_snapshot_from_remote_items(&remote_items)?;
    let mut report = validate_rebuilt_snapshot_in_memory(
        &snapshot,
        expected_checksum,
        tombstone_count,
        parse_errors,
    );

    if report.checksum_match && report.valid {
        let recalculated = snapshot_checksum(&snapshot);
        if recalculated != report.expected_checksum {
            report.valid = false;
            report.checksum_match = false;
            report.errors.push(format!(
                "Checksum recalculé divergent ({recalculated} vs {}).",
                report.expected_checksum
            ));
        }
    }

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use serde_json::json;

    #[test]
    fn rejects_duplicate_sync_key() {
        let items = vec![
            ParsedSharePointListItem {
                id: "1".into(),
                etag: "\"1\"".into(),
                fields: json!({
                    "SyncKey": "dup",
                    "TableName": "foyers",
                    "RecordKey": "rowid:1",
                    "PayloadJson": r#"{"nom":{"kind":"text","value":"A"}}"#,
                    "Deleted": false,
                }),
            },
            ParsedSharePointListItem {
                id: "2".into(),
                etag: "\"2\"".into(),
                fields: json!({
                    "SyncKey": "dup",
                    "TableName": "foyers",
                    "RecordKey": "rowid:2",
                    "PayloadJson": r#"{"nom":{"kind":"text","value":"B"}}"#,
                    "Deleted": false,
                }),
            },
        ];
        let err = rebuild_snapshot_from_remote_items(&items).unwrap_err();
        assert!(err.contains("dupliquée"));
    }

    #[test]
    fn tombstones_are_counted_and_skipped() {
        let sync_key = compute_sync_key("foyers", "rowid:9");
        let items = vec![ParsedSharePointListItem {
            id: "9".into(),
            etag: "\"9\"".into(),
            fields: json!({
                "SyncKey": sync_key,
                "TableName": "foyers",
                "RecordKey": "rowid:9",
                "PayloadJson": r#"{"nom":{"kind":"text","value":"TOMB"}}"#,
                "Deleted": true,
            }),
        }];
        let (snapshot, tombstones, errors) =
            rebuild_snapshot_from_remote_items(&items).unwrap();
        assert_eq!(tombstones, 1);
        assert!(snapshot.records.is_empty());
        assert!(errors.is_empty());
    }

    #[test]
    fn rejects_sync_key_mismatch() {
        let items = vec![ParsedSharePointListItem {
            id: "1".into(),
            etag: "\"1\"".into(),
            fields: json!({
                "SyncKey": "bad-key",
                "TableName": "foyers",
                "RecordKey": "rowid:1",
                "PayloadJson": r#"{"nom":{"kind":"text","value":"A"}}"#,
                "Deleted": false,
            }),
        }];
        let (_snapshot, _tombstones, errors) =
            rebuild_snapshot_from_remote_items(&items).unwrap();
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("incohérente"));
    }

    #[test]
    fn roundtrip_via_snapshot_to_items_and_back() {
        let db = Database::open_in_memory_workspace_cache().unwrap();
        db.connection()
            .execute_batch(
                "INSERT INTO foyers (nom, type_foyer) VALUES ('FOYER TEST', 'COUPLE');",
            )
            .unwrap();
        let source =
            crate::database::workspace_sync::build_team_migration_snapshot(&db).unwrap();
        let expected = snapshot_checksum(&source);
        let items = snapshot_to_crm_data_items(&source).unwrap();
        let (rebuilt, tombstones, errors) =
            rebuild_snapshot_from_remote_items(&items).unwrap();
        assert_eq!(tombstones, 0);
        assert!(errors.is_empty());
        let report = validate_rebuilt_snapshot_in_memory(&rebuilt, &expected, 0, errors);
        assert!(report.valid, "{:?}", report.errors);
    }
}
