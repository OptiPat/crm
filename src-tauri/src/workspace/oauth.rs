/// Identifiant du flux OAuth PKCE dédié au mode équipe SharePoint.
pub const MICROSOFT_TEAM_FLOW_PROVIDER: &str = "microsoft_team";

pub fn microsoft_team_flow_provider() -> &'static str {
    MICROSOFT_TEAM_FLOW_PROVIDER
}

/// Endpoint tenant Microsoft 365 organisations (comptes professionnels uniquement).
pub fn microsoft_team_oauth_tenant() -> &'static str {
    "organizations"
}

/// Scopes Graph du mode équipe, limités aux sites explicitement accordés à l'application.
///
/// `Sites.Selected` ne donne aucun accès par lui-même : l'administrateur Microsoft 365
/// doit ensuite accorder l'application au site CRM avec le rôle `write`.
pub fn microsoft_team_oauth_scopes() -> &'static [&'static str] {
    &[
        "offline_access",
        "openid",
        "email",
        "https://graph.microsoft.com/User.Read",
        "https://graph.microsoft.com/GroupMember.Read.All",
        "https://graph.microsoft.com/Mail.Send.Shared",
        "https://graph.microsoft.com/Sites.Selected",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn team_oauth_uses_organizations_tenant() {
        assert_eq!(microsoft_team_oauth_tenant(), "organizations");
    }

    #[test]
    fn team_oauth_scopes_include_offline_access_and_sharepoint_permissions() {
        let scopes = microsoft_team_oauth_scopes();
        assert!(scopes.contains(&"offline_access"));
        assert!(scopes.contains(&"https://graph.microsoft.com/Sites.Selected"));
        assert!(scopes.contains(&"https://graph.microsoft.com/Mail.Send.Shared"));
        assert!(scopes
            .iter()
            .any(|s| s.contains("GroupMember.Read.All")));
        assert!(!scopes.iter().any(|s| s.ends_with(".All") && !s.contains("GroupMember.Read.All")));
        assert!(!scopes.iter().any(|s| s.contains("Sites.ReadWrite.All")));
        assert!(!scopes.iter().any(|s| s.contains("Files.ReadWrite.All")));
        assert!(!scopes.iter().any(|s| s.contains("/me/drive")));
    }

    #[test]
    fn team_flow_provider_is_distinct_from_personal_flows() {
        assert_eq!(microsoft_team_flow_provider(), "microsoft_team");
        assert_ne!(microsoft_team_flow_provider(), "microsoft");
        assert_ne!(microsoft_team_flow_provider(), "microsoft_onedrive");
    }
}
