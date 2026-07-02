use super::messages::{format_telegram_notification, generate_draft};
use super::message_settings::load_birthday_message_settings;
use super::settings::{
    load_notified_contact_ids, load_runtime_config, save_notified_contact_ids,
    BirthdayTelegramRuntime,
};
use super::telegram::send_telegram_message;
use crate::commands::DbState;
use crate::database::birthdays::{list_birthdays_today_from_connection, BirthdayContactToday};
use rand::thread_rng;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayRunResult {
    pub contacts_count: u32,
    pub messages_sent: u32,
    pub skipped_already_ran: bool,
}

struct PreparedBirthdayRun {
    config: BirthdayTelegramRuntime,
    contacts_count: u32,
    pending: Vec<BirthdayContactToday>,
    notified: HashSet<i64>,
}

static RUN_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

struct RunInProgressGuard;

impl RunInProgressGuard {
    fn try_acquire() -> Result<Self, BirthdayRunResult> {
        if RUN_IN_PROGRESS.swap(true, Ordering::SeqCst) {
            return Err(BirthdayRunResult {
                contacts_count: 0,
                messages_sent: 0,
                skipped_already_ran: true,
            });
        }
        Ok(Self)
    }
}

impl Drop for RunInProgressGuard {
    fn drop(&mut self) {
        RUN_IN_PROGRESS.store(false, Ordering::SeqCst);
    }
}

fn with_open_database<T, F>(db_state: &DbState, f: F) -> Result<T, String>
where
    F: FnOnce(&crate::database::Database) -> Result<T, String>,
{
    let guard = db_state.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    f(database)
}

fn prepare_run(
    app: &AppHandle,
    db: &crate::database::Database,
    force: bool,
) -> Result<Option<PreparedBirthdayRun>, String> {
    let Some(config) = load_runtime_config(app, db)? else {
        return Ok(None);
    };

    let contacts = list_birthdays_today_from_connection(db.connection())
        .map_err(|e| format!("Lecture anniversaires : {e}"))?;

    let contacts_count = contacts.len() as u32;
    if contacts.is_empty() {
        return Ok(None);
    }

    let notified = if force {
        HashSet::new()
    } else {
        load_notified_contact_ids(db)?
    };

    let pending: Vec<_> = contacts
        .into_iter()
        .filter(|c| force || !notified.contains(&c.id))
        .collect();

    Ok(Some(PreparedBirthdayRun {
        config,
        contacts_count,
        pending,
        notified,
    }))
}

fn send_pending_messages(
    db_state: &DbState,
    prepared: PreparedBirthdayRun,
) -> Result<BirthdayRunResult, String> {
    let PreparedBirthdayRun {
        config,
        contacts_count,
        pending,
        mut notified,
    } = prepared;

    if pending.is_empty() {
        return Ok(BirthdayRunResult {
            contacts_count,
            messages_sent: 0,
            skipped_already_ran: true,
        });
    }

    let mut rng = thread_rng();
    let mut messages_sent = 0u32;
    let message_settings = with_open_database(db_state, |db| load_birthday_message_settings(db))?;

    for contact in &pending {
        let draft = generate_draft(contact, &mut rng, &message_settings);
        let text = format_telegram_notification(&draft.name, &draft.message);
        match send_telegram_message(&config.bot_token, &config.chat_id, &text) {
            Ok(()) => {
                notified.insert(contact.id);
                messages_sent += 1;
                with_open_database(db_state, |db| save_notified_contact_ids(db, &notified))?;
            }
            Err(err) => {
                if messages_sent > 0 {
                    eprintln!(
                        "⚠️ Anniversaires Telegram : envoi partiel ({messages_sent}/{}) — {err}",
                        pending.len()
                    );
                    return Ok(BirthdayRunResult {
                        contacts_count,
                        messages_sent,
                        skipped_already_ran: false,
                    });
                }
                return Err(err);
            }
        }
    }

    Ok(BirthdayRunResult {
        contacts_count,
        messages_sent,
        skipped_already_ran: false,
    })
}

fn run_on_db_state(app: &AppHandle, db_state: &DbState, force: bool) -> Result<BirthdayRunResult, String> {
    let prepared = with_open_database(db_state, |db| prepare_run(app, db, force))?;

    let Some(prepared) = prepared else {
        return Ok(BirthdayRunResult {
            contacts_count: 0,
            messages_sent: 0,
            skipped_already_ran: false,
        });
    };

    let contacts_count = prepared.contacts_count;
    if prepared.pending.is_empty() {
        return Ok(BirthdayRunResult {
            contacts_count,
            messages_sent: 0,
            skipped_already_ran: true,
        });
    }

    send_pending_messages(db_state, prepared)
}

/// Envoie les rappels Telegram manquants (nouveaux anniversaires détectés dans la journée).
pub fn run_if_due_on_db_state(app: &AppHandle, db_state: &DbState) -> Result<BirthdayRunResult, String> {
    let _guard = match RunInProgressGuard::try_acquire() {
        Ok(guard) => guard,
        Err(result) => return Ok(result),
    };
    run_on_db_state(app, db_state, false)
}

/// Force l'envoi pour tous les anniversaires du jour — bouton manuel Paramètres.
pub fn run_now_on_db_state(app: &AppHandle, db_state: &DbState) -> Result<BirthdayRunResult, String> {
    let _guard = match RunInProgressGuard::try_acquire() {
        Ok(guard) => guard,
        Err(result) => return Ok(result),
    };
    run_on_db_state(app, db_state, true)
}

pub fn send_test_message_on_db_state(app: &AppHandle, db_state: &DbState) -> Result<(), String> {
    let config = with_open_database(db_state, |db| {
        load_runtime_config(app, db)?
            .ok_or_else(|| {
                "Telegram non configuré (activez l'option et enregistrez token + chat ID)."
                    .to_string()
            })
    })?;

    send_telegram_message(
        &config.bot_token,
        &config.chat_id,
        "Test Patrimoine CRM — connexion Telegram OK.\n\nLes rappels anniversaire arriveront ici.",
    )
}
