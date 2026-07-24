//! Orchestration Graph pour présence, verrous et audit (mode équipe).

use crate::database::workspace::WorkspaceConfig;
use crate::workspace::actor::normalize_actor_id;
use crate::workspace::audit::{build_audit_fields, AuditRecord};
use crate::workspace::lock::{
    evaluate_lock_acquire, evaluate_lock_release, LockAcquireDecision, LockRecord,
    LockReleaseDecision, DEFAULT_LOCK_TTL_SECS,
};
use crate::workspace::presence::{
    evaluate_presence_heartbeat, filter_active_presence, PresenceHeartbeatDecision,
    PresenceRecord, DEFAULT_PRESENCE_STALE_SECS,
};
use crate::workspace::sharepoint::{
    GraphWriteConflict, GraphWriteOutcome, ParsedSharePointListItem, SharePointGraphClient,
    LIST_CRM_AUDIT, LIST_CRM_LOCKS, LIST_CRM_PRESENCE, TEAM_WORKSPACE_LISTS,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use super::commands::resolve_microsoft_team_connection;
use crate::workspace::guard::resolve_sharepoint_site_ref;
use crate::workspace::identity::require_sensitive_team_authority;

pub const WORKSPACE_NOT_PROVISIONED_MESSAGE: &str =
    "Espace équipe non provisionné sur SharePoint. Le conseiller doit lancer le provisionnement.";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamPresenceView {
    pub actor_id: String,
    pub actor_display_name: Option<String>,
    pub entity_type: String,
    pub entity_id: String,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamLockView {
    pub lock_key: String,
    pub entity_type: String,
    pub entity_id: String,
    pub holder_id: String,
    pub holder_display_name: Option<String>,
    pub expires_at: String,
    pub acquired_at: String,
    pub item_id: String,
    pub etag: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamLockAcquireResponse {
    pub acquired: bool,
    pub lock: Option<TeamLockView>,
    pub held_by: Option<String>,
    pub conflict: Option<GraphWriteConflict>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamAuditView {
    pub item_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub actor_id: String,
    pub action: String,
    pub detail: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone)]
struct TeamCollaborationSession {
    client: SharePointGraphClient,
    access_token: String,
    site_id: String,
    actor_id: String,
    actor_display_name: Option<String>,
}

pub fn is_team_workspace_provisioned(config: &WorkspaceConfig) -> bool {
    config
        .site_id
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
}

pub fn require_provisioned_team_workspace(config: &WorkspaceConfig) -> Result<(), String> {
    if config.mode.is_team() && is_team_workspace_provisioned(config) {
        Ok(())
    } else if !config.mode.is_team() {
        Err("Collaboration équipe disponible uniquement en mode équipe.".into())
    } else {
        Err(WORKSPACE_NOT_PROVISIONED_MESSAGE.into())
    }
}

fn open_collaboration_session(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<TeamCollaborationSession, String> {
    require_provisioned_team_workspace(config)?;
    let authority = require_sensitive_team_authority(app, config)?;
    let connection = resolve_microsoft_team_connection(app)?
        .ok_or_else(|| "Connectez d'abord un compte Microsoft équipe.".to_string())?;
    let site_id = config
        .site_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| WORKSPACE_NOT_PROVISIONED_MESSAGE.to_string())?;
    let site = resolve_sharepoint_site_ref(config)?;
    let (actor_id, actor_display_name) = if let Some(ref identity) = authority.identity {
        let actor_id = if identity.microsoft_oid.trim().is_empty() {
            normalize_actor_id(&identity.email)
        } else {
            identity.microsoft_oid.trim().to_lowercase()
        };
        (actor_id, identity.display_name.clone())
    } else {
        (
            normalize_actor_id(&connection.email),
            None,
        )
    };
    Ok(TeamCollaborationSession {
        client: SharePointGraphClient::new(site),
        access_token: connection.access_token,
        site_id: site_id.to_string(),
        actor_id,
        actor_display_name,
    })
}

fn odata_quote(value: &str) -> String {
    value.replace('\'', "''")
}

fn entity_filter(entity_type: &str, entity_id: &str) -> String {
    format!(
        "fields/EntityType eq '{}' and fields/EntityId eq '{}'",
        odata_quote(entity_type.trim()),
        odata_quote(entity_id.trim())
    )
}

fn field_string(fields: &Value, name: &str) -> Option<String> {
    fields
        .get(name)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn map_presence(item: &ParsedSharePointListItem) -> Option<PresenceRecord> {
    Some(PresenceRecord {
        item_id: item.id.clone(),
        etag: item.etag.clone(),
        entity_type: field_string(&item.fields, "EntityType")?,
        entity_id: field_string(&item.fields, "EntityId")?,
        actor_id: normalize_actor_id(field_string(&item.fields, "ActorId")?.as_str()),
        actor_display_name: field_string(&item.fields, "ActorDisplayName"),
        last_seen_at: field_string(&item.fields, "LastSeenAt")?,
    })
}

fn map_lock(item: &ParsedSharePointListItem) -> Option<LockRecord> {
    Some(LockRecord {
        item_id: item.id.clone(),
        etag: item.etag.clone(),
        lock_key: field_string(&item.fields, "LockKey")?,
        entity_type: field_string(&item.fields, "EntityType")?,
        entity_id: field_string(&item.fields, "EntityId")?,
        holder_id: normalize_actor_id(field_string(&item.fields, "HolderId")?.as_str()),
        holder_display_name: field_string(&item.fields, "HolderDisplayName"),
        expires_at: field_string(&item.fields, "ExpiresAt")?,
        acquired_at: field_string(&item.fields, "AcquiredAt")?,
    })
}

fn map_audit(item: &ParsedSharePointListItem) -> Option<AuditRecord> {
    Some(AuditRecord {
        item_id: item.id.clone(),
        entity_type: field_string(&item.fields, "EntityType")?,
        entity_id: field_string(&item.fields, "EntityId")?,
        actor_id: normalize_actor_id(field_string(&item.fields, "ActorId")?.as_str()),
        action: field_string(&item.fields, "Action")?,
        detail: field_string(&item.fields, "Detail"),
        created_at: field_string(&item.fields, "CreatedAt")?,
    })
}

fn resolve_list_id(
    session: &TeamCollaborationSession,
    display_name: &str,
) -> Result<String, String> {
    session
        .client
        .find_list_by_display_name_blocking(
            &session.access_token,
            &session.site_id,
            display_name,
        )?
        .map(|list| list.id)
        .ok_or_else(|| format!("Liste SharePoint introuvable : {display_name}"))
}

pub fn provision_team_workspace(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<WorkspaceConfig, String> {
    if !config.mode.is_team() {
        return Err("Le provisionnement SharePoint requiert le mode équipe.".into());
    }
    let connection = resolve_microsoft_team_connection(app)?
        .ok_or_else(|| "Connectez d'abord un compte Microsoft équipe.".to_string())?;
    let site_ref = resolve_sharepoint_site_ref(config)?;
    let client = SharePointGraphClient::new(site_ref);
    let site = client.resolve_site_blocking(&connection.access_token)?;
    for list_def in TEAM_WORKSPACE_LISTS {
        client.ensure_team_list_blocking(&connection.access_token, &site.id, list_def)?;
    }
    Ok(WorkspaceConfig {
        site_id: Some(site.id),
        site_name: Some(site.name),
        ..config.clone()
    })
}

pub fn team_presence_heartbeat(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: &str,
    entity_id: &str,
) -> Result<TeamPresenceView, String> {
    let session = open_collaboration_session(app, config)?;
    let list_id = resolve_list_id(&session, LIST_CRM_PRESENCE)?;
    let filter = format!(
        "{} and fields/ActorId eq '{}'",
        entity_filter(entity_type, entity_id),
        odata_quote(&session.actor_id)
    );
    let items = session.client.list_items_all_blocking(
        &session.access_token,
        &session.site_id,
        &list_id,
        Some(&filter),
    )?;
    let existing = items.iter().find_map(map_presence);
    let now = Utc::now();
    let decision = evaluate_presence_heartbeat(existing.as_ref(), now);
    let item = match decision {
        PresenceHeartbeatDecision::Create { last_seen_at } => {
            session.client.create_list_item_blocking(
                &session.access_token,
                &session.site_id,
                &list_id,
                json!({
                    "EntityType": entity_type.trim(),
                    "EntityId": entity_id.trim(),
                    "ActorId": session.actor_id,
                    "ActorDisplayName": session.actor_display_name,
                    "LastSeenAt": last_seen_at,
                }),
            )?
        }
        PresenceHeartbeatDecision::Update {
            item_id,
            etag,
            last_seen_at,
        } => {
            let outcome = session.client.patch_list_item_fields_blocking(
                &session.access_token,
                &session.site_id,
                &list_id,
                &item_id,
                &etag,
                json!({ "LastSeenAt": last_seen_at }),
            )?;
            match outcome {
                GraphWriteOutcome::Applied { entity } => ParsedSharePointListItem {
                    id: entity.id,
                    etag: entity.etag,
                    fields: json!({
                        "EntityType": entity_type.trim(),
                        "EntityId": entity_id.trim(),
                        "ActorId": session.actor_id,
                        "ActorDisplayName": session.actor_display_name,
                        "LastSeenAt": last_seen_at,
                    }),
                },
                GraphWriteOutcome::Conflict(conflict) => {
                    return Err(format!("Conflit présence SharePoint : {conflict:?}"))
                }
            }
        }
    };
    let record = map_presence(&item).ok_or_else(|| "Présence SharePoint invalide.".to_string())?;
    Ok(TeamPresenceView {
        actor_id: record.actor_id,
        actor_display_name: record.actor_display_name,
        entity_type: record.entity_type,
        entity_id: record.entity_id,
        last_seen_at: record.last_seen_at,
    })
}

pub fn team_list_presence(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: &str,
    entity_id: &str,
) -> Result<Vec<TeamPresenceView>, String> {
    let session = open_collaboration_session(app, config)?;
    let list_id = resolve_list_id(&session, LIST_CRM_PRESENCE)?;
    let filter = entity_filter(entity_type, entity_id);
    let items = session.client.list_items_all_blocking(
        &session.access_token,
        &session.site_id,
        &list_id,
        Some(&filter),
    )?;
    let records: Vec<PresenceRecord> = items.iter().filter_map(map_presence).collect();
    let active = filter_active_presence(&records, Utc::now(), DEFAULT_PRESENCE_STALE_SECS);
    Ok(active
        .into_iter()
        .map(|record| TeamPresenceView {
            actor_id: record.actor_id.clone(),
            actor_display_name: record.actor_display_name.clone(),
            entity_type: record.entity_type.clone(),
            entity_id: record.entity_id.clone(),
            last_seen_at: record.last_seen_at.clone(),
        })
        .collect())
}

fn lock_fields(
    entity_type: &str,
    entity_id: &str,
    actor_id: &str,
    actor_display_name: &Option<String>,
    expires_at: &str,
    acquired_at: &str,
) -> Value {
    json!({
        "LockKey": super::lock::lock_key(entity_type, entity_id),
        "EntityType": entity_type.trim(),
        "EntityId": entity_id.trim(),
        "HolderId": actor_id,
        "HolderDisplayName": actor_display_name,
        "ExpiresAt": expires_at,
        "AcquiredAt": acquired_at,
    })
}

fn lock_to_view(record: LockRecord) -> TeamLockView {
    TeamLockView {
        lock_key: record.lock_key,
        entity_type: record.entity_type,
        entity_id: record.entity_id,
        holder_id: record.holder_id,
        holder_display_name: record.holder_display_name,
        expires_at: record.expires_at,
        acquired_at: record.acquired_at,
        item_id: record.item_id,
        etag: record.etag,
    }
}

pub fn team_acquire_lock(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: &str,
    entity_id: &str,
) -> Result<TeamLockAcquireResponse, String> {
    team_acquire_lock_with_ttl(
        app,
        config,
        entity_type,
        entity_id,
        DEFAULT_LOCK_TTL_SECS,
    )
}

pub fn team_acquire_lock_with_ttl(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: &str,
    entity_id: &str,
    ttl_secs: i64,
) -> Result<TeamLockAcquireResponse, String> {
    team_acquire_lock_with_ttl_as(app, config, entity_type, entity_id, ttl_secs, None)
}

pub(crate) fn team_acquire_lock_with_ttl_as(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: &str,
    entity_id: &str,
    ttl_secs: i64,
    holder_suffix: Option<&str>,
) -> Result<TeamLockAcquireResponse, String> {
    if !(30..=900).contains(&ttl_secs) {
        return Err("Durée du bail collaboratif invalide.".into());
    }
    let session = open_collaboration_session(app, config)?;
    let holder_id = holder_suffix
        .map(|suffix| format!("{}#{suffix}", session.actor_id))
        .unwrap_or_else(|| session.actor_id.clone());
    let list_id = resolve_list_id(&session, LIST_CRM_LOCKS)?;
    let lock_key = super::lock::lock_key(entity_type, entity_id);
    let filter = format!("fields/LockKey eq '{}'", odata_quote(&lock_key));
    let items = session.client.list_items_all_blocking(
        &session.access_token,
        &session.site_id,
        &list_id,
        Some(&filter),
    )?;
    let existing = items.iter().find_map(map_lock);
    let now = Utc::now();
    let decision = evaluate_lock_acquire(
        existing.as_ref(),
        &holder_id,
        now,
        entity_type,
        entity_id,
        ttl_secs,
    );

    match decision {
        LockAcquireDecision::DenyHeldByOther {
            holder_id,
            expires_at: _,
        } => Ok(TeamLockAcquireResponse {
            acquired: false,
            lock: None,
            held_by: Some(holder_id),
            conflict: None,
        }),
        LockAcquireDecision::CreateNew {
            lock_key: _,
            expires_at,
            acquired_at,
        } => {
            let item = session.client.create_list_item_blocking(
                &session.access_token,
                &session.site_id,
                &list_id,
                lock_fields(
                    entity_type,
                    entity_id,
                    &holder_id,
                    &session.actor_display_name,
                    &expires_at,
                    &acquired_at,
                ),
            )?;
            let record = map_lock(&item).ok_or_else(|| "Verrou SharePoint invalide.".to_string())?;
            Ok(TeamLockAcquireResponse {
                acquired: true,
                lock: Some(lock_to_view(record)),
                held_by: None,
                conflict: None,
            })
        }
        LockAcquireDecision::Renew {
            item_id,
            etag,
            expires_at,
        } => {
            let acquired_at = existing
                .as_ref()
                .map(|record| record.acquired_at.clone())
                .unwrap_or_else(|| now.to_rfc3339());
            patch_existing_lock(
                &session,
                &list_id,
                entity_type,
                entity_id,
                &lock_key,
                &item_id,
                &etag,
                &expires_at,
                &acquired_at,
                &holder_id,
            )
        }
        LockAcquireDecision::Takeover {
            item_id,
            etag,
            expires_at,
            acquired_at,
        } => patch_existing_lock(
            &session,
            &list_id,
            entity_type,
            entity_id,
            &lock_key,
            &item_id,
            &etag,
            &expires_at,
            &acquired_at,
            &holder_id,
        ),
    }
}

fn patch_existing_lock(
    session: &TeamCollaborationSession,
    list_id: &str,
    entity_type: &str,
    entity_id: &str,
    lock_key: &str,
    item_id: &str,
    etag: &str,
    expires_at: &str,
    acquired_at: &str,
    holder_id: &str,
) -> Result<TeamLockAcquireResponse, String> {
    let outcome = session.client.patch_list_item_fields_blocking(
        &session.access_token,
        &session.site_id,
        list_id,
        item_id,
        etag,
        lock_fields(
            entity_type,
            entity_id,
            holder_id,
            &session.actor_display_name,
            expires_at,
            acquired_at,
        ),
    )?;
    match outcome {
        GraphWriteOutcome::Applied { entity } => Ok(TeamLockAcquireResponse {
            acquired: true,
            lock: Some(TeamLockView {
                lock_key: lock_key.to_string(),
                entity_type: entity_type.trim().to_string(),
                entity_id: entity_id.trim().to_string(),
                holder_id: holder_id.to_string(),
                holder_display_name: session.actor_display_name.clone(),
                expires_at: expires_at.to_string(),
                acquired_at: acquired_at.to_string(),
                item_id: entity.id,
                etag: entity.etag,
            }),
            held_by: None,
            conflict: None,
        }),
        GraphWriteOutcome::Conflict(conflict) => Ok(TeamLockAcquireResponse {
            acquired: false,
            lock: None,
            held_by: None,
            conflict: Some(conflict),
        }),
    }
}

pub fn team_renew_lock(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: &str,
    entity_id: &str,
    _etag: &str,
) -> Result<TeamLockAcquireResponse, String> {
    team_acquire_lock(app, config, entity_type, entity_id)
}

pub fn team_release_lock(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), String> {
    let session = open_collaboration_session(app, config)?;
    let list_id = resolve_list_id(&session, LIST_CRM_LOCKS)?;
    let lock_key = super::lock::lock_key(entity_type, entity_id);
    let filter = format!("fields/LockKey eq '{}'", odata_quote(&lock_key));
    let items = session.client.list_items_all_blocking(
        &session.access_token,
        &session.site_id,
        &list_id,
        Some(&filter),
    )?;
    let existing = items.iter().find_map(map_lock);
    match evaluate_lock_release(existing.as_ref(), &session.actor_id) {
        LockReleaseDecision::NotFound | LockReleaseDecision::NotHolder => Ok(()),
        LockReleaseDecision::Allowed { item_id, etag } => {
            match session.client.delete_list_item_blocking(
                &session.access_token,
                &session.site_id,
                &list_id,
                &item_id,
                &etag,
            )? {
                GraphWriteOutcome::Applied { .. } | GraphWriteOutcome::Conflict(GraphWriteConflict::NotFound) => {
                    Ok(())
                }
                GraphWriteOutcome::Conflict(other) => Err(format!("Libération verrou SharePoint : {other:?}")),
            }
        }
    }
}

pub fn team_append_audit(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    detail: Option<&str>,
) -> Result<TeamAuditView, String> {
    let session = open_collaboration_session(app, config)?;
    let list_id = resolve_list_id(&session, LIST_CRM_AUDIT)?;
    let now = Utc::now();
    let fields: Value = build_audit_fields(
        entity_type,
        entity_id,
        &session.actor_id,
        action,
        detail,
        now,
    )
    .into_iter()
    .map(|(key, value)| (key.to_string(), Value::String(value)))
    .collect();
    let item = session.client.create_list_item_blocking(
        &session.access_token,
        &session.site_id,
        &list_id,
        fields,
    )?;
    let record = map_audit(&item).ok_or_else(|| "Audit SharePoint invalide.".to_string())?;
    Ok(TeamAuditView {
        item_id: record.item_id,
        entity_type: record.entity_type,
        entity_id: record.entity_id,
        actor_id: record.actor_id,
        action: record.action,
        detail: record.detail,
        created_at: record.created_at,
    })
}

pub fn team_list_audit(
    app: &AppHandle,
    config: &WorkspaceConfig,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
    limit: Option<u32>,
) -> Result<Vec<TeamAuditView>, String> {
    let session = open_collaboration_session(app, config)?;
    let list_id = resolve_list_id(&session, LIST_CRM_AUDIT)?;
    let filter = match (entity_type, entity_id) {
        (Some(entity_type), Some(entity_id)) => Some(entity_filter(entity_type, entity_id)),
        (None, None) => None,
        _ => return Err("Les filtres d'audit doivent être fournis ensemble.".into()),
    };
    let items = session.client.list_items_all_blocking(
        &session.access_token,
        &session.site_id,
        &list_id,
        filter.as_deref(),
    )?;
    let max = limit.unwrap_or(50) as usize;
    let mut views: Vec<TeamAuditView> = items
        .iter()
        .filter_map(map_audit)
        .map(|record| TeamAuditView {
            item_id: record.item_id,
            entity_type: record.entity_type,
            entity_id: record.entity_id,
            actor_id: record.actor_id,
            action: record.action,
            detail: record.detail,
            created_at: record.created_at,
        })
        .collect();
    views.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    views.truncate(max);
    Ok(views)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::mode::WorkspaceMode;
    use crate::workspace::team::TeamRole;

    #[test]
    fn provisioned_requires_site_id_in_team_mode() {
        let config = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Advisor),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            site_id: Some("site-123".into()),
            site_name: Some("CRM".into()),
            office_mailbox_email: None,
            ..Default::default()
        };
        assert!(is_team_workspace_provisioned(&config));
        assert!(require_provisioned_team_workspace(&config).is_ok());
    }

    #[test]
    fn not_provisioned_when_site_id_missing() {
        let config = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(TeamRole::Secretary),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            site_id: None,
            site_name: None,
            office_mailbox_email: None,
            ..Default::default()
        };
        assert!(!is_team_workspace_provisioned(&config));
        let err = require_provisioned_team_workspace(&config).unwrap_err();
        assert!(err.contains("provisionné"));
    }

    #[test]
    fn map_lock_reads_sharepoint_fields() {
        let item = ParsedSharePointListItem {
            id: "9".into(),
            etag: "\"1\"".into(),
            fields: json!({
                "LockKey": "contact:7",
                "EntityType": "contact",
                "EntityId": "7",
                "HolderId": "A@Example.com",
                "ExpiresAt": "2026-01-01T10:05:00Z",
                "AcquiredAt": "2026-01-01T10:00:00Z"
            }),
        };
        let record = map_lock(&item).unwrap();
        assert_eq!(record.holder_id, "a@example.com");
        assert_eq!(record.lock_key, "contact:7");
    }
}
