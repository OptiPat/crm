//! Réglages clé/valeur et configuration du cabinet (CGP) + wizard.
//! Extrait de `operations.rs`.

use rusqlite::{params, Result};

impl super::Database {
    /// Récupérer une valeur de configuration
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?1")?;

        let result = stmt.query_row(params![key], |row| row.get::<_, String>(0));

        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Définir une valeur de configuration
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.conn.execute(
            "INSERT INTO settings (key, value, updated_at) 
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![key, value, now],
        )?;
        Ok(())
    }

    /// Supprimer une valeur de configuration
    pub fn delete_setting(&self, key: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM settings WHERE key = ?1", params![key])?;
        Ok(())
    }

    /// Récupérer toutes les configurations
    pub fn get_all_settings(&self) -> Result<Vec<super::models::Setting>> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, value, updated_at FROM settings ORDER BY key")?;

        let settings = stmt.query_map([], |row| {
            Ok(super::models::Setting {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?;

        settings.collect()
    }

    fn normalize_cgp_config(mut config: super::models::CgpConfig) -> super::models::CgpConfig {
        use crate::email::signature_html::{decode_html_entities, normalize_signature_html};
        if config.email_suivi_delai_jours.unwrap_or(0) <= 0 {
            config.email_suivi_delai_jours = Some(5);
        }
        if let Some(ref sig) = config.email_signature {
            config.email_signature = Some(decode_html_entities(sig));
        }
        if let Some(ref html) = config.email_signature_html {
            config.email_signature_html = Some(normalize_signature_html(html));
        }
        if config.agenda_links.is_empty() {
            if let Some(url) = config
                .lien_agenda
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                config.agenda_links.push(super::models::AgendaLink {
                    id: "principal".into(),
                    label: "Principal".into(),
                    url: url.to_string(),
                });
            }
        }
        config
    }

    /// Récupérer la configuration CGP (JSON sérialisé)
    pub fn get_cgp_config(&self) -> Result<super::models::CgpConfig> {
        let config = match self.get_setting("cgp_config")? {
            Some(json_str) => serde_json::from_str(&json_str).map_err(|e| {
                rusqlite::Error::InvalidParameterName(format!("JSON parse error: {}", e))
            })?,
            None => super::models::CgpConfig::default(),
        };
        Ok(Self::normalize_cgp_config(config))
    }

    /// Sauvegarder la configuration CGP
    pub fn save_cgp_config(&self, config: &super::models::CgpConfig) -> Result<()> {
        let json_str = serde_json::to_string(config).map_err(|e| {
            rusqlite::Error::InvalidParameterName(format!("JSON serialize error: {}", e))
        })?;
        self.set_setting("cgp_config", &json_str)
    }

    /// Vérifier si le wizard est complété
    pub fn is_wizard_completed(&self) -> Result<bool> {
        match self.get_cgp_config() {
            Ok(config) => Ok(config.wizard_completed),
            Err(_) => Ok(false),
        }
    }

    /// Marquer le wizard comme complété
    pub fn complete_wizard(&self) -> Result<()> {
        let mut config = self.get_cgp_config()?;
        config.wizard_completed = true;
        config.wizard_step = 4;
        self.save_cgp_config(&config)
    }

    /// Mettre à jour l'étape courante du wizard
    pub fn update_wizard_step(&self, step: i64) -> Result<()> {
        let mut config = self.get_cgp_config()?;
        config.wizard_step = step;
        self.save_cgp_config(&config)
    }
}
