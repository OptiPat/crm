use super::push::{complete_remote_push, next_pending_push, RemotePushResult};
use crate::database::workspace_delta::WorkspaceRemoteDeltaChange;
use crate::database::workspace_restore::{
    restore_snapshot_into_database, table_counts_for_snapshot_records,
};
use crate::database::workspace_sync::{build_team_migration_snapshot, snapshot_checksum};
use crate::database::Database;
use serde_json::{Map, Value};

const RECORD_KEY: &str = r#"[{"column":"id","kind":"integer","value":1}]"#;

fn contact_payload(name: &str, first_name: &str, category: &str) -> Map<String, Value> {
    serde_json::json!({
        "id": {"kind":"integer","value":1},
        "nom": {"kind":"text","value":name},
        "prenom": {"kind":"text","value":first_name},
        "categorie": {"kind":"text","value":category}
    })
    .as_object()
    .unwrap()
    .clone()
}

fn remote_change(payload: Map<String, Value>, etag: &str) -> WorkspaceRemoteDeltaChange {
    WorkspaceRemoteDeltaChange {
        remote_item_id: "sp-contact-1".into(),
        remote_etag: Some(etag.into()),
        table_name: "contacts".into(),
        record_key: RECORD_KEY.into(),
        payload: Some(payload),
        deleted: false,
    }
}

fn open_node() -> Database {
    let db = Database::open_in_memory_for_tests().unwrap();
    db.workspace_sync_apply_remote_delta(
        &[remote_change(
            contact_payload("DUPONT", "Jean", "CLIENT"),
            "\"1\"",
        )],
        "delta-initial",
    )
    .unwrap();
    db.workspace_sync_set_capture_enabled(true).unwrap();
    db.workspace_sync_mark_online().unwrap();
    db
}

fn pending_payload(db: &Database) -> (super::push::PendingPushPlan, Map<String, Value>) {
    let plan = next_pending_push(db).unwrap().unwrap();
    let payload = serde_json::from_str::<Value>(plan.queue_item.payload_json.as_deref().unwrap())
        .unwrap()
        .as_object()
        .unwrap()
        .clone();
    (plan, payload)
}

#[test]
fn three_nodes_propagate_changes_then_detect_a_concurrent_conflict() {
    let advisor = open_node();
    let secretary_a = open_node();
    let secretary_b = open_node();

    advisor
        .connection()
        .execute("UPDATE contacts SET nom = 'LEGRAND' WHERE id = 1", [])
        .unwrap();
    let (advisor_plan, advisor_payload) = pending_payload(&advisor);
    assert!(complete_remote_push(
        &advisor,
        &advisor_plan,
        &RemotePushResult::Applied {
            queue_id: advisor_plan.queue_item.id,
            revision: advisor_plan.queue_item.revision,
            remote_item_id: "sp-contact-1".into(),
            remote_etag: "\"2\"".into(),
        },
    )
    .unwrap());
    let advisor_delta = remote_change(advisor_payload, "\"2\"");
    for node in [&secretary_a, &secretary_b] {
        node.workspace_sync_apply_remote_delta(&[advisor_delta.clone()], "delta-2")
            .unwrap();
        let name: String = node
            .connection()
            .query_row("SELECT nom FROM contacts WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(name, "LEGRAND");
    }

    let mut snapshot = build_team_migration_snapshot(&secretary_a).unwrap();
    let rebuilt = Database::open_in_memory_workspace_cache().unwrap();
    snapshot.table_counts =
        table_counts_for_snapshot_records(rebuilt.connection(), &snapshot.records).unwrap();
    restore_snapshot_into_database(&rebuilt, &snapshot).unwrap();
    assert_eq!(
        snapshot_checksum(&build_team_migration_snapshot(&rebuilt).unwrap()),
        snapshot_checksum(&snapshot)
    );

    secretary_a
        .connection()
        .execute("UPDATE contacts SET prenom = 'Marie' WHERE id = 1", [])
        .unwrap();
    secretary_b
        .connection()
        .execute(
            "UPDATE contacts SET categorie = 'PROSPECT' WHERE id = 1",
            [],
        )
        .unwrap();
    let (secretary_a_plan, secretary_a_payload) = pending_payload(&secretary_a);
    assert!(complete_remote_push(
        &secretary_a,
        &secretary_a_plan,
        &RemotePushResult::Applied {
            queue_id: secretary_a_plan.queue_item.id,
            revision: secretary_a_plan.queue_item.revision,
            remote_item_id: "sp-contact-1".into(),
            remote_etag: "\"3\"".into(),
        },
    )
    .unwrap());

    secretary_b
        .workspace_sync_apply_remote_delta(
            &[remote_change(secretary_a_payload, "\"3\"")],
            "delta-3",
        )
        .unwrap();
    let local_category: String = secretary_b
        .connection()
        .query_row("SELECT categorie FROM contacts WHERE id = 1", [], |row| row.get(0))
        .unwrap();
    assert_eq!(local_category, "PROSPECT");
    let conflict = secretary_b
        .workspace_sync_list_open_conflicts()
        .unwrap()
        .remove(0);
    secretary_b
        .workspace_sync_resolve_conflict_keep_local(conflict.id)
        .unwrap();
    assert!(secretary_b
        .workspace_sync_list_open_conflicts()
        .unwrap()
        .is_empty());
    let retry = next_pending_push(&secretary_b).unwrap().unwrap();
    assert_eq!(
        retry.remote_mapping.unwrap().remote_etag.as_deref(),
        Some("\"3\"")
    );
}

#[test]
fn distributed_id_blocks_keep_three_nodes_disjoint() {
    let nodes = [
        (Database::open_in_memory_for_tests().unwrap(), 1, 100),
        (Database::open_in_memory_for_tests().unwrap(), 101, 200),
        (Database::open_in_memory_for_tests().unwrap(), 201, 300),
    ];
    let mut ids = Vec::new();
    for (index, (db, start, end)) in nodes.iter().enumerate() {
        db.workspace_sync_install_id_block(
            "contacts",
            *start,
            *end,
            &format!("sequence-{index}"),
            &format!("\"{index}\""),
        )
        .unwrap();
        db.connection()
            .execute(
                "INSERT INTO contacts (nom, prenom, categorie) VALUES (?1, 'Jean', 'CLIENT')",
                [format!("NOM{index}")],
            )
            .unwrap();
        ids.push(db.connection().last_insert_rowid());
    }
    assert_eq!(ids, vec![1, 101, 201]);
}
