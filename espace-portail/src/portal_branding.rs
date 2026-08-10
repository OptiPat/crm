use serde::Serialize;

const DEFAULT_LOGIN_TAGLINE: &str =
    "Consultez votre patrimoine en toute confidentialité";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PortalColorScheme {
    System,
    Light,
    Dark,
}

impl PortalColorScheme {
    fn parse(raw: Option<&str>) -> Self {
        match raw.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
            Some("light") => Self::Light,
            Some("dark") => Self::Dark,
            _ => Self::System,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalBrandingConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_url: Option<String>,
    pub login_tagline: String,
    pub color_scheme: PortalColorScheme,
}

impl PortalBrandingConfig {
    pub fn from_env() -> Self {
        Self {
            brand_name: read_env("ESPACE_PORTAL_BRAND_NAME"),
            logo_url: read_env("ESPACE_PORTAL_LOGO_URL"),
            login_tagline: read_env("ESPACE_PORTAL_LOGIN_TAGLINE")
                .unwrap_or_else(|| DEFAULT_LOGIN_TAGLINE.into()),
            color_scheme: PortalColorScheme::parse(
                std::env::var("ESPACE_PORTAL_COLOR_SCHEME").ok().as_deref(),
            ),
        }
    }
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
    fn color_scheme_defaults_to_system() {
        assert_eq!(PortalColorScheme::parse(None), PortalColorScheme::System);
        assert_eq!(
            PortalColorScheme::parse(Some(" LIGHT ")),
            PortalColorScheme::Light
        );
        assert_eq!(
            PortalColorScheme::parse(Some("dark")),
            PortalColorScheme::Dark
        );
    }

    #[test]
    fn default_tagline_is_set() {
        let cfg = PortalBrandingConfig {
            brand_name: None,
            logo_url: None,
            login_tagline: DEFAULT_LOGIN_TAGLINE.into(),
            color_scheme: PortalColorScheme::System,
        };
        assert!(cfg.login_tagline.contains("confidentialité"));
    }
}
