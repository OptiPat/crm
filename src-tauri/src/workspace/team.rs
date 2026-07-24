use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamRole {
    Advisor,
    Secretary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamCapabilities {
    pub can_export: bool,
    pub can_manage_members: bool,
    pub can_use_personal_mailbox: bool,
}

pub fn capabilities_for_role(role: TeamRole) -> TeamCapabilities {
    match role {
        TeamRole::Advisor => TeamCapabilities {
            can_export: true,
            can_manage_members: true,
            can_use_personal_mailbox: true,
        },
        TeamRole::Secretary => TeamCapabilities {
            can_export: false,
            can_manage_members: false,
            can_use_personal_mailbox: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advisor_has_full_capabilities() {
        let caps = capabilities_for_role(TeamRole::Advisor);
        assert!(caps.can_export);
        assert!(caps.can_manage_members);
        assert!(caps.can_use_personal_mailbox);
    }

    #[test]
    fn secretary_cannot_export_manage_members_or_use_personal_mailbox() {
        let caps = capabilities_for_role(TeamRole::Secretary);
        assert!(!caps.can_export);
        assert!(!caps.can_manage_members);
        assert!(!caps.can_use_personal_mailbox);
    }
}
