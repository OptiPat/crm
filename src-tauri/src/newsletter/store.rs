use super::db::NewsletterAudienceFilters;
use crate::email::oauth_secrets::{
    decrypt_secret, encrypt_secret, is_legacy_secret, load_storage_key,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
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
pub const DEFAULT_LLM_PROVIDER: &str = "mistral";
static NEWSLETTER_STORE_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterSettingsPublic {
    pub api_key_configured: bool,
    /// Clé Mistral dédiée aux bulletins SCPI (OCR + résumés), indépendante du fournisseur newsletter.
    pub mistral_api_key_configured: bool,
    /// Fournisseurs IA dont une clé est enregistrée (déchiffrée ou chiffrée sur disque).
    pub configured_llm_providers: Vec<String>,
    pub llm_provider: String,
    pub style_prompt: String,
    pub model: String,
    pub etiquette_nom: String,
    pub send_delay_ms: u64,
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub secondary_color: Option<String>,
    #[serde(default)]
    pub header_color: Option<String>,
    #[serde(default)]
    pub header_text_color: Option<String>,
    #[serde(default)]
    pub title_color: Option<String>,
    #[serde(default)]
    pub separator_color: Option<String>,
    #[serde(default)]
    pub text_color: Option<String>,
    #[serde(default)]
    pub button_color: Option<String>,
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
    pub brevo_api_key_configured: bool,
    pub brevo_sender_name: Option<String>,
    pub brevo_sender_email: Option<String>,
    pub default_brevo_template_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterSettingsInput {
    #[serde(default)]
    pub api_key: Option<String>,
    /// Clé Mistral pour bulletins SCPI (quand le fournisseur newsletter n'est pas Mistral).
    #[serde(default)]
    pub mistral_api_key: Option<String>,
    pub llm_provider: Option<String>,
    pub style_prompt: Option<String>,
    pub model: Option<String>,
    pub etiquette_nom: Option<String>,
    pub send_delay_ms: Option<u64>,
    pub accent_color: Option<String>,
    pub secondary_color: Option<String>,
    pub header_color: Option<String>,
    pub header_text_color: Option<String>,
    pub title_color: Option<String>,
    pub separator_color: Option<String>,
    pub text_color: Option<String>,
    pub button_color: Option<String>,
    pub default_layout: Option<String>,
    pub body_font: Option<String>,
    pub title_font: Option<String>,
    pub body_font_size: Option<String>,
    pub line_height: Option<String>,
    pub section_spacing: Option<String>,
    pub default_audience_filters: Option<NewsletterAudienceFilters>,
    pub agenda_link_id: Option<String>,
    #[serde(default)]
    pub brevo_api_key: Option<String>,
    pub brevo_sender_name: Option<String>,
    pub brevo_sender_email: Option<String>,
    pub default_brevo_template_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedNewsletterStore {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    api_key_enc: Option<String>,
    #[serde(default)]
    provider_api_keys_enc: HashMap<String, String>,
    #[serde(default)]
    llm_provider: Option<String>,
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
    header_color: Option<String>,
    #[serde(default)]
    header_text_color: Option<String>,
    #[serde(default)]
    title_color: Option<String>,
    #[serde(default)]
    separator_color: Option<String>,
    #[serde(default)]
    text_color: Option<String>,
    #[serde(default)]
    button_color: Option<String>,
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
    #[serde(default)]
    brevo_api_key_enc: Option<String>,
    #[serde(default)]
    brevo_sender_name: Option<String>,
    #[serde(default)]
    brevo_sender_email: Option<String>,
    #[serde(default)]
    default_brevo_template_id: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct NewsletterStore {
    provider_api_keys: HashMap<String, String>,
    /// Fournisseurs dont une clé chiffrée est sur disque (même si déchiffrement indisponible).
    encrypted_provider_api_keys_present: HashSet<String>,
    pub brevo_api_key: Option<String>,
    pub encrypted_brevo_api_key_present: bool,
    pub llm_provider: String,
    pub style_prompt: String,
    pub model: String,
    pub etiquette_nom: String,
    pub send_delay_ms: u64,
    pub accent_color: Option<String>,
    pub secondary_color: Option<String>,
    pub header_color: Option<String>,
    pub header_text_color: Option<String>,
    pub title_color: Option<String>,
    pub separator_color: Option<String>,
    pub text_color: Option<String>,
    pub button_color: Option<String>,
    pub default_layout: Option<String>,
    pub body_font: Option<String>,
    pub title_font: Option<String>,
    pub body_font_size: Option<String>,
    pub line_height: Option<String>,
    pub section_spacing: Option<String>,
    pub agenda_link_id: Option<String>,
    pub default_audience_filters: NewsletterAudienceFilters,
    pub brevo_sender_name: Option<String>,
    pub brevo_sender_email: Option<String>,
    pub default_brevo_template_id: Option<i64>,
}

impl NewsletterStore {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let _guard = NEWSLETTER_STORE_IO_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "Verrou du stockage newsletter indisponible.".to_string())?;
        Self::load_locked(app)
    }

    fn load_locked(app: &AppHandle) -> Result<Self, String> {
        let path = Self::path(app)?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let storage_key = load_storage_key(app)?;
        let persisted: PersistedNewsletterStore =
            serde_json::from_str(&raw).map_err(|e| format!("Parse newsletter config: {}", e))?;
        let needs_migration = persisted.version < 3
            || persisted
                .api_key_enc
                .as_deref()
                .is_some_and(is_legacy_secret);
        let store = Self::from_persisted(persisted, storage_key.as_ref())?;
        if needs_migration {
            store.save_locked(app)?;
        }
        Ok(store)
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
        let _guard = NEWSLETTER_STORE_IO_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "Verrou du stockage newsletter indisponible.".to_string())?;
        self.save_locked(app)
    }

    fn save_locked(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let storage_key = load_storage_key(app)?;
        let existing = Self::read_persisted(app)?;
        let mut existing_provider_keys_enc = existing
            .as_ref()
            .map(|p| p.provider_api_keys_enc.clone())
            .unwrap_or_default();
        if existing_provider_keys_enc.is_empty() {
            if let Some(legacy_enc) = existing
                .as_ref()
                .and_then(|p| p.api_key_enc.clone())
                .filter(|s| !s.trim().is_empty())
            {
                let provider = existing
                    .as_ref()
                    .and_then(|p| p.llm_provider.clone())
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| DEFAULT_LLM_PROVIDER.to_string());
                existing_provider_keys_enc.insert(provider, legacy_enc);
            }
        }
        let existing_brevo_enc = existing.as_ref().and_then(|p| p.brevo_api_key_enc.clone());
        let persisted = self.to_persisted(
            storage_key.as_ref(),
            existing_provider_keys_enc,
            existing_brevo_enc,
        )?;
        let json = serde_json::to_string_pretty(&persisted).map_err(|e| e.to_string())?;
        crate::atomic_file::write(&path, json).map_err(|e| e.to_string())
    }

    pub fn to_public(&self) -> NewsletterSettingsPublic {
        let mut configured_llm_providers: Vec<String> = self
            .encrypted_provider_api_keys_present
            .iter()
            .cloned()
            .collect();
        for provider in self.provider_api_keys.keys() {
            if !configured_llm_providers.contains(provider) {
                configured_llm_providers.push(provider.clone());
            }
        }
        configured_llm_providers.sort();

        NewsletterSettingsPublic {
            api_key_configured: self.is_provider_api_key_configured(&self.llm_provider),
            mistral_api_key_configured: self.is_provider_api_key_configured("mistral"),
            configured_llm_providers,
            llm_provider: self.llm_provider.clone(),
            style_prompt: self.style_prompt.clone(),
            model: self.model.clone(),
            etiquette_nom: self.etiquette_nom.clone(),
            send_delay_ms: self.send_delay_ms,
            accent_color: self.accent_color.clone(),
            secondary_color: self.secondary_color.clone(),
            header_color: self.header_color.clone(),
            header_text_color: self.header_text_color.clone(),
            title_color: self.title_color.clone(),
            separator_color: self.separator_color.clone(),
            text_color: self.text_color.clone(),
            button_color: self.button_color.clone(),
            default_layout: self.default_layout.clone(),
            body_font: self.body_font.clone(),
            title_font: self.title_font.clone(),
            body_font_size: self.body_font_size.clone(),
            line_height: self.line_height.clone(),
            section_spacing: self.section_spacing.clone(),
            agenda_link_id: self.agenda_link_id.clone(),
            default_audience_filters: self.default_audience_filters.clone(),
            brevo_api_key_configured: self.encrypted_brevo_api_key_present
                || self
                    .brevo_api_key
                    .as_ref()
                    .map(|k| !k.trim().is_empty())
                    .unwrap_or(false),
            brevo_sender_name: self.brevo_sender_name.clone(),
            brevo_sender_email: self.brevo_sender_email.clone(),
            default_brevo_template_id: self.default_brevo_template_id,
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
        let mut provider_api_keys = HashMap::new();
        let mut encrypted_provider_api_keys_present = HashSet::new();

        for (provider, enc) in &persisted.provider_api_keys_enc {
            if enc.trim().is_empty() {
                continue;
            }
            encrypted_provider_api_keys_present.insert(provider.clone());
            if let Some(key) = storage_key {
                if let Ok(decrypted) = decrypt_secret(enc, key) {
                    if !decrypted.trim().is_empty() {
                        provider_api_keys.insert(provider.clone(), decrypted);
                    }
                }
            }
        }

        if persisted.provider_api_keys_enc.is_empty() {
            if let Some(enc) = persisted.api_key_enc.as_ref().filter(|s| !s.trim().is_empty()) {
                let provider = persisted
                    .llm_provider
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or(DEFAULT_LLM_PROVIDER);
                encrypted_provider_api_keys_present.insert(provider.to_string());
                if let Some(key) = storage_key {
                    if let Ok(decrypted) = decrypt_secret(enc, key) {
                        if !decrypted.trim().is_empty() {
                            provider_api_keys.insert(provider.to_string(), decrypted);
                        }
                    }
                }
            }
        }

        let encrypted_brevo_api_key_present = persisted
            .brevo_api_key_enc
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let brevo_api_key = match (&persisted.brevo_api_key_enc, storage_key) {
            (Some(enc), Some(key)) => Some(decrypt_secret(enc, key)?),
            (Some(_), None) => None,
            (None, _) => None,
        };
        Ok(Self {
            provider_api_keys,
            encrypted_provider_api_keys_present,
            brevo_api_key,
            encrypted_brevo_api_key_present,
            llm_provider: persisted
                .llm_provider
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_LLM_PROVIDER.to_string()),
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
            header_color: persisted
                .header_color
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            header_text_color: persisted
                .header_text_color
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            title_color: persisted
                .title_color
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            separator_color: persisted
                .separator_color
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            text_color: persisted
                .text_color
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            button_color: persisted
                .button_color
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
            brevo_sender_name: persisted
                .brevo_sender_name
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            brevo_sender_email: persisted
                .brevo_sender_email
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string()),
            default_brevo_template_id: persisted.default_brevo_template_id,
        })
    }

    fn to_persisted(
        &self,
        storage_key: Option<&[u8; 32]>,
        existing_provider_keys_enc: HashMap<String, String>,
        existing_brevo_enc: Option<String>,
    ) -> Result<PersistedNewsletterStore, String> {
        let mut provider_api_keys_enc = existing_provider_keys_enc;
        if storage_key.is_some() {
            provider_api_keys_enc.retain(|provider, _| {
                self.encrypted_provider_api_keys_present.contains(provider)
            });
        }
        if let Some(storage) = storage_key {
            for (provider, key) in &self.provider_api_keys {
                if key.trim().is_empty() {
                    provider_api_keys_enc.remove(provider);
                } else {
                    provider_api_keys_enc.insert(
                        provider.clone(),
                        encrypt_secret(key.trim(), storage)?,
                    );
                }
            }
        }
        let brevo_api_key_enc = match (&self.brevo_api_key, storage_key) {
            (Some(key), Some(storage)) if !key.trim().is_empty() => {
                Some(encrypt_secret(key.trim(), storage)?)
            }
            (Some(_), None) => {
                return Err("Clé API Brevo : clé de stockage indisponible.".into());
            }
            (Some(_), Some(_)) | (None, _) => {
                existing_brevo_enc.filter(|s| !s.trim().is_empty())
            }
        };
        Ok(PersistedNewsletterStore {
            version: 3,
            api_key_enc: None,
            provider_api_keys_enc,
            llm_provider: Some(self.llm_provider.clone()),
            brevo_api_key_enc,
            style_prompt: Some(self.style_prompt.clone()),
            model: Some(self.model.clone()),
            etiquette_nom: Some(self.etiquette_nom.clone()),
            send_delay_ms: Some(self.send_delay_ms),
            accent_color: self.accent_color.clone(),
            secondary_color: self.secondary_color.clone(),
            header_color: self.header_color.clone(),
            header_text_color: self.header_text_color.clone(),
            title_color: self.title_color.clone(),
            separator_color: self.separator_color.clone(),
            text_color: self.text_color.clone(),
            button_color: self.button_color.clone(),
            default_layout: self.default_layout.clone(),
            body_font: self.body_font.clone(),
            title_font: self.title_font.clone(),
            body_font_size: self.body_font_size.clone(),
            line_height: self.line_height.clone(),
            section_spacing: self.section_spacing.clone(),
            agenda_link_id: self.agenda_link_id.clone(),
            default_audience_filters: Some(self.default_audience_filters.clone()),
            brevo_sender_name: self.brevo_sender_name.clone(),
            brevo_sender_email: self.brevo_sender_email.clone(),
            default_brevo_template_id: self.default_brevo_template_id,
        })
    }

    pub fn provider_api_key(&self, provider: &str) -> Option<&str> {
        self.provider_api_keys
            .get(provider)
            .map(|s| s.as_str())
            .filter(|s| !s.trim().is_empty())
    }

    pub fn is_provider_api_key_configured(&self, provider: &str) -> bool {
        self.provider_api_key(provider).is_some()
            || self
                .encrypted_provider_api_keys_present
                .contains(provider)
    }

    pub fn set_provider_api_key(&mut self, provider: &str, key: Option<String>) {
        let provider = provider.trim();
        if provider.is_empty() {
            return;
        }
        match key.filter(|k| !k.trim().is_empty()) {
            Some(value) => {
                self.provider_api_keys
                    .insert(provider.to_string(), value.trim().to_string());
                self.encrypted_provider_api_keys_present
                    .insert(provider.to_string());
            }
            None => {
                self.provider_api_keys.remove(provider);
                self.encrypted_provider_api_keys_present.remove(provider);
            }
        }
    }

    pub fn resolved_provider_api_key(&self, provider_id: &str) -> Result<String, String> {
        self.provider_api_key(provider_id)
            .map(|s| s.to_string())
            .ok_or_else(|| {
                if self
                    .encrypted_provider_api_keys_present
                    .contains(provider_id)
                {
                    "Clé API illisible — fermez et rouvrez le CRM avec votre mot de passe maître."
                        .to_string()
                } else {
                    format!(
                        "Configurez votre clé API {} dans Newsletter → Paramètres.",
                        super::llm::LlmProvider::parse(provider_id).label()
                    )
                }
            })
    }

    pub fn resolved_newsletter_api_key(&self) -> Result<String, String> {
        let provider = super::llm::LlmProvider::parse(&self.llm_provider);
        self.resolved_provider_api_key(provider.as_id())
    }

    pub fn resolved_mistral_api_key(&self) -> Result<String, String> {
        self.resolved_provider_api_key("mistral").or_else(|error| {
            if error.contains("illisible") {
                Err(error)
            } else {
                Err(
                    "Clé API Mistral absente — Newsletter → Paramètres → clé Mistral (OCR + résumés SCPI)."
                        .to_string(),
                )
            }
        })
    }
}

