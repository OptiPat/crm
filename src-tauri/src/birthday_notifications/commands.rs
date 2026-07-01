use super::runner::{
    run_if_due_on_db_state, run_now_on_db_state, send_test_message_on_db_state, BirthdayRunResult,
};
use super::settings::{
    get_birthday_telegram_settings, save_birthday_telegram_settings, BirthdayTelegramSettingsPayload,
};
use crate::commands::DbState;
use crate::database::birthdays::{list_birthdays_today_from_connection, BirthdayContactToday};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_birthdays_today_cmd(db: State<'_, DbState>) -> Result<Vec<BirthdayContactToday>, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    list_birthdays_today_from_connection(database.connection()).map_err(|e| e.to_string())
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
