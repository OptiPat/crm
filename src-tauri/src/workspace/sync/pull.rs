use crate::database::workspace_delta::WorkspaceRemoteDeltaChange;
use crate::database::workspace_sync::WORKSPACE_SYNC_SCHEMA_VERSION;
use crate::database::Database;
use crate::workspace::migration::{compute_payload_checksum, compute_sync_key};
use crate::workspace::sharepoint::{ParsedSharePointDeltaItem, SharePointDeltaResult};
use serde_json::{Map, Value};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq)]
pub struct PreparedPullBatch {
    pub changes: Vec<WorkspaceRemoteDeltaChange>,
    pub delta_link: String,
}

fn field_string(fields: &Value, name: &str) -> Option<String> {
    fields
        .get(name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn field_bool(fields: &Value, name: &str) -> bool {
    match fields.get(name) {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => {
            matches!(value.trim().to_ascii_lowercase().as_str(), "true" | "1")
        }
        Some(Value::Number(value)) => value.as_i64().is_some_and(|value| value != 0),
        _ => false,
    }
}

fn field_u32(fields: &Value, name: &str) -> Option<u32> {
    match fields.get(name) {
        Some(Value::Number(value)) => value.as_u64().and_then(|value| value.try_into().ok()),
        Some(Value::String(value)) => value.trim().parse().ok(),
        _ => None,
    }
}

fn parse_payload(fields: &Value, required: bool) -> Result<Option<Map<String, Value>>, String> {
    let Some(payload_json) = field_string(fields, "PayloadJson") else {
        if required {
            return Err("Élément CRM_Data actif sans PayloadJson.".into());
        }
        return Ok(None);
    };
    if let Some(expected) = field_string(fields, "PayloadChecksum") {
        let actual = compute_payload_checksum(&payload_json);
        if expected != actual {
            return Err(format!(
                "Checksum PayloadJson incohérent (attendu {expected}, reçu {actual})."
            ));
        }
    }
    let payload: Value =
        serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
    payload
        .as_object()
        .cloned()
        .map(Some)
        .ok_or_else(|| "PayloadJson CRM_Data doit être un objet.".to_string())
}

fn parse_live_delta_item(
    item: &ParsedSharePointDeltaItem,
) -> Result<WorkspaceRemoteDeltaChange, String> {
    let table_name = field_string(&item.fields, "TableName")
        .ok_or_else(|| format!("Élément CRM_Data {} sans TableName.", item.id))?;
    let record_key = field_string(&item.fields, "RecordKey")
        .ok_or_else(|| format!("Élément CRM_Data {} sans RecordKey.", item.id))?;
    let sync_key = field_string(&item.fields, "SyncKey")
        .ok_or_else(|| format!("Élément CRM_Data {} sans SyncKey.", item.id))?;
    let expected_sync_key = compute_sync_key(&table_name, &record_key);
    if sync_key != expected_sync_key {
        return Err(format!(
            "SyncKey distante incohérente pour {table_name} / {record_key}."
        ));
    }
    let schema_version = field_u32(&item.fields, "SchemaVersion")
        .ok_or_else(|| format!("Élément CRM_Data {} sans SchemaVersion.", item.id))?;
    if schema_version != WORKSPACE_SYNC_SCHEMA_VERSION {
        return Err(format!(
            "Version de schéma CRM_Data incompatible : {schema_version} au lieu de {WORKSPACE_SYNC_SCHEMA_VERSION}."
        ));
    }
    let deleted = field_bool(&item.fields, "Deleted");
    let payload = parse_payload(&item.fields, !deleted)?;
    Ok(WorkspaceRemoteDeltaChange {
        remote_item_id: item.id.clone(),
        remote_etag: item.etag.clone(),
        table_name,
        record_key,
        payload,
        deleted,
    })
}

pub fn prepare_pull_batch(
    db: &Database,
    result: SharePointDeltaResult,
) -> Result<PreparedPullBatch, String> {
    let mut changes = Vec::with_capacity(result.items.len());
    let mut sync_keys = HashSet::new();
    for item in result.items {
        let change = if item.deleted {
            let mapping = db
                .workspace_sync_get_remote_mapping_by_item_id(&item.id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| {
                    format!(
                        "Suppression SharePoint inconnue pour l'élément {} : reconstruction du cache requise.",
                        item.id
                    )
                })?;
            WorkspaceRemoteDeltaChange {
                remote_item_id: item.id,
                remote_etag: item.etag,
                table_name: mapping.table_name,
                record_key: mapping.record_key,
                payload: None,
                deleted: true,
            }
        } else {
            parse_live_delta_item(&item)?
        };
        let sync_key = compute_sync_key(&change.table_name, &change.record_key);
        if !sync_keys.insert(sync_key.clone()) {
            return Err(format!(
                "Plusieurs éléments delta portent la SyncKey {sync_key}."
            ));
        }
        changes.push(change);
    }
    Ok(PreparedPullBatch {
        changes,
        delta_link: result.delta_link,
    })
}

pub fn apply_pull_batch(db: &Database, batch: &PreparedPullBatch) -> Result<(), String> {
    db.workspace_sync_apply_remote_delta(&batch.changes, &batch.delta_link)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::sharepoint::test_server::{ScriptedGraphServer, ScriptedResponse};
    use crate::workspace::sharepoint::{SharePointGraphClient, SharePointSiteRef};

    fn live_item(payload_json: &str) -> ParsedSharePointDeltaItem {
        let record_key = r#"[{"column":"id","kind":"integer","value":1}]"#;
        let sync_key = compute_sync_key("contacts", record_key);
        ParsedSharePointDeltaItem {
            id: "sp-1".into(),
            etag: Some("\"2\"".into()),
            fields: serde_json::json!({
                "SyncKey": sync_key,
                "TableName": "contacts",
                "RecordKey": record_key,
                "PayloadJson": payload_json,
                "PayloadChecksum": compute_payload_checksum(payload_json),
                "SchemaVersion": WORKSPACE_SYNC_SCHEMA_VERSION,
                "Deleted": false
            }),
            deleted: false,
        }
    }

    #[test]
    fn pull_parser_validates_checksum_and_schema() {
        let payload = r#"{"id":{"kind":"integer","value":1}}"#;
        assert!(parse_live_delta_item(&live_item(payload)).is_ok());

        let mut tampered = live_item(payload);
        tampered.fields["PayloadChecksum"] = Value::String("bad".into());
        assert!(parse_live_delta_item(&tampered).is_err());

        let mut incompatible = live_item(payload);
        incompatible.fields["SchemaVersion"] = Value::from(999);
        assert!(parse_live_delta_item(&incompatible).is_err());
    }

    #[test]
    fn physical_delete_is_resolved_through_the_remote_mapping() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let record_key = r#"[{"column":"id","kind":"integer","value":1}]"#;
        db.workspace_sync_upsert_remote_mapping("contacts", record_key, "sp-1", "\"1\"")
            .unwrap();
        let batch = prepare_pull_batch(
            &db,
            SharePointDeltaResult {
                items: vec![ParsedSharePointDeltaItem {
                    id: "sp-1".into(),
                    etag: None,
                    fields: Value::Object(Default::default()),
                    deleted: true,
                }],
                delta_link: "https://graph.microsoft.com/delta?token=2".into(),
            },
        )
        .unwrap();
        assert_eq!(batch.changes.len(), 1);
        assert!(batch.changes[0].deleted);
        assert_eq!(batch.changes[0].table_name, "contacts");
    }

    #[test]
    fn graph_delta_is_parsed_and_applied_without_local_outbox() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_sync_set_capture_enabled(true).unwrap();
        let record_key = r#"[{"column":"id","kind":"integer","value":1}]"#;
        let payload_json = serde_json::json!({
            "id": {"kind":"integer","value":1},
            "nom": {"kind":"text","value":"DUPONT"},
            "prenom": {"kind":"text","value":"Jean"},
            "categorie": {"kind":"text","value":"CLIENT"}
        })
        .to_string();
        let response = serde_json::json!({
            "value": [{
                "id": "sp-1",
                "@odata.etag": "\"2\"",
                "fields": {
                    "SyncKey": compute_sync_key("contacts", record_key),
                    "TableName": "contacts",
                    "RecordKey": record_key,
                    "PayloadJson": payload_json,
                    "PayloadChecksum": compute_payload_checksum(&payload_json),
                    "SchemaVersion": WORKSPACE_SYNC_SCHEMA_VERSION,
                    "Deleted": false
                }
            }],
            "@odata.deltaLink": "{{BASE_URL}}/v1.0/delta?token=2"
        });
        let server =
            ScriptedGraphServer::spawn(vec![ScriptedResponse::json(200, response.to_string())]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "example.sharepoint.com".into(),
            site_path: "/sites/crm".into(),
        })
        .with_graph_host(&server.base_url);

        let delta = client
            .list_items_delta_blocking("token", "site-1", "data-list", None)
            .unwrap();
        let batch = prepare_pull_batch(&db, delta).unwrap();
        apply_pull_batch(&db, &batch).unwrap();

        let name: String = db
            .connection()
            .query_row("SELECT nom FROM contacts WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(name, "DUPONT");
        assert!(db.workspace_sync_list_pending().unwrap().is_empty());
        let expected_delta_link = format!("{}/v1.0/delta?token=2", server.base_url);
        assert_eq!(
            db.workspace_sync_get_state("crm_data_delta_link")
                .unwrap()
                .as_deref(),
            Some(expected_delta_link.as_str())
        );
        assert_eq!(server.finish().len(), 1);
    }
}
