mod commands;
mod messages;
mod runner;
mod settings;
mod telegram;

pub use commands::{
    get_birthday_telegram_settings_cmd, list_birthdays_today_cmd, run_birthday_telegram_if_due_cmd,
    save_birthday_telegram_settings_cmd, send_birthday_telegram_reminders_now_cmd,
    test_birthday_telegram_cmd,
};
pub use runner::run_if_due_on_db_state;

use crate::commands::DbState;
use tauri::{AppHandle, Manager};

pub fn spawn_run_if_due(app: &AppHandle) {
    let app = app.clone();
    if std::thread::Builder::new()
        .name("birthday-notify".into())
        .spawn(move || {
            let db_state = app.state::<DbState>();
            if let Err(e) = run_if_due_on_db_state(&app, &db_state) {
                eprintln!("⚠️ Anniversaires Telegram : {e}");
            }
        })
        .is_err()
    {
        eprintln!("⚠️ Anniversaires Telegram : thread indisponible");
    }
}
