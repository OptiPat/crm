use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalPrivacyConfig {
    /// Raison sociale ou nom du cabinet (responsable de traitement).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub controller: Option<String>,
    /// Mentions légales du cabinet : adresse, SIREN, ORIAS, association.
    /// Texte libre, une information par ligne.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub controller_details: Option<String>,
    /// Contact dédié exercice des droits RGPD.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_email: Option<String>,
    /// Libellé affiché (« août 2026 », « 10 août 2026 », …).
    pub updated_label: String,
}

impl PortalPrivacyConfig {
    pub fn from_env() -> Self {
        Self {
            controller: read_env("ESPACE_PRIVACY_CONTROLLER"),
            controller_details: read_env("ESPACE_PRIVACY_CONTROLLER_DETAILS")
                .map(|v| decode_line_breaks(&v)),
            contact_email: read_env("ESPACE_PRIVACY_CONTACT_EMAIL"),
            updated_label: std::env::var("ESPACE_PRIVACY_UPDATED")
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| "août 2026".into()),
        }
    }
}

/// `EnvironmentFile=` de systemd livre les valeurs telles quelles : un `\n`
/// saisi dans le `.env` arrive sous forme de deux caractères. On le convertit
/// ici pour que la mise en page soit identique en local et en production.
fn decode_line_breaks(value: &str) -> String {
    value.replace("\\n", "\n")
}

fn read_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_when_env_absent() {
        let cfg = PortalPrivacyConfig {
            controller: None,
            controller_details: None,
            contact_email: None,
            updated_label: "août 2026".into(),
        };
        assert!(cfg.controller.is_none());
        assert!(cfg.controller_details.is_none());
        assert_eq!(cfg.updated_label, "août 2026");
    }

    #[test]
    fn details_accept_escaped_line_breaks_from_systemd() {
        let raw = "12 rue des Acacias, 69000 Lyon\\nSIREN 000000000\\nORIAS 00000000";
        let decoded = decode_line_breaks(raw);
        assert_eq!(decoded.lines().count(), 3);
        assert_eq!(decoded.lines().last(), Some("ORIAS 00000000"));
    }

    #[test]
    fn details_keep_real_line_breaks_untouched() {
        let raw = "12 rue des Acacias\nSIREN 000000000";
        assert_eq!(decode_line_breaks(raw), raw);
    }
}
