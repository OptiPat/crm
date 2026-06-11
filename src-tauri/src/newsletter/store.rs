use crate::email::oauth_secrets::{decrypt_secret, encrypt_secret, load_storage_key};
use super::db::NewsletterAudienceFilters;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const DEFAULT_NEWSLETTER_STYLE_PROMPT: &str = r#"Tu es "Patrimoine Sarcasme", expert en communication financière et Conseiller en Gestion de Patrimoine (CGP).

TON OBJECTIF : transformer l'actualité financière en newsletter mensuelle engageante pour des clients particuliers.

TA MISSION :
1. Synthétiser l'information ayant un IMPACT CONCRET pour un épargnant particulier
2. Expliquer avec clarté (métaphores simples)
3. Rédiger avec un style professionnel, bienveillant, avec une légère ironie fine

FORMAT DE RÉPONSE (JSON strict, sans markdown autour) :
{
  "subject": "Objet email accrocheur (inbox)",
  "preheader": "1 phrase complémentaire à l'objet, visible sous l'objet dans la boîte mail (max 120 car.)",
  "editionTitle": "Titre éditorial du numéro (affiché dans l'en-tête, peut être plus descriptif que l'objet)",
  "intro": "Introduction relatable (2-3 phrases)",
  "sections": [
    { "title": "Titre section 1", "body": "Contenu...", "highlight": false },
    { "title": "Titre section 2", "body": "Contenu...", "highlight": true }
  ],
  "cta": "Appel à l'action + invitation (1-2 phrases)"
}

CONTRAINTES :
- TON : Professionnel, informel, bienveillant, légèrement ironique
- 2 ou 3 sections maximum dans "sections"
- LONGUEUR totale : 300-500 mots (intro + sections + cta)
- JARGON : traduire en métaphores accessibles
- Utilise {{prenom}} uniquement dans l'intro si tu salues le lecteur (ex. "Bonjour {{prenom}},")
- "highlight": true sur UNE section au plus (échéance, alerte, point urgent)

INTERDITS :
- Jargon non expliqué
- Promesses de rendement
- Ton ennuyeux ou trop corporate
- Texte hors JSON
- Signature (ajoutée automatiquement)"#;

