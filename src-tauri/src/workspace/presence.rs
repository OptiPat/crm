//! Présence collaborative (consultation en cours).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const DEFAULT_PRESENCE_STALE_SECS: i64 = 120;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceRecord {
    pub item_id: String,
    pub etag: String,
    pub entity_type: String,
    pub entity_id: String,
    pub actor_id: String,
    pub actor_display_name: Option<String>,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PresenceHeartbeatDecision {
    Create {
        last_seen_at: String,
    },
    Update {
        item_id: String,
        etag: String,
        last_seen_at: String,
    },
}

pub fn presence_last_seen_at(now: DateTime<Utc>) -> String {
    now.to_rfc3339()
}

pub fn is_presence_stale(last_seen_at: &str, now: DateTime<Utc>, stale_secs: i64) -> bool {
    DateTime::parse_from_rfc3339(last_seen_at.trim())
        .ok()
        .map(|seen| {
            let cutoff = now - chrono::Duration::seconds(stale_secs);
            seen.with_timezone(&Utc) < cutoff
        })
        .unwrap_or(true)
}

pub fn evaluate_presence_heartbeat(
    existing: Option<&PresenceRecord>,
    now: DateTime<Utc>,
) -> PresenceHeartbeatDecision {
    let last_seen_at = presence_last_seen_at(now);
    match existing {
        Some(record) => PresenceHeartbeatDecision::Update {
            item_id: record.item_id.clone(),
            etag: record.etag.clone(),
            last_seen_at,
        },
        None => PresenceHeartbeatDecision::Create { last_seen_at },
    }
}

pub fn filter_active_presence<'a>(
    records: &'a [PresenceRecord],
    now: DateTime<Utc>,
    stale_secs: i64,
) -> Vec<&'a PresenceRecord> {
    records
        .iter()
        .filter(|record| !is_presence_stale(&record.last_seen_at, now, stale_secs))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample_record(actor: &str, last_seen: &str) -> PresenceRecord {
        PresenceRecord {
            item_id: "1".into(),
            etag: "\"1\"".into(),
            entity_type: "contact".into(),
            entity_id: "7".into(),
            actor_id: actor.into(),
            actor_display_name: Some("Conseiller".into()),
            last_seen_at: last_seen.into(),
        }
    }

    #[test]
    fn heartbeat_creates_when_absent() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        assert!(matches!(
            evaluate_presence_heartbeat(None, now),
            PresenceHeartbeatDecision::Create { .. }
        ));
    }

    #[test]
    fn heartbeat_updates_existing_row() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let existing = sample_record("a@example.com", "2026-01-01T09:00:00Z");
        assert!(matches!(
            evaluate_presence_heartbeat(Some(&existing), now),
            PresenceHeartbeatDecision::Update { .. }
        ));
    }

    #[test]
    fn filter_active_presence_drops_stale_entries() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let records = vec![
            sample_record("a@example.com", "2026-01-01T09:58:00Z"),
            sample_record("b@example.com", "2026-01-01T09:00:00Z"),
        ];
        let active = filter_active_presence(&records, now, 120);
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].actor_id, "a@example.com");
    }
}
