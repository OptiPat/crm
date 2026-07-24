//! Orchestration upload snapshot → CRM_Data SharePoint.

use super::plan::{plan_migration_item_action, MigrationItemAction, RemoteCrmDataItem};
use super::sync_key::{compute_mutation_id, compute_payload_checksum, compute_sync_key};
use crate::commands::DbState;
use crate::database::workspace_sync::{
    build_team_migration_snapshot, snapshot_checksum, SnapshotRecord, TeamMigrationSnapshot,
    WORKSPACE_SYNC_SCHEMA_VERSION,
};
use crate::database::Database;
use crate::workspace::collaboration::require_provisioned_team_workspace;
use crate::workspace::guard::resolve_sharepoint_site_ref;
use crate::workspace::sharepoint::{
    GraphWriteConflict, GraphWriteOutcome, ParsedSharePointListItem, SharePointGraphClient,
    LIST_CRM_DATA,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use tauri::AppHandle;

use crate::workspace::commands::resolve_microsoft_team_connection;
use crate::database::workspace::WorkspaceConfig;

pub const MAX_SHAREPOINT_PAYLOAD_JSON_BYTES: usize = 60_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMigrationUploadError {
    pub table_name: String,
    pub record_key: String,
    pub sync_key: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMigrationUploadReport {
    pub created: usize,
    pub updated: usize,
    pub skipped: usize,
    pub failed: usize,
    pub errors: Vec<TeamMigrationUploadError>,
    pub checksum: String,
    pub complete: bool,
}

struct MigrationUploadSession {
    client: SharePointGraphClient,
    access_token: String,
    site_id: String,
    list_id: String,
    updated_by: String,
}

pub fn payload_json_string(payload: &Map<String, Value>) -> Result<String, String> {
    serde_json::to_string(payload).map_err(|error| format!("Sérialisation PayloadJson : {error}"))
}

pub fn validate_expected_checksum(
    snapshot: &TeamMigrationSnapshot,
    expected_checksum: &str,
) -> Result<(), String> {
    let actual = snapshot_checksum(snapshot);
    if actual == expected_checksum.trim() {
        Ok(())
    } else {
        Err(format!(
            "Checksum migration obsolète (attendu {expected_checksum}, recalculé {actual}). \
             Regénérez l'aperçu avant l'envoi."
        ))
    }
}

pub fn payload_exceeds_sharepoint_limit(payload_json: &str) -> bool {
    payload_json.len() > MAX_SHAREPOINT_PAYLOAD_JSON_BYTES
}

fn field_string(fields: &Value, name: &str) -> Option<String> {
    fields
        .get(name)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn build_remote_sync_key_map(
    items: &[ParsedSharePointListItem],
) -> HashMap<String, RemoteCrmDataItem> {
    let mut map = HashMap::new();
    for item in items {
        let Some(sync_key) = field_string(&item.fields, "SyncKey") else {
            continue;
        };
        map.insert(
            sync_key.clone(),
            RemoteCrmDataItem {
                item_id: item.id.clone(),
                etag: item.etag.clone(),
                sync_key,
                payload_json: field_string(&item.fields, "PayloadJson"),
            },
        );
    }
    map
}

fn build_crm_data_fields(
    sync_key: &str,
    record: &SnapshotRecord,
    payload_json: &str,
    updated_at: &str,
    updated_by: &str,
) -> Value {
    json!({
        "SyncKey": sync_key,
        "TableName": record.table_name,
        "RecordKey": record.record_key,
        "PayloadJson": payload_json,
        "PayloadChecksum": compute_payload_checksum(payload_json),
        "MutationId": compute_mutation_id(sync_key, 0),
        "SchemaVersion": WORKSPACE_SYNC_SCHEMA_VERSION,
        "Deleted": false,
        "UpdatedAt": updated_at,
        "UpdatedBy": updated_by,
    })
}

fn open_migration_upload_session(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<MigrationUploadSession, String> {
    require_provisioned_team_workspace(config)?;
    let connection = resolve_microsoft_team_connection(app)?
        .ok_or_else(|| "Connectez d'abord un compte Microsoft équipe.".to_string())?;
    let site_id = config
        .site_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "Espace équipe non provisionné sur SharePoint. Le conseiller doit lancer le provisionnement.".to_string()
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
    Ok(MigrationUploadSession {
        client,
        access_token: connection.access_token,
        site_id,
        list_id,
        updated_by: connection.email,
    })
}

fn graph_conflict_message(conflict: &GraphWriteConflict) -> String {
    match conflict {
        GraphWriteConflict::PreconditionFailed(details) => format!(
            "Conflit ETag SharePoint (412) — attendu {}, distant {:?}",
            details.expected_etag, details.actual_etag
        ),
        GraphWriteConflict::NotFound => {
            "Élément SharePoint introuvable (404) — reprise possible après resynchronisation."
                .into()
        }
        GraphWriteConflict::VersionMismatch { local, remote } => format!(
            "Version SharePoint divergente — local {} vs distant {}",
            local.etag, remote.etag
        ),
    }
}

fn with_database<T>(
    db: &DbState,
    operation: impl FnOnce(&Database) -> Result<T, String>,
) -> Result<T, String> {
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    operation(database)
}

fn persist_remote_mapping(
    db: &DbState,
    record: &SnapshotRecord,
    item_id: &str,
    etag: &str,
) -> Result<(), String> {
    with_database(db, |database| {
        database
            .workspace_sync_upsert_remote_mapping(
                &record.table_name,
                &record.record_key,
                item_id,
                etag,
            )
            .map_err(|error| format!("Enregistrement mapping local : {error}"))
    })
}

fn apply_create(
    session: &MigrationUploadSession,
    fields: Value,
) -> Result<ParsedSharePointListItem, String> {
    session.client.create_list_item_blocking(
        &session.access_token,
        &session.site_id,
        &session.list_id,
        fields,
    )
}

fn apply_update(
    session: &MigrationUploadSession,
    item_id: &str,
    etag: &str,
    fields: Value,
) -> Result<ParsedSharePointListItem, String> {
    let outcome = session.client.patch_list_item_fields_blocking(
        &session.access_token,
        &session.site_id,
        &session.list_id,
        item_id,
        etag,
        fields.clone(),
    )?;
    match outcome {
        GraphWriteOutcome::Applied { entity } => Ok(ParsedSharePointListItem {
            id: entity.id,
            etag: entity.etag,
            fields,
        }),
        GraphWriteOutcome::Conflict(conflict) => Err(graph_conflict_message(&conflict)),
    }
}

struct PreparedRecord {
    record: SnapshotRecord,
    sync_key: String,
    payload_json: String,
}

fn prepare_records(snapshot: &TeamMigrationSnapshot) -> (Vec<PreparedRecord>, Vec<TeamMigrationUploadError>) {
    let mut prepared = Vec::with_capacity(snapshot.records.len());
    let mut errors = Vec::new();
    for record in &snapshot.records {
        let sync_key = compute_sync_key(&record.table_name, &record.record_key);
        let payload_json = match payload_json_string(&record.payload) {
            Ok(json) => json,
            Err(message) => {
                errors.push(TeamMigrationUploadError {
                    table_name: record.table_name.clone(),
                    record_key: record.record_key.clone(),
                    sync_key: sync_key.clone(),
                    message,
                });
                continue;
            }
        };
        if payload_exceeds_sharepoint_limit(&payload_json) {
            errors.push(TeamMigrationUploadError {
                table_name: record.table_name.clone(),
                record_key: record.record_key.clone(),
                sync_key,
                message: format!(
                    "PayloadJson trop volumineux ({}/{} octets) — non envoyé.",
                    payload_json.len(),
                    MAX_SHAREPOINT_PAYLOAD_JSON_BYTES
                ),
            });
            continue;
        }
        prepared.push(PreparedRecord {
            record: record.clone(),
            sync_key,
            payload_json,
        });
    }
    (prepared, errors)
}

pub fn upload_team_migration_snapshot(
    app: &AppHandle,
    db: &DbState,
    config: &WorkspaceConfig,
    expected_checksum: &str,
) -> Result<TeamMigrationUploadReport, String> {
    let snapshot = with_database(db, |database| {
        build_team_migration_snapshot(database)
            .map_err(|error| format!("Snapshot migration impossible : {error}"))
    })?;
    validate_expected_checksum(&snapshot, expected_checksum)?;

    let checksum = snapshot_checksum(&snapshot);
    let session = open_migration_upload_session(app, config)?;

    let remote_items = session.client.list_items_all_blocking(
        &session.access_token,
        &session.site_id,
        &session.list_id,
        None,
    )?;
    let remote_by_sync_key = build_remote_sync_key_map(&remote_items);

    let (prepared, mut errors) = prepare_records(&snapshot);
    let mut created = 0_usize;
    let mut updated = 0_usize;
    let mut skipped = 0_usize;
    let mut failed = errors.len();
    let updated_at = Utc::now().to_rfc3339();

    for item in prepared {
        let remote = remote_by_sync_key.get(&item.sync_key);
        let action = plan_migration_item_action(&item.payload_json, remote);
        let fields = build_crm_data_fields(
            &item.sync_key,
            &item.record,
            &item.payload_json,
            &updated_at,
            &session.updated_by,
        );

        let write_result: Result<(ParsedSharePointListItem, &'static str), String> = match action {
            MigrationItemAction::Skip => {
                if let Some(remote_item) = remote {
                    if let Err(message) = persist_remote_mapping(
                        db,
                        &item.record,
                        &remote_item.item_id,
                        &remote_item.etag,
                    ) {
                        failed += 1;
                        errors.push(TeamMigrationUploadError {
                            table_name: item.record.table_name.clone(),
                            record_key: item.record.record_key.clone(),
                            sync_key: item.sync_key.clone(),
                            message,
                        });
                        continue;
                    }
                }
                skipped += 1;
                continue;
            }
            MigrationItemAction::Create => apply_create(&session, fields.clone())
                .map(|entity| (entity, "create"))
                .map_err(|error| error),
            MigrationItemAction::Update { item_id, etag } => apply_update(&session, &item_id, &etag, fields)
                .map(|entity| (entity, "update")),
        };

        match write_result {
            Ok((entity, kind)) => {
                if let Err(message) =
                    persist_remote_mapping(db, &item.record, &entity.id, &entity.etag)
                {
                    failed += 1;
                    errors.push(TeamMigrationUploadError {
                        table_name: item.record.table_name.clone(),
                        record_key: item.record.record_key.clone(),
                        sync_key: item.sync_key.clone(),
                        message,
                    });
                    continue;
                }
                match kind {
                    "create" => created += 1,
                    "update" => updated += 1,
                    _ => {}
                }
            }
            Err(message) => {
                failed += 1;
                errors.push(TeamMigrationUploadError {
                    table_name: item.record.table_name.clone(),
                    record_key: item.record.record_key.clone(),
                    sync_key: item.sync_key,
                    message,
                });
            }
        }
    }

    Ok(TeamMigrationUploadReport {
        created,
        updated,
        skipped,
        failed,
        errors,
        checksum,
        complete: failed == 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use crate::workspace::sharepoint::SharePointGraphClient;
    use serde_json::json;

    #[test]
    fn payload_limit_boundary() {
        let within = "a".repeat(MAX_SHAREPOINT_PAYLOAD_JSON_BYTES);
        assert!(!payload_exceeds_sharepoint_limit(&within));
        let over = "a".repeat(MAX_SHAREPOINT_PAYLOAD_JSON_BYTES + 1);
        assert!(payload_exceeds_sharepoint_limit(&over));
    }

    #[test]
    fn build_remote_sync_key_map_indexes_by_sync_key() {
        let items = vec![ParsedSharePointListItem {
            id: "1".into(),
            etag: "\"1\"".into(),
            fields: json!({
                "SyncKey": "abc123",
                "PayloadJson": r#"{"v":1}"#,
            }),
        }];
        let map = build_remote_sync_key_map(&items);
        assert_eq!(map.get("abc123").unwrap().item_id, "1");
    }

    #[test]
    fn graph_client_create_parses_item_and_etag() {
        let create_body = r#"{
            "id": "42",
            "eTag": "\"7\"",
            "fields": { "SyncKey": "k", "PayloadJson": "{}" }
        }"#;
        let created = SharePointGraphClient::parse_list_item_response(create_body).unwrap();
        assert_eq!(created.id, "42");
        assert_eq!(created.etag, "\"7\"");
    }

    #[test]
    fn upload_report_complete_only_when_no_failures() {
        let report = TeamMigrationUploadReport {
            created: 1,
            updated: 0,
            skipped: 2,
            failed: 0,
            errors: vec![],
            checksum: "abc".into(),
            complete: true,
        };
        assert!(report.complete);

        let partial = TeamMigrationUploadReport {
            failed: 1,
            errors: vec![TeamMigrationUploadError {
                table_name: "contacts".into(),
                record_key: "1".into(),
                sync_key: "dead".into(),
                message: "412".into(),
            }],
            complete: false,
            ..report
        };
        assert!(!partial.complete);
    }

    #[test]
    fn prepare_records_rejects_oversized_payload_before_network() {
        let mut payload = Map::new();
        payload.insert(
            "blob".into(),
            json!({ "kind": "text", "value": "x".repeat(MAX_SHAREPOINT_PAYLOAD_JSON_BYTES + 10) }),
        );
        let snapshot = TeamMigrationSnapshot {
            schema_version: 1,
            generated_at: "2026-01-01T00:00:00Z".into(),
            table_counts: Default::default(),
            records: vec![SnapshotRecord {
                table_name: "contacts".into(),
                record_key: "k".into(),
                payload,
            }],
        };
        let (prepared, errors) = prepare_records(&snapshot);
        assert!(prepared.is_empty());
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("trop volumineux"));
    }

    #[test]
    fn mapping_persist_roundtrip_in_memory_db() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let db_state = std::sync::Mutex::new(Some(db));
        persist_remote_mapping(
            &db_state,
            &SnapshotRecord {
                table_name: "contacts".into(),
                record_key: "1".into(),
                payload: Map::new(),
            },
            "sp-99",
            "\"9\"",
        )
        .unwrap();
        with_database(&db_state, |database| {
            let mapping = database
                .workspace_sync_get_remote_mapping("contacts", "1")
                .unwrap()
                .expect("mapping");
            assert_eq!(mapping.remote_item_id.as_deref(), Some("sp-99"));
            assert_eq!(mapping.remote_etag.as_deref(), Some("\"9\""));
            Ok(())
        })
        .unwrap();
    }
}
