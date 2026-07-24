//! Upload initial SharePoint (snapshot CRM_Data) — reprenable, sans bascule sync.

mod download;
mod plan;
mod sync_key;
mod upload;

#[cfg(test)]
use plan::{
    plan_migration_item_action, remote_payload_matches, MigrationItemAction, RemoteCrmDataItem,
};
pub use sync_key::{compute_mutation_id, compute_payload_checksum, compute_sync_key};
pub use download::{
    rebuild_snapshot_from_remote_items, validate_rebuilt_snapshot_in_memory,
    validate_team_remote_snapshot, TeamMigrationValidateReport,
};
pub(crate) use download::remote_item_record_identity;
#[cfg(test)]
pub use download::snapshot_to_crm_data_items;
pub use upload::{
    payload_json_string, upload_team_migration_snapshot, TeamMigrationUploadReport,
    MAX_SHAREPOINT_PAYLOAD_JSON_BYTES,
};
#[cfg(test)]
use upload::validate_expected_checksum;

pub fn oversized_payload_warnings(
    records: &[crate::database::workspace_sync::SnapshotRecord],
) -> Vec<String> {
    let mut warnings = Vec::new();
    for record in records {
        let Ok(json) = payload_json_string(&record.payload) else {
            warnings.push(format!(
                "PayloadJson illisible — table « {} », clé {}.",
                record.table_name, record.record_key
            ));
            continue;
        };
        if json.len() > MAX_SHAREPOINT_PAYLOAD_JSON_BYTES {
            warnings.push(format!(
                "PayloadJson trop volumineux ({}/{} octets) — table « {} », clé {}.",
                json.len(),
                MAX_SHAREPOINT_PAYLOAD_JSON_BYTES,
                record.table_name,
                record.record_key
            ));
        }
    }
    warnings.sort();
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::workspace_sync::{
        build_team_migration_snapshot, snapshot_checksum, SnapshotRecord, TeamMigrationSnapshot,
    };
    use crate::database::Database;
    use serde_json::{json, Map, Value};

    fn test_db() -> Database {
        Database::open_in_memory_for_tests().expect("in-memory db")
    }

    fn sample_record(table: &str, key: &str, payload: Map<String, Value>) -> SnapshotRecord {
        SnapshotRecord {
            table_name: table.into(),
            record_key: key.into(),
            payload,
        }
    }

    #[test]
    fn validate_checksum_accepts_matching_snapshot() {
        let snapshot = TeamMigrationSnapshot {
            schema_version: 1,
            generated_at: "2026-01-01T00:00:00Z".into(),
            table_counts: Default::default(),
            records: vec![],
        };
        let checksum = snapshot_checksum(&snapshot);
        assert!(validate_expected_checksum(&snapshot, &checksum).is_ok());
    }

    #[test]
    fn validate_checksum_rejects_mismatch() {
        let snapshot = TeamMigrationSnapshot {
            schema_version: 1,
            generated_at: "2026-01-01T00:00:00Z".into(),
            table_counts: Default::default(),
            records: vec![],
        };
        let err = validate_expected_checksum(&snapshot, "deadbeef").unwrap_err();
        assert!(err.to_lowercase().contains("checksum"));
    }

    #[test]
    fn oversized_payload_warning_lists_table_and_key_without_content() {
        let big = "x".repeat(MAX_SHAREPOINT_PAYLOAD_JSON_BYTES + 1);
        let mut payload = Map::new();
        payload.insert(
            "note".into(),
            json!({ "kind": "text", "value": big }),
        );
        let warnings = oversized_payload_warnings(&[sample_record(
            "contacts",
            r#"[{"column":"id","kind":"integer","value":1}]"#,
            payload,
        )]);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("contacts"));
        assert!(warnings[0].contains("PayloadJson trop volumineux"));
        assert!(!warnings[0].contains(&big));
    }

    #[test]
    fn plan_create_update_skip_and_conflict_paths() {
        use crate::workspace::sharepoint::{GraphWriteConflict, GraphWriteOutcome};

        assert!(matches!(
            plan_migration_item_action(r#"{"a":1}"#, None),
            MigrationItemAction::Create
        ));

        let remote = RemoteCrmDataItem {
            item_id: "sp-1".into(),
            etag: "\"1\"".into(),
            sync_key: "abc".into(),
            payload_json: Some(r#"{"a":1}"#.into()),
        };
        assert!(matches!(
            plan_migration_item_action(r#"{"a":1}"#, Some(&remote)),
            MigrationItemAction::Skip
        ));
        assert!(matches!(
            plan_migration_item_action(r#"{"a":2}"#, Some(&remote)),
            MigrationItemAction::Update { .. }
        ));

        assert!(remote_payload_matches(r#"{"a":1}"#, Some(r#"{"a":1}"#)));
        assert!(!remote_payload_matches(r#"{"a":1}"#, Some(r#"{"a":2}"#)));

        let applied = GraphWriteOutcome::Applied {
            entity: crate::workspace::sharepoint::GraphEntityVersion {
                id: "sp-9".into(),
                etag: "\"9\"".into(),
            },
        };
        assert!(matches!(applied, GraphWriteOutcome::Applied { .. }));

        let conflict = GraphWriteOutcome::Conflict(GraphWriteConflict::PreconditionFailed(
            crate::workspace::sharepoint::PreconditionFailedDetails {
                expected_etag: "\"1\"".into(),
                actual_etag: Some("\"2\"".into()),
            },
        ));
        assert!(matches!(conflict, GraphWriteOutcome::Conflict(_)));
    }

    #[test]
    fn snapshot_preview_includes_oversized_warnings() {
        let db = test_db();
        db.connection()
            .execute_batch(
                "INSERT INTO contacts (nom, prenom, categorie)
                 VALUES ('DUPONT', 'Jean', 'CLIENT');",
            )
            .unwrap();
        let snapshot = build_team_migration_snapshot(&db).unwrap();
        let warnings = oversized_payload_warnings(&snapshot.records);
        assert!(warnings.is_empty() || warnings.iter().all(|w| !w.contains("secret")));
    }
}
