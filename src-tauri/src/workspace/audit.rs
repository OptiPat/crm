//! Journal d'audit append-only (aucune mutation exposée).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRecord {
    pub item_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub actor_id: String,
    pub action: String,
    pub detail: Option<String>,
    pub created_at: String,
}

pub fn audit_created_at(now: DateTime<Utc>) -> String {
    now.to_rfc3339()
}

pub fn build_audit_fields(
    entity_type: &str,
    entity_id: &str,
    actor_id: &str,
    action: &str,
    detail: Option<&str>,
    now: DateTime<Utc>,
) -> Vec<(&'static str, String)> {
    let mut fields = vec![
        ("EntityType", entity_type.trim().to_string()),
        ("EntityId", entity_id.trim().to_string()),
        ("ActorId", actor_id.trim().to_string()),
        ("Action", action.trim().to_string()),
        ("CreatedAt", audit_created_at(now)),
    ];
    if let Some(detail) = detail.map(str::trim).filter(|value| !value.is_empty()) {
        fields.push(("Detail", detail.to_string()));
    }
    fields
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn build_audit_fields_includes_optional_detail() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let fields = build_audit_fields(
            "contact",
            "7",
            "a@example.com",
            "lock_acquire",
            Some("edit"),
            now,
        );
        let map: std::collections::HashMap<_, _> = fields.into_iter().collect();
        assert_eq!(map.get("EntityType"), Some(&"contact".to_string()));
        assert_eq!(map.get("Detail"), Some(&"edit".to_string()));
    }

    #[test]
    fn build_audit_fields_omits_empty_detail() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let fields = build_audit_fields("contact", "7", "a@example.com", "view", None, now);
        assert!(!fields.iter().any(|(name, _)| *name == "Detail"));
    }
}
