use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceMode {
    #[default]
    Local,
    TeamSharepoint,
}

impl WorkspaceMode {
    pub fn is_team(self) -> bool {
        matches!(self, Self::TeamSharepoint)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_workspace_mode_is_local() {
        assert_eq!(WorkspaceMode::default(), WorkspaceMode::Local);
        assert!(!WorkspaceMode::Local.is_team());
        assert!(WorkspaceMode::TeamSharepoint.is_team());
    }
}
