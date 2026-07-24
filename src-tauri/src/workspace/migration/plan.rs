//! Planification pure create / update / skip pour CRM_Data.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteCrmDataItem {
    pub item_id: String,
    pub etag: String,
    pub sync_key: String,
    pub payload_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MigrationItemAction {
    Skip,
    Create,
    Update { item_id: String, etag: String },
}

pub fn remote_payload_matches(local_payload_json: &str, remote_payload_json: Option<&str>) -> bool {
    match remote_payload_json {
        Some(remote) => remote.trim() == local_payload_json.trim(),
        None => false,
    }
}

pub fn plan_migration_item_action(
    local_payload_json: &str,
    remote: Option<&RemoteCrmDataItem>,
) -> MigrationItemAction {
    match remote {
        None => MigrationItemAction::Create,
        Some(remote_item) => {
            if remote_payload_matches(local_payload_json, remote_item.payload_json.as_deref()) {
                MigrationItemAction::Skip
            } else {
                MigrationItemAction::Update {
                    item_id: remote_item.item_id.clone(),
                    etag: remote_item.etag.clone(),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn remote(payload: &str) -> RemoteCrmDataItem {
        RemoteCrmDataItem {
            item_id: "item-1".into(),
            etag: "\"3\"".into(),
            sync_key: "sync-1".into(),
            payload_json: Some(payload.into()),
        }
    }

    #[test]
    fn plans_create_when_remote_missing() {
        assert_eq!(
            plan_migration_item_action(r#"{"v":1}"#, None),
            MigrationItemAction::Create
        );
    }

    #[test]
    fn plans_skip_when_payload_identical() {
        assert_eq!(
            plan_migration_item_action(r#"{"v":1}"#, Some(&remote(r#"{"v":1}"#))),
            MigrationItemAction::Skip
        );
    }

    #[test]
    fn plans_update_when_payload_differs() {
        assert_eq!(
            plan_migration_item_action(r#"{"v":2}"#, Some(&remote(r#"{"v":1}"#))),
            MigrationItemAction::Update {
                item_id: "item-1".into(),
                etag: "\"3\"".into(),
            }
        );
    }

    #[test]
    fn treats_missing_remote_payload_as_update() {
        let mut item = remote("");
        item.payload_json = None;
        assert_eq!(
            plan_migration_item_action(r#"{"v":1}"#, Some(&item)),
            MigrationItemAction::Update {
                item_id: "item-1".into(),
                etag: "\"3\"".into(),
            }
        );
    }
}
