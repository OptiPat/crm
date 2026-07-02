use super::message_settings::{
    load_birthday_message_settings, save_birthday_message_settings, BirthdayMessageSettingsPayload,
};
use super::runner::{
    run_if_due_on_db_state, run_now_on_db_state, send_test_message_on_db_state, BirthdayRunResult,
};
use super::settings::{
    get_birthday_telegram_settings, save_birthday_telegram_settings, BirthdayTelegramSettingsPayload,
};
use super::messages::{generate_draft, list_builtin_bodies_full};
use super::message_settings::BirthdayMessageProfileBodies;
use crate::commands::DbState;
use crate::database::birthdays::{
    get_birthday_contact_today_by_id, list_birthdays_today_from_connection, BirthdayContactToday,
};
use rand::thread_rng;
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayMessageDraftPayload {
    pub contact_id: i64,
    pub message: String,
}

#[tauri::command]
pub fn list_birthdays_today_cmd(db: State<'_, DbState>) -> Result<Vec<BirthdayContactToday>, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    list_birthdays_today_from_connection(database.connection()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_birthday_message_draft_cmd(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<BirthdayMessageDraftPayload, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    let contact = get_birthday_contact_today_by_id(database.connection(), contact_id)
        .map_err(|e| e.to_string())?
        .ok_or("Contact introuvable ou pas anniversaire aujourd'hui.")?;
    let settings = load_birthday_message_settings(database)?;
    let draft = generate_draft(&contact, &mut thread_rng(), &settings);
    Ok(BirthdayMessageDraftPayload {
        contact_id,
        message: draft.message,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayBuiltinBodiesPayload {
    pub profile: BirthdayMessageProfileBodies,
}

#[tauri::command]
pub fn get_birthday_builtin_bodies_cmd() -> BirthdayBuiltinBodiesPayload {
    BirthdayBuiltinBodiesPayload {
        profile: list_builtin_bodies_full(),
    }
}

#[tauri::command]
pub fn get_birthday_message_settings_cmd(
    db: State<'_, DbState>,
) -> Result<BirthdayMessageSettingsPayload, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    load_birthday_message_settings(database)
}

#[tauri::command]
pub fn save_birthday_message_settings_cmd(
    db: State<'_, DbState>,
    settings: BirthdayMessageSettingsPayload,
) -> Result<BirthdayMessageSettingsPayload, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    save_birthday_message_settings(database, &settings)
}

#[tauri::command]
pub fn run_birthday_telegram_if_due_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<BirthdayRunResult, String> {
    run_if_due_on_db_state(&app, &db)
}

#[tauri::command]
pub fn get_birthday_telegram_settings_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<BirthdayTelegramSettingsPayload, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    get_birthday_telegram_settings(&app, database)
}

#[tauri::command]
pub fn save_birthday_telegram_settings_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
    enabled: bool,
    chat_id: String,
    bot_token: Option<String>,
) -> Result<BirthdayTelegramSettingsPayload, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    save_birthday_telegram_settings(
        &app,
        database,
        enabled,
        &chat_id,
        bot_token.as_deref(),
    )
}

#[tauri::command]
pub fn send_birthday_telegram_reminders_now_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<BirthdayRunResult, String> {
    run_now_on_db_state(&app, &db)
}

#[tauri::command]
pub fn test_birthday_telegram_cmd(app: AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    send_test_message_on_db_state(&app, &db)
}