pub const DEFAULT_MISTRAL_MODEL: &str = "mistral-small-latest";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterSettingsPublic {
    pub api_key_configured: bool,
    pub style_prompt: String,
    pub model: String,
    pub etiquette_nom: String,
    pub send_delay_ms: u64,
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub secondary_color: Option<String>,
    #[serde(default)]
    pub default_layout: Option<String>,
    #[serde(default)]
    pub body_font: Option<String>,
    #[serde(default)]
    pub title_font: Option<String>,
    #[serde(default)]
    pub body_font_size: Option<String>,
    #[serde(default)]
    pub line_height: Option<String>,
    #[serde(default)]
    pub section_spacing: Option<String>,
    #[serde(default)]
    pub agenda_link_id: Option<String>,
    pub default_audience_filters: NewsletterAudienceFilters,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterSettingsInput {
    #[serde(default)]
    pub api_key: Option<String>,
    pub style_prompt: Option<String>,
    pub model: Option<String>,
    pub etiquette_nom: Option<String>,
    pub send_delay_ms: Option<u64>,
    pub accent_color: Option<String>,
    pub secondary_color: Option<String>,
    pub default_layout: Option<String>,
    pub body_font: Option<String>,
    pub title_font: Option<String>,
    pub body_font_size: Option<String>,
    pub line_height: Option<String>,
    pub section_spacing: Option<String>,
    pub default_audience_filters: Option<NewsletterAudienceFilters>,
    pub agenda_link_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedNewsletterStore {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    api_key_enc: Option<String>,
    #[serde(default)]
    style_prompt: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    etiquette_nom: Option<String>,
    #[serde(default)]
    send_delay_ms: Option<u64>,
    #[serde(default)]
    accent_color: Option<String>,
    #[serde(default)]
    secondary_color: Option<String>,
    #[serde(default)]
    default_layout: Option<String>,
    #[serde(default)]
    body_font: Option<String>,
    #[serde(default)]
    title_font: Option<String>,
    #[serde(default)]
    body_font_size: Option<String>,
    #[serde(default)]
    line_height: Option<String>,
    #[serde(default)]
    section_spacing: Option<String>,
    #[serde(default)]
    agenda_link_id: Option<String>,
    #[serde(default)]
    default_audience_filters: Option<NewsletterAudienceFilters>,
}

#[derive(Debug, Clone)]
pub struct NewsletterStore {
    pub api_key: Option<String>,
    /// Clé chiffrée présente sur disque (même si déchiffrement indisponible).
    pub encrypted_api_key_present: bool,
    pub style_prompt: String,
    pub model: String,
    pub etiquette_nom: String,
    pub send_delay_ms: u64,
    pub accent_color: Option<String>,
    pub secondary_color: Option<String>,
    pub default_layout: Option<String>,
    pub body_font: Option<String>,
    pub title_font: Option<String>,
    pub body_font_size: Option<String>,
    pub line_height: Option<String>,
    pub section_spacing: Option<String>,
    pub agenda_link_id: Option<String>,
    pub default_audience_filters: NewsletterAudienceFilters,
}

impl NewsletterStore {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let path = Self::path(app)?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let storage_key = load_storage_key(app)?;
        let persisted: PersistedNewsletterStore =
            serde_json::from_str(&raw).map_err(|e| format!("Parse newsletter config: {}", e))?;
        Self::from_persisted(persisted, storage_key.as_ref())
    }

    fn read_persisted(app: &AppHandle) -> Result<Option<PersistedNewsletterStore>, String> {
        let path = Self::path(app)?;
        if !path.exists() {
            return Ok(None);
        }
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("Parse newsletter config: {}", e))
            .map(Some)
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let storage_key = load_storage_key(app)?;
        let existing_enc = Self::read_persisted(app)?
            .and_then(|p| p.api_key_enc);
        let persisted = self.to_persisted(storage_key.as_ref(), existing_enc)?;
        let json = serde_json::to_string_pretty(&persisted).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    pub fn to_public(&self) -> NewsletterSettingsPublic {
        NewsletterSettingsPublic {
            api_key_configured: self.encrypted_api_key_present
                || self
                    .api_key
                    .as_ref()
                    .map(|k| !k.trim().is_empty())
                    .unwrap_or(false),
            style_prompt: self.style_prompt.clone(),
            model: self.model.clone(),
            etiquette_nom: self.etiquette_nom.clone(),
            send_delay_ms: self.send_delay_ms,
            accent_color: self.accent_color.clone(),
            secondary_color: self.secondary_color.clone(),
            default_layout: self.default_layout.clone(),
            body_font: self.body_font.clone(),
            title_font: self.title_font.clone(),
            body_font_size: self.body_font_size.clone(),
            line_height: self.line_height.clone(),
            section_spacing: self.section_spacing.clone(),
            agenda_link_id: self.agenda_link_id.clone(),
            default_audience_filters: self.default_audience_filters.clone(),
        }
    }

    fn path(app: &AppHandle) -> Result<PathBuf, String> {
        Ok(app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("newsletter_config.json"))
    }

    fn from_persisted(
        persisted: PersistedNewsletterStore,
        storage_key: Option<&[u8; 32]>,
    ) -> Result<Self, String> {
        let encrypted_api_key_present = persisted
            .api_key_enc
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let api_key = match (&persisted.api_key_enc, storage_key) {
            (Some(enc), Some(key)) => Some(decrypt_secret(enc, key)?),
            (Some(_), None) => None,
            (None, _) => None,
        };
        Ok(Self {
            api_key,
            encrypted_api_key_present,
            style_prompt: persisted
                .style_prompt
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_NEWSLETTER_STYLE_PROMPT.to_string()),
            model: persisted
                .model
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_MISTRAL_MODEL.to_string()),
            etiquette_nom: persisted
                .etiquette_nom
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| "Newsletter".to_string()),
            send_delay_ms: persisted.send_delay_ms.unwrap_or(3000).max(500),
            accent_color: persisted
                .accent_color
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            secondary_color: persisted
                .secondary_color
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            default_layout: persisted
                .default_layout
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            body_font: persisted
                .body_font
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            title_font: persisted
                .title_font
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            body_font_size: persisted
                .body_font_size
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            line_height: persisted
                .line_height
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            section_spacing: persisted
                .section_spacing
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            agenda_link_id: persisted
                .agenda_link_id
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            default_audience_filters: persisted
                .default_audience_filters
                .unwrap_or_default(),
        })
    }

    fn to_persisted(
        &self,
        storage_key: Option<&[u8; 32]>,
        existing_enc: Option<String>,
    ) -> Result<PersistedNewsletterStore, String> {
        let api_key_enc = match (&self.api_key, storage_key) {
            (Some(key), Some(storage)) if !key.trim().is_empty() => {
                Some(encrypt_secret(key.trim(), storage)?)
            }
            (Some(_), None) => {
                return Err("Clé API Mistral : clé de stockage indisponible.".into());
            }
            (Some(_), Some(_)) | (None, _) => {
                existing_enc.filter(|s| !s.trim().is_empty())
            }
        };
        Ok(PersistedNewsletterStore {
            version: 1,
            api_key_enc,
            style_prompt: Some(self.style_prompt.clone()),
            model: Some(self.model.clone()),
            etiquette_nom: Some(self.etiquette_nom.clone()),
            send_delay_ms: Some(self.send_delay_ms),
            accent_color: self.accent_color.clone(),
            secondary_color: self.secondary_color.clone(),
            default_layout: self.default_layout.clone(),
            body_font: self.body_font.clone(),
            title_font: self.title_font.clone(),
            body_font_size: self.body_font_size.clone(),
            line_height: self.line_height.clone(),
            section_spacing: self.section_spacing.clone(),
            agenda_link_id: self.agenda_link_id.clone(),
            default_audience_filters: Some(self.default_audience_filters.clone()),
        })
    }
}

