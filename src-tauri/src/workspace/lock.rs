//! Verrou collaboratif à bail TTL (jamais de hard-lock sans expiration).

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

pub const DEFAULT_LOCK_TTL_SECS: i64 = 90;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockRecord {
    pub item_id: String,
    pub etag: String,
    pub lock_key: String,
    pub entity_type: String,
    pub entity_id: String,
    pub holder_id: String,
    pub holder_display_name: Option<String>,
    pub expires_at: String,
    pub acquired_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LockAcquireDecision {
    CreateNew {
        lock_key: String,
        expires_at: String,
        acquired_at: String,
    },
    Takeover {
        item_id: String,
        etag: String,
        expires_at: String,
        acquired_at: String,
    },
    Renew {
        item_id: String,
        etag: String,
        expires_at: String,
    },
    DenyHeldByOther {
        holder_id: String,
        expires_at: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LockReleaseDecision {
    Allowed {
        item_id: String,
        etag: String,
    },
    NotHolder,
    NotFound,
}

pub fn lock_key(entity_type: &str, entity_id: &str) -> String {
    format!("{}:{}", entity_type.trim(), entity_id.trim())
}

pub fn lock_expires_at(now: DateTime<Utc>, ttl_secs: i64) -> String {
    (now + Duration::seconds(ttl_secs)).to_rfc3339()
}

pub fn parse_rfc3339(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value.trim())
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

pub fn is_lock_expired(expires_at: &str, now: DateTime<Utc>) -> bool {
    parse_rfc3339(expires_at)
        .map(|expiry| expiry <= now)
        .unwrap_or(true)
}

pub fn evaluate_lock_acquire(
    existing: Option<&LockRecord>,
    actor_id: &str,
    now: DateTime<Utc>,
    entity_type: &str,
    entity_id: &str,
    ttl_secs: i64,
) -> LockAcquireDecision {
    let key = lock_key(entity_type, entity_id);
    let Some(record) = existing else {
        return LockAcquireDecision::CreateNew {
            lock_key: key,
            expires_at: lock_expires_at(now, ttl_secs),
            acquired_at: now.to_rfc3339(),
        };
    };

    if is_lock_expired(&record.expires_at, now) || record.holder_id == actor_id {
        if record.holder_id == actor_id && !is_lock_expired(&record.expires_at, now) {
            return LockAcquireDecision::Renew {
                item_id: record.item_id.clone(),
                etag: record.etag.clone(),
                expires_at: lock_expires_at(now, ttl_secs),
            };
        }
        return LockAcquireDecision::Takeover {
            item_id: record.item_id.clone(),
            etag: record.etag.clone(),
            expires_at: lock_expires_at(now, ttl_secs),
            acquired_at: now.to_rfc3339(),
        };
    }

    LockAcquireDecision::DenyHeldByOther {
        holder_id: record.holder_id.clone(),
        expires_at: record.expires_at.clone(),
    }
}

pub fn evaluate_lock_release(record: Option<&LockRecord>, actor_id: &str) -> LockReleaseDecision {
    let Some(record) = record else {
        return LockReleaseDecision::NotFound;
    };
    if record.holder_id != actor_id {
        return LockReleaseDecision::NotHolder;
    }
    LockReleaseDecision::Allowed {
        item_id: record.item_id.clone(),
        etag: record.etag.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample_record(holder: &str, expires_at: &str) -> LockRecord {
        LockRecord {
            item_id: "42".into(),
            etag: "\"1\"".into(),
            lock_key: "contact:7".into(),
            entity_type: "contact".into(),
            entity_id: "7".into(),
            holder_id: holder.into(),
            holder_display_name: Some("Conseiller A".into()),
            expires_at: expires_at.into(),
            acquired_at: "2026-01-01T10:00:00Z".into(),
        }
    }

    #[test]
    fn lock_key_composes_entity_type_and_id() {
        assert_eq!(lock_key("contact", "12"), "contact:12");
    }

    #[test]
    fn acquire_creates_when_no_existing_lock() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let decision = evaluate_lock_acquire(None, "a@example.com", now, "contact", "7", 90);
        assert!(matches!(decision, LockAcquireDecision::CreateNew { .. }));
    }

    #[test]
    fn acquire_renews_for_same_holder_before_expiry() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let existing = sample_record("a@example.com", "2026-01-01T10:01:00Z");
        let decision =
            evaluate_lock_acquire(Some(&existing), "a@example.com", now, "contact", "7", 90);
        assert!(matches!(decision, LockAcquireDecision::Renew { .. }));
    }

    #[test]
    fn acquire_denies_active_lock_from_other_holder() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let existing = sample_record("other@example.com", "2026-01-01T10:05:00Z");
        let decision =
            evaluate_lock_acquire(Some(&existing), "a@example.com", now, "contact", "7", 90);
        assert!(matches!(
            decision,
            LockAcquireDecision::DenyHeldByOther { .. }
        ));
    }

    #[test]
    fn acquire_allows_takeover_when_expired() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 10, 0).unwrap();
        let existing = sample_record("other@example.com", "2026-01-01T10:00:00Z");
        let decision =
            evaluate_lock_acquire(Some(&existing), "a@example.com", now, "contact", "7", 90);
        assert!(matches!(decision, LockAcquireDecision::Takeover { .. }));
    }

    #[test]
    fn release_only_by_holder() {
        let record = sample_record("a@example.com", "2026-01-01T10:05:00Z");
        assert!(matches!(
            evaluate_lock_release(Some(&record), "a@example.com"),
            LockReleaseDecision::Allowed { .. }
        ));
        assert!(matches!(
            evaluate_lock_release(Some(&record), "other@example.com"),
            LockReleaseDecision::NotHolder
        ));
    }

    #[test]
    fn is_lock_expired_treats_invalid_date_as_expired() {
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        assert!(is_lock_expired("not-a-date", now));
    }
}