impl Default for NewsletterStore {
    fn default() -> Self {
        Self {
            provider_api_keys: HashMap::new(),
            encrypted_provider_api_keys_present: HashSet::new(),
            brevo_api_key: None,
            encrypted_brevo_api_key_present: false,
            llm_provider: DEFAULT_LLM_PROVIDER.to_string(),
            style_prompt: DEFAULT_NEWSLETTER_STYLE_PROMPT.to_string(),
            model: DEFAULT_MISTRAL_MODEL.to_string(),
            etiquette_nom: "Newsletter".to_string(),
            send_delay_ms: 3000,
            accent_color: None,
            secondary_color: None,
            header_color: None,
            header_text_color: None,
            title_color: None,
            separator_color: None,
            text_color: None,
            button_color: None,
            default_layout: None,
            body_font: None,
            title_font: None,
            body_font_size: None,
            line_height: None,
            section_spacing: None,
            agenda_link_id: None,
            default_audience_filters: NewsletterAudienceFilters::default(),
            brevo_sender_name: None,
            brevo_sender_email: None,
            default_brevo_template_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

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

    #[test]
    fn legacy_xor_api_key_is_rewritten_as_authenticated_v2() {
        let key = [0x11; 32];
        let mut cipher: Vec<u8> = (0u8..16).collect();
        cipher.extend_from_slice(&[
            0x62, 0x75, 0x70, 0x60, 0x70, 0x60, 0x3a, 0x62, 0x7c, 0x6b, 0x6f,
        ]);
        let persisted = PersistedNewsletterStore {
            version: 1,
            api_key_enc: Some(base64::engine::general_purpose::STANDARD.encode(cipher)),
            ..Default::default()
        };

        let runtime = NewsletterStore::from_persisted(persisted, Some(&key)).unwrap();
        assert_eq!(runtime.provider_api_key("mistral"), Some("secret-test"));

        let migrated = runtime
            .to_persisted(Some(&key), HashMap::new(), None)
            .unwrap();
        assert_eq!(migrated.version, 3);
        assert!(migrated
            .provider_api_keys_enc
            .get("mistral")
            .unwrap()
            .starts_with("v2:"));
    }

    #[test]
    fn provider_api_keys_are_independent_per_provider() {
        let key = [0x22; 32];
        let mut store = NewsletterStore::default();
        store.llm_provider = "google".to_string();
        store.set_provider_api_key("google", Some("gemini-key".into()));
        store.set_provider_api_key("mistral", Some("mistral-key".into()));

        let persisted = store
            .to_persisted(Some(&key), HashMap::new(), None)
            .unwrap();
        assert_eq!(persisted.provider_api_keys_enc.len(), 2);

        let reloaded = NewsletterStore::from_persisted(persisted, Some(&key)).unwrap();
        assert_eq!(reloaded.provider_api_key("google"), Some("gemini-key"));
        assert_eq!(reloaded.provider_api_key("mistral"), Some("mistral-key"));
        assert_eq!(reloaded.resolved_mistral_api_key().unwrap(), "mistral-key");
    }

    #[test]
    fn clearing_provider_api_key_removes_encrypted_entry_on_save() {
        let key = [0x33; 32];
        let mut store = NewsletterStore::default();
        store.set_provider_api_key("mistral", Some("mistral-key".into()));
        let persisted = store
            .to_persisted(Some(&key), HashMap::new(), None)
            .unwrap();
        assert!(persisted.provider_api_keys_enc.contains_key("mistral"));

        store.set_provider_api_key("mistral", None);
        let cleared = store
            .to_persisted(Some(&key), persisted.provider_api_keys_enc, None)
            .unwrap();
        assert!(!cleared.provider_api_keys_enc.contains_key("mistral"));

        let reloaded = NewsletterStore::from_persisted(cleared, Some(&key)).unwrap();
        assert!(!reloaded.is_provider_api_key_configured("mistral"));
    }
}
