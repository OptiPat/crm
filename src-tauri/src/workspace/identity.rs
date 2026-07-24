//! Résolution du rôle équipe via groupes Microsoft Entra (source d'autorité distante).

use crate::database::workspace::WorkspaceConfig;
use crate::email::oauth_send::{refresh_oauth_connection_if_needed, OAuthConnectionSlot};
use crate::workspace::mode::WorkspaceMode;
use crate::workspace::sharepoint::map_graph_http_error;
use crate::workspace::team::{capabilities_for_role, TeamCapabilities, TeamRole};
use reqwest::blocking::Client as BlockingClient;
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use super::team_connection::resolve_microsoft_team_connection;

const GRAPH_ME_URL: &str =
    "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName";
const GRAPH_CHECK_MEMBER_GROUPS_URL: &str =
    "https://graph.microsoft.com/v1.0/me/checkMemberGroups";
const IDENTITY_CACHE_TTL: Duration = Duration::from_secs(60);
const GRAPH_RATE_LIMIT_RETRIES: u32 = 3;
const GRAPH_RATE_LIMIT_PAUSE_SECS: u64 = 2;

pub const ENTRA_GROUPS_REQUIRED_MESSAGE: &str =
    "Configurez les groupes Microsoft Entra conseiller et secrétaire (Paramètres → Mode équipe) \
     avant d'utiliser les opérations sensibles sur un espace provisionné.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthoritativeTeamIdentity {
    pub microsoft_oid: String,
    pub email: String,
    pub display_name: Option<String>,
    pub role: TeamRole,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoleSource {
    LocalDefault,
    BootstrapAdvisor,
    EntraGroups,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceAuthority {
    pub role: TeamRole,
    pub capabilities: TeamCapabilities,
    pub identity: Option<AuthoritativeTeamIdentity>,
    pub role_source: RoleSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoleResolutionError {
    NoMembership,
    BothGroups,
    InvalidAdvisorGroupId,
    InvalidSecretaryGroupId,
    IdenticalGroupIds,
}

struct CachedIdentityEntry {
    cache_key: String,
    fetched_at: Instant,
    identity: AuthoritativeTeamIdentity,
}

static IDENTITY_CACHE: OnceLock<Mutex<Option<CachedIdentityEntry>>> = OnceLock::new();
static HTTP_CLIENT: OnceLock<BlockingClient> = OnceLock::new();

fn identity_cache() -> &'static Mutex<Option<CachedIdentityEntry>> {
    IDENTITY_CACHE.get_or_init(|| Mutex::new(None))
}

fn http_client() -> &'static BlockingClient {
    HTTP_CLIENT.get_or_init(BlockingClient::new)
}

pub fn clear_authoritative_identity_cache() {
    if let Ok(mut guard) = identity_cache().lock() {
        *guard = None;
    }
}

