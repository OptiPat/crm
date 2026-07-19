use crate::database::Database;
use crate::email::oauth_secrets::{
    decrypt_secret, encrypt_secret, is_legacy_secret, load_storage_key,
};
use chrono::Local;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use std::collections::HashSet;

pub const SETTING_ENABLED: &str = "birthday_telegram_enabled";
pub const SETTING_CHAT_ID: &str = "birthday_telegram_chat_id";
pub const SETTING_BOT_TOKEN_ENC: &str = "birthday_telegram_bot_token_enc";
pub const SETTING_LAST_RUN_DATE: &str = "birthday_telegram_last_notify_date";
pub const SETTING_NOTIFIED_IDS: &str = "birthday_telegram_notified_contact_ids";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayTelegramSettingsPayload {
    pub enabled: bool,
    pub chat_id: String,
    pub bot_token_configured: bool,
}

#[derive(Debug, Clone)]
pub struct BirthdayTelegramRuntime {
    pub bot_token: String,
    pub chat_id: String,
}

pub fn today_date_label() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

pub fn get_birthday_telegram_settings(
    _app: &AppHandle,
    db: &Database,
) -> Result<BirthdayTelegramSettingsPayload, String> {
    let enabled = db
        .get_setting(SETTING_ENABLED)
        .map_err(|e| e.to_string())?
        .map(|v| v == "true")
        .unwrap_or(false);

    let chat_id = db
        .get_setting(SETTING_CHAT_ID)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let bot_token_configured = db
        .get_setting(SETTING_BOT_TOKEN_ENC)
        .map_err(|e| e.to_string())?
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);

    Ok(BirthdayTelegramSettingsPayload {
        enabled,
        chat_id,
        bot_token_configured,
    })
}

pub fn validate_stored_bot_token_key(
    db: &Database,
    key: &[u8; 32],
) -> Result<(), String> {
    let Some(encrypted) = db
        .get_setting(SETTING_BOT_TOKEN_ENC)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.trim().is_empty())
    else {
        return Ok(());
    };
    decrypt_secret(&encrypted, key)
        .map(|_| ())
        .map_err(|_| "La clé protégée ne déchiffre pas le token Telegram.".to_string())
}

pub fn save_birthday_telegram_settings(
    app: &AppHandle,
    db: &Database,
    enabled: bool,
    chat_id: &str,
    bot_token: Option<&str>,
) -> Result<BirthdayTelegramSettingsPayload, String> {
    db.set_setting(
        SETTING_ENABLED,
        if enabled { "true" } else { "false" },
    )
    .map_err(|e| e.to_string())?;
    db.set_setting(SETTING_CHAT_ID, chat_id.trim())
        .map_err(|e| e.to_string())?;

    if let Some(token) = bot_token {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            db.set_setting(SETTING_BOT_TOKEN_ENC, "")
                .map_err(|e| e.to_string())?;
        } else {
            let key = load_storage_key(app)?;
            let key = key.ok_or("Clé de chiffrement locale indisponible.")?;
            let enc = encrypt_secret(trimmed, &key)?;
            db.set_setting(SETTING_BOT_TOKEN_ENC, &enc)
                .map_err(|e| e.to_string())?;
        }
    }

    get_birthday_telegram_settings(app, db)
}

pub fn load_runtime_config(
    app: &AppHandle,
    db: &Database,
) -> Result<Option<BirthdayTelegramRuntime>, String> {
    let enabled = db
        .get_setting(SETTING_ENABLED)
        .map_err(|e| e.to_string())?
        .map(|v| v == "true")
        .unwrap_or(false);
    if !enabled {
        return Ok(None);
    }

    let chat_id = db
        .get_setting(SETTING_CHAT_ID)
        .map_err(|e| e.to_string())?
        .unwrap_or_default()
        .trim()
        .to_string();
    if chat_id.is_empty() {
        return Ok(None);
    }

    let enc = match db
        .get_setting(SETTING_BOT_TOKEN_ENC)
        .map_err(|e| e.to_string())?
    {
        Some(v) if !v.trim().is_empty() => v,
        _ => return Ok(None),
    };

    let key = load_storage_key(app)?;
    let key = key.ok_or("Clé de chiffrement locale indisponible.")?;
    let bot_token = decrypt_secret(&enc, &key)?;
    if is_legacy_secret(&enc) {
        let migrated = encrypt_secret(&bot_token, &key)?;
        db.set_setting(SETTING_BOT_TOKEN_ENC, &migrated)
            .map_err(|e| e.to_string())?;
    }
    if bot_token.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(BirthdayTelegramRuntime {
        bot_token,
        chat_id,
    }))
}

pub fn load_notified_contact_ids(db: &Database) -> Result<HashSet<i64>, String> {
    let today = today_date_label();
    let stored_date = db
        .get_setting(SETTING_LAST_RUN_DATE)
        .map_err(|e| e.to_string())?;
    if stored_date.as_deref() != Some(today.as_str()) {
        return Ok(HashSet::new());
    }
    let raw = db
        .get_setting(SETTING_NOTIFIED_IDS)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    Ok(raw
        .split(',')
        .filter_map(|part| part.trim().parse::<i64>().ok())
        .collect())
}

pub fn save_notified_contact_ids(db: &Database, ids: &HashSet<i64>) -> Result<(), String> {
    let mut sorted: Vec<i64> = ids.iter().copied().collect();
    sorted.sort_unstable();
    let value = sorted
        .iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");
    db.set_setting(SETTING_NOTIFIED_IDS, &value)
        .map_err(|e| e.to_string())?;
    db.set_setting(SETTING_LAST_RUN_DATE, &today_date_label())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_telegram_token_before_legacy_key_cleanup() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let key = [0x21; 32];
        let encrypted = encrypt_secret("telegram-test-token", &key).unwrap();
        db.set_setting(SETTING_BOT_TOKEN_ENC, &encrypted).unwrap();

        assert!(validate_stored_bot_token_key(&db, &key).is_ok());
        assert!(validate_stored_bot_token_key(&db, &[0x42; 32]).is_err());
    }
}
