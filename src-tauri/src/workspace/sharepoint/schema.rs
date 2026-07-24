//! Schéma SharePoint des listes techniques CRM (mode équipe).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColumnKind {
    Text,
    MultilineText,
    DateTime,
    Boolean,
    Number,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ListColumnDef {
    pub name: &'static str,
    pub display_name: &'static str,
    pub kind: ColumnKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ListDef {
    pub display_name: &'static str,
    pub columns: &'static [ListColumnDef],
}

pub const LIST_CRM_MEMBERS: &str = "CRM_Members";
pub const LIST_CRM_PRESENCE: &str = "CRM_Presence";
pub const LIST_CRM_LOCKS: &str = "CRM_Locks";
pub const LIST_CRM_AUDIT: &str = "CRM_Audit";
pub const LIST_CRM_DATA: &str = "CRM_Data";
pub const LIST_CRM_SEQUENCES: &str = "CRM_Sequences";

const MEMBERS_COLUMNS: &[ListColumnDef] = &[
    ListColumnDef {
        name: "MicrosoftOid",
        display_name: "Microsoft OID",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "Email",
        display_name: "Email",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "DisplayName",
        display_name: "Display name",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "Role",
        display_name: "Role",
        kind: ColumnKind::Text,
    },
];

const PRESENCE_COLUMNS: &[ListColumnDef] = &[
    ListColumnDef {
        name: "EntityType",
        display_name: "Entity type",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "EntityId",
        display_name: "Entity id",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "ActorId",
        display_name: "Actor id",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "ActorDisplayName",
        display_name: "Actor display name",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "LastSeenAt",
        display_name: "Last seen at",
        kind: ColumnKind::DateTime,
    },
];

const LOCKS_COLUMNS: &[ListColumnDef] = &[
    ListColumnDef {
        name: "LockKey",
        display_name: "Lock key",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "EntityType",
        display_name: "Entity type",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "EntityId",
        display_name: "Entity id",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "HolderId",
        display_name: "Holder id",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "HolderDisplayName",
        display_name: "Holder display name",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "ExpiresAt",
        display_name: "Expires at",
        kind: ColumnKind::DateTime,
    },
    ListColumnDef {
        name: "AcquiredAt",
        display_name: "Acquired at",
        kind: ColumnKind::DateTime,
    },
];

const DATA_COLUMNS: &[ListColumnDef] = &[
    ListColumnDef {
        name: "SyncKey",
        display_name: "Sync key",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "TableName",
        display_name: "Table name",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "RecordKey",
        display_name: "Record key",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "PayloadJson",
        display_name: "Payload JSON",
        kind: ColumnKind::MultilineText,
    },
    ListColumnDef {
        name: "Deleted",
        display_name: "Deleted",
        kind: ColumnKind::Boolean,
    },
    ListColumnDef {
        name: "UpdatedAt",
        display_name: "Updated at",
        kind: ColumnKind::DateTime,
    },
    ListColumnDef {
        name: "UpdatedBy",
        display_name: "Updated by",
        kind: ColumnKind::Text,
    },
];

const SEQUENCES_COLUMNS: &[ListColumnDef] = &[
    ListColumnDef {
        name: "SequenceKey",
        display_name: "Sequence key",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "NextValue",
        display_name: "Next value",
        kind: ColumnKind::Number,
    },
];

const AUDIT_COLUMNS: &[ListColumnDef] = &[
    ListColumnDef {
        name: "EntityType",
        display_name: "Entity type",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "EntityId",
        display_name: "Entity id",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "ActorId",
        display_name: "Actor id",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "Action",
        display_name: "Action",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "Detail",
        display_name: "Detail",
        kind: ColumnKind::Text,
    },
    ListColumnDef {
        name: "CreatedAt",
        display_name: "Created at",
        kind: ColumnKind::DateTime,
    },
];

pub const TEAM_WORKSPACE_LISTS: &[ListDef] = &[
    ListDef {
        display_name: LIST_CRM_MEMBERS,
        columns: MEMBERS_COLUMNS,
    },
    ListDef {
        display_name: LIST_CRM_PRESENCE,
        columns: PRESENCE_COLUMNS,
    },
    ListDef {
        display_name: LIST_CRM_LOCKS,
        columns: LOCKS_COLUMNS,
    },
    ListDef {
        display_name: LIST_CRM_AUDIT,
        columns: AUDIT_COLUMNS,
    },
    ListDef {
        display_name: LIST_CRM_DATA,
        columns: DATA_COLUMNS,
    },
    ListDef {
        display_name: LIST_CRM_SEQUENCES,
        columns: SEQUENCES_COLUMNS,
    },
];

pub fn list_def_by_display_name(name: &str) -> Option<&'static ListDef> {
    TEAM_WORKSPACE_LISTS
        .iter()
        .find(|list| list.display_name == name)
}

pub fn field_name(list_display_name: &str, logical: &str) -> Option<&'static str> {
    let list = list_def_by_display_name(list_display_name)?;
    list.columns
        .iter()
        .find(|column| column.name == logical)
        .map(|column| column.name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn team_workspace_lists_cover_all_crm_lists() {
        let names: Vec<_> = TEAM_WORKSPACE_LISTS
            .iter()
            .map(|list| list.display_name)
            .collect();
        assert_eq!(
            names,
            vec![
                LIST_CRM_MEMBERS,
                LIST_CRM_PRESENCE,
                LIST_CRM_LOCKS,
                LIST_CRM_AUDIT,
                LIST_CRM_DATA,
                LIST_CRM_SEQUENCES,
            ]
        );
    }

    #[test]
    fn field_name_resolves_presence_actor_column() {
        assert_eq!(
            field_name(LIST_CRM_PRESENCE, "ActorId"),
            Some("ActorId")
        );
        assert!(field_name(LIST_CRM_PRESENCE, "Missing").is_none());
    }

    #[test]
    fn each_list_has_unique_column_names() {
        for list in TEAM_WORKSPACE_LISTS {
            let mut names = list
                .columns
                .iter()
                .map(|column| column.name)
                .collect::<Vec<_>>();
            names.sort_unstable();
            names.dedup();
            assert_eq!(
                names.len(),
                list.columns.len(),
                "duplicate column in {}",
                list.display_name
            );
        }
    }
}