pub fn is_valid_uuid(value: &str) -> bool {
    let s = value.trim();
    if s.len() != 36 {
        return false;
    }
    let bytes = s.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        match index {
            8 | 13 | 18 | 23 => {
                if *byte != b'-' {
                    return false;
                }
            }
            _ => {
                if !byte.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

pub fn entra_groups_configured(config: &WorkspaceConfig) -> bool {
    let advisor = config
        .advisor_group_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let secretary = config
        .secretary_group_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    match (advisor, secretary) {
        (Some(advisor_id), Some(secretary_id)) => {
            is_valid_uuid(advisor_id)
                && is_valid_uuid(secretary_id)
                && !advisor_id.eq_ignore_ascii_case(secretary_id)
        }
        _ => false,
    }
}

pub fn resolve_role_from_group_membership(
    advisor_group_id: &str,
    secretary_group_id: &str,
    member_group_ids: &[String],
) -> Result<TeamRole, RoleResolutionError> {
    if !is_valid_uuid(advisor_group_id) {
        return Err(RoleResolutionError::InvalidAdvisorGroupId);
    }
    if !is_valid_uuid(secretary_group_id) {
        return Err(RoleResolutionError::InvalidSecretaryGroupId);
    }
    if advisor_group_id.eq_ignore_ascii_case(secretary_group_id) {
        return Err(RoleResolutionError::IdenticalGroupIds);
    }
    let in_advisor = member_group_ids
        .iter()
        .any(|id| id.eq_ignore_ascii_case(advisor_group_id));
    let in_secretary = member_group_ids
        .iter()
        .any(|id| id.eq_ignore_ascii_case(secretary_group_id));
    match (in_advisor, in_secretary) {
        (true, false) => Ok(TeamRole::Advisor),
        (false, true) => Ok(TeamRole::Secretary),
        (false, false) => Err(RoleResolutionError::NoMembership),
        (true, true) => Err(RoleResolutionError::BothGroups),
    }
}

pub fn role_resolution_error_message(error: RoleResolutionError) -> String {
    match error {
        RoleResolutionError::NoMembership => {
            "Ce compte Microsoft n'appartient à aucun groupe CRM configuré (conseiller ou secrétaire)."
                .into()
        }
        RoleResolutionError::BothGroups => {
            "Ce compte Microsoft appartient aux deux groupes CRM — un seul rôle est autorisé.".into()
        }
        RoleResolutionError::InvalidAdvisorGroupId => {
            "Identifiant du groupe conseiller Microsoft Entra invalide (UUID attendu).".into()
        }
        RoleResolutionError::InvalidSecretaryGroupId => {
            "Identifiant du groupe secrétaire Microsoft Entra invalide (UUID attendu).".into()
        }
        RoleResolutionError::IdenticalGroupIds => {
            "Les groupes conseiller et secrétaire doivent être distincts.".into()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedMeProfile {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
}

pub fn parse_me_profile(json: &str) -> Result<ParsedMeProfile, String> {
    let value: Value = serde_json::from_str(json).map_err(|error| error.to_string())?;
    let id = value
        .get("id")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .ok_or_else(|| "Profil Microsoft sans identifiant (id).".to_string())?
        .to_string();
    let email = value
        .get("mail")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .or_else(|| {
            value
                .get("userPrincipalName")
                .and_then(|item| item.as_str())
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string)
        })
        .ok_or_else(|| "Profil Microsoft sans adresse email.".to_string())?;
    let display_name = value
        .get("displayName")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string);
    Ok(ParsedMeProfile {
        id,
        email,
        display_name,
    })
}

pub fn parse_check_member_groups_response(json: &str) -> Result<Vec<String>, String> {
    let value: Value = serde_json::from_str(json).map_err(|error| error.to_string())?;
    let items = value
        .get("value")
        .and_then(|item| item.as_array())
        .ok_or_else(|| "Réponse checkMemberGroups sans tableau value.".to_string())?;
    Ok(items
        .iter()
        .filter_map(|item| item.as_str().map(str::trim).filter(|s| !s.is_empty()))
        .map(str::to_string)
        .collect())
}

fn graph_get_blocking(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
) -> Result<(u16, String), String> {
    let response = client
        .get(url)
        .bearer_auth(access_token)
        .send()
        .map_err(|error| format!("Requête Microsoft Graph impossible : {error}"))?;
    Ok((response.status().as_u16(), response.text().unwrap_or_default()))
}

fn graph_post_blocking(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    payload: &Value,
) -> Result<(u16, String), String> {
    let response = client
        .post(url)
        .bearer_auth(access_token)
        .json(payload)
        .send()
        .map_err(|error| format!("Requête Microsoft Graph impossible : {error}"))?;
    Ok((response.status().as_u16(), response.text().unwrap_or_default()))
}

fn graph_get_with_retry(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    label: &str,
) -> Result<(u16, String), String> {
    for attempt in 0..GRAPH_RATE_LIMIT_RETRIES {
        let (status, body) = graph_get_blocking(client, url, access_token)?;
        if status == 429 && attempt + 1 < GRAPH_RATE_LIMIT_RETRIES {
            thread::sleep(Duration::from_secs(GRAPH_RATE_LIMIT_PAUSE_SECS));
            continue;
        }
        if status == 401 || status == 403 || status == 429 {
            return Err(format!("{label} : {}", map_graph_http_error(status, &body)));
        }
        if status >= 400 {
            return Err(format!("{label} : {}", map_graph_http_error(status, &body)));
        }
        return Ok((status, body));
    }
    Err(format!(
        "{label} : quota Microsoft Graph dépassé après plusieurs tentatives."
    ))
}

fn graph_post_with_retry(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    payload: &Value,
    label: &str,
) -> Result<(u16, String), String> {
    for attempt in 0..GRAPH_RATE_LIMIT_RETRIES {
        let (status, body) = graph_post_blocking(client, url, access_token, payload)?;
        if status == 429 && attempt + 1 < GRAPH_RATE_LIMIT_RETRIES {
            thread::sleep(Duration::from_secs(GRAPH_RATE_LIMIT_PAUSE_SECS));
            continue;
        }
        if status == 401 || status == 403 || status == 429 {
            return Err(format!("{label} : {}", map_graph_http_error(status, &body)));
        }
        if status >= 400 {
            return Err(format!("{label} : {}", map_graph_http_error(status, &body)));
        }
        return Ok((status, body));
    }
    Err(format!(
        "{label} : quota Microsoft Graph dépassé après plusieurs tentatives."
    ))
}

pub fn fetch_authoritative_team_identity_blocking(
    access_token: &str,
    advisor_group_id: &str,
    secretary_group_id: &str,
) -> Result<AuthoritativeTeamIdentity, String> {
    let client = http_client();
    let (_, me_body) =
        graph_get_with_retry(client, GRAPH_ME_URL, access_token, "Profil Microsoft")?;
    let profile = parse_me_profile(&me_body)?;
    let payload = json!({
        "groupIds": [advisor_group_id.trim(), secretary_group_id.trim()]
    });
    let (_, groups_body) = graph_post_with_retry(
        client,
        GRAPH_CHECK_MEMBER_GROUPS_URL,
        access_token,
        &payload,
        "Appartenance groupes Entra",
    )?;
    let member_group_ids = parse_check_member_groups_response(&groups_body)?;
    let role = resolve_role_from_group_membership(
        advisor_group_id,
        secretary_group_id,
        &member_group_ids,
    )
    .map_err(role_resolution_error_message)?;
    Ok(AuthoritativeTeamIdentity {
        microsoft_oid: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        role,
    })
}

fn cache_key(config: &WorkspaceConfig, oauth_email: &str) -> String {
    format!(
        "{}|{}|{}",
        config
            .advisor_group_id
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_lowercase(),
        config
            .secretary_group_id
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_lowercase(),
        oauth_email.trim().to_lowercase()
    )
}

fn fetch_authoritative_identity_cached(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<AuthoritativeTeamIdentity, String> {
    let mut connection = resolve_microsoft_team_connection(app)?
        .ok_or_else(|| "Connectez d'abord un compte Microsoft équipe.".to_string())?;
    refresh_oauth_connection_if_needed(app, &mut connection, OAuthConnectionSlot::MicrosoftTeam)?;
    let key = cache_key(config, &connection.email);
    if let Ok(guard) = identity_cache().lock() {
        if let Some(entry) = guard.as_ref() {
            if entry.cache_key == key && entry.fetched_at.elapsed() < IDENTITY_CACHE_TTL {
                return Ok(entry.identity.clone());
            }
        }
    }
    let advisor_id = config
        .advisor_group_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ENTRA_GROUPS_REQUIRED_MESSAGE.to_string())?;
    let secretary_id = config
        .secretary_group_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ENTRA_GROUPS_REQUIRED_MESSAGE.to_string())?;
    let identity = fetch_authoritative_team_identity_blocking(
        &connection.access_token,
        advisor_id,
        secretary_id,
    )?;
    if let Ok(mut guard) = identity_cache().lock() {
        *guard = Some(CachedIdentityEntry {
            cache_key: key,
            fetched_at: Instant::now(),
            identity: identity.clone(),
        });
    }
    Ok(identity)
}

fn bootstrap_identity_from_oauth(app: &AppHandle) -> Result<Option<AuthoritativeTeamIdentity>, String> {
    let connection = resolve_microsoft_team_connection(app)?;
    Ok(connection.map(|conn| AuthoritativeTeamIdentity {
        microsoft_oid: String::new(),
        email: conn.email,
        display_name: None,
        role: TeamRole::Advisor,
    }))
}

fn bootstrap_authority(app: &AppHandle) -> Result<WorkspaceAuthority, String> {
    Ok(WorkspaceAuthority {
        role: TeamRole::Advisor,
        capabilities: capabilities_for_role(TeamRole::Advisor),
        identity: bootstrap_identity_from_oauth(app)?,
        role_source: RoleSource::BootstrapAdvisor,
    })
}

pub fn resolve_authoritative_team_identity(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<WorkspaceAuthority, String> {
    if config.mode != WorkspaceMode::TeamSharepoint {
        return Ok(WorkspaceAuthority {
            role: TeamRole::Advisor,
            capabilities: capabilities_for_role(TeamRole::Advisor),
            identity: None,
            role_source: RoleSource::LocalDefault,
        });
    }

    if !entra_groups_configured(config) {
        return bootstrap_authority(app);
    }

    let identity = fetch_authoritative_identity_cached(app, config)?;
    let role = identity.role;
    Ok(WorkspaceAuthority {
        role,
        capabilities: capabilities_for_role(role),
        identity: Some(identity),
        role_source: RoleSource::EntraGroups,
    })
}

fn is_team_workspace_provisioned(config: &WorkspaceConfig) -> bool {
    config
        .site_id
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
}

pub fn require_sensitive_team_authority(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<WorkspaceAuthority, String> {
    if config.mode.is_team()
        && is_team_workspace_provisioned(config)
        && !entra_groups_configured(config)
    {
        return Err(ENTRA_GROUPS_REQUIRED_MESSAGE.to_string());
    }
    if config.mode.is_team() && entra_groups_configured(config) {
        let identity = fetch_authoritative_identity_cached(app, config)?;
        let role = identity.role;
        return Ok(WorkspaceAuthority {
            role,
            capabilities: capabilities_for_role(role),
            identity: Some(identity),
            role_source: RoleSource::EntraGroups,
        });
    }
    resolve_authoritative_team_identity(app, config)
}

pub fn can_export_with_resolved_role(role: TeamRole) -> bool {
    capabilities_for_role(role).can_export
}

pub fn can_manage_team_with_resolved_role(role: TeamRole) -> bool {
    capabilities_for_role(role).can_manage_members
}

#[cfg(test)]
mod tests {
    use super::*;

    const ADVISOR_GROUP: &str = "11111111-1111-1111-1111-111111111111";
    const SECRETARY_GROUP: &str = "22222222-2222-2222-2222-222222222222";

    #[test]
    fn is_valid_uuid_accepts_canonical_form() {
        assert!(is_valid_uuid("11111111-1111-1111-1111-111111111111"));
        assert!(is_valid_uuid("ABCDEF12-3456-7890-ABCD-EF1234567890"));
    }

    #[test]
    fn is_valid_uuid_rejects_malformed_values() {
        assert!(!is_valid_uuid(""));
        assert!(!is_valid_uuid("not-a-uuid"));
        assert!(!is_valid_uuid("11111111111111111111111111111111"));
        assert!(!is_valid_uuid("11111111-1111-1111-1111-11111111111"));
    }

    #[test]
    fn resolve_role_advisor_membership() {
        let role = resolve_role_from_group_membership(
            ADVISOR_GROUP,
            SECRETARY_GROUP,
            &[ADVISOR_GROUP.to_string()],
        )
        .unwrap();
        assert_eq!(role, TeamRole::Advisor);
    }

    #[test]
    fn resolve_role_secretary_membership() {
        let role = resolve_role_from_group_membership(
            ADVISOR_GROUP,
            SECRETARY_GROUP,
            &[SECRETARY_GROUP.to_string()],
        )
        .unwrap();
        assert_eq!(role, TeamRole::Secretary);
    }

    #[test]
    fn resolve_role_rejects_no_membership() {
        assert_eq!(
            resolve_role_from_group_membership(ADVISOR_GROUP, SECRETARY_GROUP, &[]).unwrap_err(),
            RoleResolutionError::NoMembership
        );
    }

    #[test]
    fn resolve_role_rejects_both_groups() {
        assert_eq!(
            resolve_role_from_group_membership(
                ADVISOR_GROUP,
                SECRETARY_GROUP,
                &[ADVISOR_GROUP.to_string(), SECRETARY_GROUP.to_string()]
            )
            .unwrap_err(),
            RoleResolutionError::BothGroups
        );
    }

    #[test]
    fn resolve_role_rejects_invalid_uuids_and_identical_groups() {
        assert_eq!(
            resolve_role_from_group_membership("bad", SECRETARY_GROUP, &[]).unwrap_err(),
            RoleResolutionError::InvalidAdvisorGroupId
        );
        assert_eq!(
            resolve_role_from_group_membership(ADVISOR_GROUP, "bad", &[]).unwrap_err(),
            RoleResolutionError::InvalidSecretaryGroupId
        );
        assert_eq!(
            resolve_role_from_group_membership(ADVISOR_GROUP, ADVISOR_GROUP, &[]).unwrap_err(),
            RoleResolutionError::IdenticalGroupIds
        );
    }

    #[test]
    fn parse_me_profile_extracts_email_and_display_name() {
        let json = r#"{
            "id": "oid-123",
            "mail": "Conseiller@Example.com",
            "displayName": "Conseiller CRM"
        }"#;
        let profile = parse_me_profile(json).unwrap();
        assert_eq!(profile.id, "oid-123");
        assert_eq!(profile.email, "Conseiller@Example.com");
        assert_eq!(profile.display_name.as_deref(), Some("Conseiller CRM"));
    }

    #[test]
    fn parse_me_profile_falls_back_to_user_principal_name() {
        let json = r#"{"id":"oid-456","userPrincipalName":"sec@example.com"}"#;
        let profile = parse_me_profile(json).unwrap();
        assert_eq!(profile.email, "sec@example.com");
        assert!(profile.display_name.is_none());
    }

    #[test]
    fn parse_check_member_groups_response_reads_value_array() {
        let json = r#"{"value":["11111111-1111-1111-1111-111111111111"]}"#;
        let groups = parse_check_member_groups_response(json).unwrap();
        assert_eq!(groups, vec!["11111111-1111-1111-1111-111111111111"]);
    }

    #[test]
    fn entra_groups_configured_requires_distinct_valid_uuids() {
        let mut config = WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            advisor_group_id: Some(ADVISOR_GROUP.into()),
            secretary_group_id: Some(SECRETARY_GROUP.into()),
            ..WorkspaceConfig::default()
        };
        assert!(entra_groups_configured(&config));
        config.secretary_group_id = Some(ADVISOR_GROUP.into());
        assert!(!entra_groups_configured(&config));
        config.secretary_group_id = Some("invalid".into());
        assert!(!entra_groups_configured(&config));
    }

    #[test]
    fn guard_export_with_resolved_role_matches_capabilities() {
        assert!(can_export_with_resolved_role(TeamRole::Advisor));
        assert!(!can_export_with_resolved_role(TeamRole::Secretary));
        assert!(can_manage_team_with_resolved_role(TeamRole::Advisor));
        assert!(!can_manage_team_with_resolved_role(TeamRole::Secretary));
    }

    #[test]
    fn map_graph_http_errors_do_not_leak_token() {
        let message = map_graph_http_error(401, "");
        assert!(message.contains("expirée"));
        assert!(!message.to_lowercase().contains("bearer"));
        assert!(!message.to_lowercase().contains("token"));
    }
}
