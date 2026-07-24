//! Clé stable CRM_Data.SyncKey = SHA-256(tableName + NUL + recordKey).

use sha2::{Digest, Sha256};

/// Calcule la clé de synchronisation SharePoint pour une ligne exportée.
pub fn compute_sync_key(table_name: &str, record_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(table_name.as_bytes());
    hasher.update([0_u8]);
    hasher.update(record_key.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn compute_payload_checksum(payload_json: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(payload_json.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn compute_mutation_id(sync_key: &str, revision: i64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(sync_key.as_bytes());
    hasher.update([0_u8]);
    hasher.update(revision.to_be_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn sync_key_is_deterministic() {
        let first = compute_sync_key("contacts", r#"[{"column":"id","kind":"integer","value":1}]"#);
        let second = compute_sync_key("contacts", r#"[{"column":"id","kind":"integer","value":1}]"#);
        assert_eq!(first, second);
        assert_eq!(first.len(), 64);
    }

    #[test]
    fn sync_key_differs_across_tables_for_same_record_key() {
        let record_key = r#"[{"column":"id","kind":"integer","value":42}]"#;
        let contacts = compute_sync_key("contacts", record_key);
        let taches = compute_sync_key("taches", record_key);
        assert_ne!(contacts, taches);
    }

    #[test]
    fn sync_key_inter_table_collisions_are_absent_for_distinct_pairs() {
        let pairs = [
            ("contacts", r#"[{"column":"id","kind":"integer","value":1}]"#),
            ("taches", r#"[{"column":"id","kind":"integer","value":1}]"#),
            ("contacts", r#"[{"column":"id","kind":"integer","value":2}]"#),
            ("foyers", "rowid:1"),
        ];
        let keys: HashSet<_> = pairs
            .iter()
            .map(|(table, key)| compute_sync_key(table, key))
            .collect();
        assert_eq!(keys.len(), pairs.len());
    }

    #[test]
    fn nul_separator_prevents_concatenation_ambiguity() {
        let a = compute_sync_key("ab", "c");
        let b = compute_sync_key("a", "bc");
        assert_ne!(a, b);
    }
}
