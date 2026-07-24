use crate::database::workspace_sync::{
    WorkspaceRemoteRecord, WorkspaceSyncQueueItem, WORKSPACE_SYNC_SCHEMA_VERSION,
};
use crate::database::Database;
use crate::workspace::migration::{
    compute_mutation_id, compute_payload_checksum, compute_sync_key,
    MAX_SHAREPOINT_PAYLOAD_JSON_BYTES,
};
use crate::workspace::sharepoint::{
    GraphWriteOutcome, SharePointGraphClient,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingPushPlan {
    pub queue_item: WorkspaceSyncQueueItem,
    pub remote_mapping: Option<WorkspaceRemoteRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RemotePushResult {
    Applied {
        queue_id: i64,
        revision: i64,
        remote_item_id: String,
        remote_etag: String,
    },
    Conflict {
        queue_id: i64,
        revision: i64,
        message: String,
        remote_item_id: String,
        remote_payload_json: Option<String>,
        remote_etag: Option<String>,
        remote_deleted: bool,
    },
}

pub fn next_pending_push(db: &Database) -> Result<Option<PendingPushPlan>, String> {
    let queue_items = db
        .workspace_sync_list_pending()
        .map_err(|error| error.to_string())?;
    let mut queue_item = None;
    for candidate in queue_items {
        if !db
            .workspace_sync_has_open_conflict(&candidate.table_name, &candidate.record_key)
            .map_err(|error| error.to_string())?
        {
            queue_item = Some(candidate);
            break;
        }
    }
    let Some(queue_item) = queue_item else {
        return Ok(None);
    };
    let remote_mapping = db
        .workspace_sync_get_remote_mapping(&queue_item.table_name, &queue_item.record_key)
        .map_err(|error| error.to_string())?;
    Ok(Some(PendingPushPlan {
        queue_item,
        remote_mapping,
    }))
}

pub fn build_crm_data_mutation_fields(
    item: &WorkspaceSyncQueueItem,
    actor_id: &str,
    updated_at: &str,
) -> Result<Value, String> {
    let deleted = item.operation == "delete";
    let payload_json = item.payload_json.as_deref().unwrap_or("{}");
    if payload_json.len() > MAX_SHAREPOINT_PAYLOAD_JSON_BYTES {
        return Err(format!(
            "PayloadJson trop volumineux ({}/{} octets).",
            payload_json.len(),
            MAX_SHAREPOINT_PAYLOAD_JSON_BYTES
        ));
    }
    serde_json::from_str::<Value>(payload_json)
        .map_err(|error| format!("PayloadJson local invalide : {error}"))?;
    let sync_key = compute_sync_key(&item.table_name, &item.record_key);
    Ok(json!({
        "SyncKey": sync_key,
        "TableName": item.table_name,
        "RecordKey": item.record_key,
        "PayloadJson": payload_json,
        "PayloadChecksum": compute_payload_checksum(payload_json),
        "MutationId": compute_mutation_id(&sync_key, item.revision),
        "SchemaVersion": WORKSPACE_SYNC_SCHEMA_VERSION,
        "Deleted": deleted,
        "UpdatedAt": updated_at,
        "UpdatedBy": actor_id,
    }))
}

pub fn execute_remote_push(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
    crm_data_list_id: &str,
    actor_id: &str,
    updated_at: &str,
    plan: &PendingPushPlan,
) -> Result<RemotePushResult, String> {
    let fields = build_crm_data_mutation_fields(&plan.queue_item, actor_id, updated_at)?;
    let sync_key = fields
        .get("SyncKey")
        .and_then(Value::as_str)
        .ok_or_else(|| "SyncKey absente du payload de push.".to_string())?;
    let mutation_id = fields
        .get("MutationId")
        .and_then(Value::as_str)
        .ok_or_else(|| "MutationId absente du payload de push.".to_string())?
        .to_string();

    let known_target = plan.remote_mapping.as_ref().and_then(|mapping| {
        Some((
            mapping.remote_item_id.as_deref()?,
            mapping.remote_etag.as_deref()?,
        ))
    });
    let target = match known_target {
        Some(target) => Some((target.0.to_string(), target.1.to_string())),
        None => {
            let filter = format!("fields/SyncKey eq '{sync_key}'");
            let matches = client.list_items_all_blocking(
                access_token,
                site_id,
                crm_data_list_id,
                Some(&filter),
            )?;
            match matches.as_slice() {
                [] => None,
                [item] => Some((item.id.clone(), item.etag.clone())),
                _ => {
                    return Err(format!(
                        "Plusieurs éléments CRM_Data portent la SyncKey {sync_key}."
                    ));
                }
            }
        }
    };

    if let Some((item_id, etag)) = target {
        return match client.patch_list_item_fields_blocking(
            access_token,
            site_id,
            crm_data_list_id,
            &item_id,
            &etag,
            fields,
        )? {
            GraphWriteOutcome::Applied { entity } => Ok(RemotePushResult::Applied {
                queue_id: plan.queue_item.id,
                revision: plan.queue_item.revision,
                remote_item_id: entity.id,
                remote_etag: entity.etag,
            }),
            GraphWriteOutcome::Conflict(conflict) => {
                let remote = client.get_list_item_blocking(
                    access_token,
                    site_id,
                    crm_data_list_id,
                    &item_id,
                )?;
                if remote
                    .fields
                    .get("MutationId")
                    .and_then(Value::as_str)
                    == Some(mutation_id.as_str())
                {
                    return Ok(RemotePushResult::Applied {
                        queue_id: plan.queue_item.id,
                        revision: plan.queue_item.revision,
                        remote_item_id: remote.id,
                        remote_etag: remote.etag,
                    });
                }
                Ok(RemotePushResult::Conflict {
                    queue_id: plan.queue_item.id,
                    revision: plan.queue_item.revision,
                    message: format!("Conflit ETag SharePoint : {conflict:?}"),
                    remote_item_id: remote.id,
                    remote_payload_json: remote
                        .fields
                        .get("PayloadJson")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    remote_etag: Some(remote.etag),
                    remote_deleted: remote
                        .fields
                        .get("Deleted")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                })
            }
        };
    }

    let created = client.create_list_item_blocking(
        access_token,
        site_id,
        crm_data_list_id,
        fields,
    )?;
    Ok(RemotePushResult::Applied {
        queue_id: plan.queue_item.id,
        revision: plan.queue_item.revision,
        remote_item_id: created.id,
        remote_etag: created.etag,
    })
}

pub fn complete_remote_push(
    db: &Database,
    plan: &PendingPushPlan,
    result: &RemotePushResult,
) -> Result<bool, String> {
    match result {
        RemotePushResult::Applied {
            queue_id,
            revision,
            remote_item_id,
            remote_etag,
        } => {
            if *queue_id != plan.queue_item.id || *revision != plan.queue_item.revision {
                return Err("Résultat de push incohérent avec le plan local.".into());
            }
            db.workspace_sync_complete_push(&plan.queue_item, remote_item_id, remote_etag)
                .map_err(|error| error.to_string())
        }
        RemotePushResult::Conflict { .. } => Ok(false),
    }
}

pub fn ensure_remote_mutation_audit(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
    audit_list_id: &str,
    actor_id: &str,
    created_at: &str,
    item: &WorkspaceSyncQueueItem,
) -> Result<(), String> {
    let sync_key = compute_sync_key(&item.table_name, &item.record_key);
    let mutation_id = compute_mutation_id(&sync_key, item.revision);
    ensure_remote_audit_entry(
        client,
        access_token,
        site_id,
        audit_list_id,
        &mutation_id,
        &item.table_name,
        &item.record_key,
        actor_id,
        if item.operation == "delete" {
            "delete"
        } else {
            "upsert"
        },
        &format!("Synchronisation CRM — révision {}", item.revision),
        created_at,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn ensure_remote_audit_entry(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
    audit_list_id: &str,
    mutation_id: &str,
    entity_type: &str,
    entity_id: &str,
    actor_id: &str,
    action: &str,
    detail: &str,
    created_at: &str,
) -> Result<(), String> {
    let filter = format!("fields/MutationId eq '{mutation_id}'");
    let existing = client.list_items_all_blocking(
        access_token,
        site_id,
        audit_list_id,
        Some(&filter),
    )?;
    match existing.len() {
        0 => {}
        1 => return Ok(()),
        _ => {
            return Err(format!(
                "MutationId d'audit dupliqué sur SharePoint : {mutation_id}."
            ));
        }
    }
    let fields = json!({
        "MutationId": mutation_id,
        "EntityType": entity_type,
        "EntityId": entity_id,
        "ActorId": actor_id,
        "Action": action,
        "Detail": detail,
        "CreatedAt": created_at,
    });
    match client.create_list_item_blocking(
        access_token,
        site_id,
        audit_list_id,
        fields,
    ) {
        Ok(_) => Ok(()),
        Err(create_error) => {
            let recovered = client.list_items_all_blocking(
                access_token,
                site_id,
                audit_list_id,
                Some(&filter),
            )?;
            if recovered.len() == 1 {
                Ok(())
            } else {
                Err(create_error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::sharepoint::test_server::{ScriptedGraphServer, ScriptedResponse};
    use crate::workspace::sharepoint::SharePointSiteRef;

    fn queue_item(operation: &str, payload: Option<&str>) -> WorkspaceSyncQueueItem {
        WorkspaceSyncQueueItem {
            id: 7,
            revision: 3,
            table_name: "contacts".into(),
            record_key: r#"[{"column":"id","kind":"integer","value":42}]"#.into(),
            operation: operation.into(),
            payload_json: payload.map(str::to_string),
            enqueued_at: 1,
        }
    }

    #[test]
    fn mutation_fields_are_versioned_checksummed_and_idempotent() {
        let item = queue_item("upsert", Some(r#"{"id":{"kind":"integer","value":42}}"#));
        let first =
            build_crm_data_mutation_fields(&item, "actor-1", "2026-07-24T05:00:00Z").unwrap();
        let second =
            build_crm_data_mutation_fields(&item, "actor-1", "2026-07-24T05:00:00Z").unwrap();
        assert_eq!(first, second);
        assert_eq!(first["SchemaVersion"], WORKSPACE_SYNC_SCHEMA_VERSION);
        assert_eq!(first["Deleted"], false);
        assert_eq!(first["MutationId"].as_str().unwrap().len(), 64);
        assert_eq!(first["PayloadChecksum"].as_str().unwrap().len(), 64);
    }

    #[test]
    fn delete_is_transmitted_as_a_tombstone() {
        let fields = build_crm_data_mutation_fields(
            &queue_item("delete", None),
            "actor-1",
            "2026-07-24T05:00:00Z",
        )
        .unwrap();
        assert_eq!(fields["Deleted"], true);
        assert_eq!(fields["PayloadJson"], "{}");
    }

    #[test]
    fn stale_completion_keeps_the_newer_queue_revision() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.workspace_sync_enqueue(
            "contacts",
            r#"[{"column":"id","kind":"integer","value":42}]"#,
            "upsert",
            Some(r#"{"v":1}"#),
        )
        .unwrap();
        let plan = next_pending_push(&db).unwrap().unwrap();
        db.workspace_sync_enqueue(
            "contacts",
            r#"[{"column":"id","kind":"integer","value":42}]"#,
            "upsert",
            Some(r#"{"v":2}"#),
        )
        .unwrap();
        let result = RemotePushResult::Applied {
            queue_id: plan.queue_item.id,
            revision: plan.queue_item.revision,
            remote_item_id: "sp-42".into(),
            remote_etag: "\"2\"".into(),
        };
        assert!(!complete_remote_push(&db, &plan, &result).unwrap());
        let pending = db.workspace_sync_list_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].payload_json.as_deref(), Some(r#"{"v":2}"#));
        assert_eq!(
            db.workspace_sync_get_remote_mapping(
                "contacts",
                r#"[{"column":"id","kind":"integer","value":42}]"#
            )
            .unwrap()
            .unwrap()
            .remote_etag
            .as_deref(),
            Some("\"2\"")
        );
    }

    #[test]
    fn mutation_revision_remains_monotonic_after_acknowledgement() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let record_key = r#"[{"column":"id","kind":"integer","value":42}]"#;
        db.workspace_sync_enqueue(
            "contacts",
            record_key,
            "upsert",
            Some(r#"{"v":1}"#),
        )
        .unwrap();
        let first = next_pending_push(&db).unwrap().unwrap();
        let first_fields =
            build_crm_data_mutation_fields(&first.queue_item, "actor", "2026-07-24T05:00:00Z")
                .unwrap();
        let result = RemotePushResult::Applied {
            queue_id: first.queue_item.id,
            revision: first.queue_item.revision,
            remote_item_id: "sp-42".into(),
            remote_etag: "\"1\"".into(),
        };
        assert!(complete_remote_push(&db, &first, &result).unwrap());

        db.workspace_sync_enqueue(
            "contacts",
            record_key,
            "upsert",
            Some(r#"{"v":2}"#),
        )
        .unwrap();
        let second = next_pending_push(&db).unwrap().unwrap();
        let second_fields =
            build_crm_data_mutation_fields(&second.queue_item, "actor", "2026-07-24T05:01:00Z")
                .unwrap();
        assert!(second.queue_item.revision > first.queue_item.revision);
        assert_ne!(first_fields["MutationId"], second_fields["MutationId"]);
    }

    #[test]
    fn remote_push_treats_matching_mutation_after_412_as_applied() {
        let queue_item = queue_item("upsert", Some(r#"{"v":1}"#));
        let mutation_id = build_crm_data_mutation_fields(
            &queue_item,
            "actor",
            "2026-07-24T05:00:00Z",
        )
        .unwrap()["MutationId"]
            .as_str()
            .unwrap()
            .to_string();
        let plan = PendingPushPlan {
            queue_item,
            remote_mapping: Some(WorkspaceRemoteRecord {
                table_name: "contacts".into(),
                record_key: r#"[{"column":"id","kind":"integer","value":42}]"#.into(),
                remote_item_id: Some("remote-42".into()),
                remote_etag: Some("\"1\"".into()),
                last_synced_at: None,
            }),
        };
        let remote = serde_json::json!({
            "id": "remote-42",
            "@odata.etag": "\"2\"",
            "fields": {
                "MutationId": mutation_id,
                "PayloadJson": "{\"v\":1}",
                "Deleted": false
            }
        });
        let server = ScriptedGraphServer::spawn(vec![
            ScriptedResponse::json(
                412,
                r#"{"error":{"code":"preconditionFailed","message":"etag mismatch"}}"#,
            ),
            ScriptedResponse::json(200, remote.to_string()),
        ]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "example.sharepoint.com".into(),
            site_path: "/sites/crm".into(),
        })
        .with_graph_host(&server.base_url);

        let result = execute_remote_push(
            &client,
            "token",
            "site-1",
            "data-list",
            "actor",
            "2026-07-24T05:00:00Z",
            &plan,
        )
        .unwrap();

        assert!(matches!(
            result,
            RemotePushResult::Applied {
                remote_item_id,
                remote_etag,
                ..
            } if remote_item_id == "remote-42" && remote_etag == "\"2\""
        ));
        let requests = server.finish();
        assert_eq!(requests.len(), 2);
        assert!(requests[0].starts_with(
            "PATCH /v1.0/sites/site-1/lists/data-list/items/remote-42/fields "
        ));
        assert!(requests[1].starts_with(
            "GET /v1.0/sites/site-1/lists/data-list/items/remote-42"
        ));
    }
}