impl Default for NewsletterStore {
    fn default() -> Self {
        Self {
            api_key: None,
            encrypted_api_key_present: false,
            style_prompt: DEFAULT_NEWSLETTER_STYLE_PROMPT.to_string(),
            model: DEFAULT_MISTRAL_MODEL.to_string(),
            etiquette_nom: "Newsletter".to_string(),
            send_delay_ms: 3000,
            accent_color: None,
            secondary_color: None,
            default_layout: None,
            body_font: None,
            title_font: None,
            body_font_size: None,
            line_height: None,
            section_spacing: None,
            agenda_link_id: None,
            default_audience_filters: NewsletterAudienceFilters::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::NewsletterSettingsInput;

    #[test]
    fn newsletter_settings_input_accepts_camel_case_from_frontend() {
        let raw = r#"{"apiKey":"sk-test","stylePrompt":"Ton","model":"mistral-small-latest","etiquetteNom":"Newsletter","sendDelayMs":3000}"#;
        let input: NewsletterSettingsInput = serde_json::from_str(raw).expect("parse");
        assert_eq!(input.api_key.as_deref(), Some("sk-test"));
        assert_eq!(input.style_prompt.as_deref(), Some("Ton"));
        assert_eq!(input.model.as_deref(), Some("mistral-small-latest"));
        assert_eq!(input.etiquette_nom.as_deref(), Some("Newsletter"));
        assert_eq!(input.send_delay_ms, Some(3000));
    }
}
