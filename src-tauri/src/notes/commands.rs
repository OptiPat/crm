use super::models::{
    NewPersonalNote, NewSharedNote, NewSharedNoteContribution, PersonalNote, SharedNote,
    SharedNotesSyncResult, UpdatePersonalNote, UpdateSharedNote,
};
use super::registry;
use super::service;
use crate::commands::DbState;
use crate::database::Database;
use tauri::State;

fn with_database<T, F>(db: &State<'_, DbState>, f: F) -> Result<T, String>
where
    F: FnOnce(&Database) -> Result<T, String>,
{
    let guard = db
        .lock()
        .map_err(|_| "Impossible de verrouiller la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte.".to_string())?;
    f(database)
}

#[tauri::command]
pub fn get_all_personal_notes_cmd(db: State<'_, DbState>) -> Result<Vec<PersonalNote>, String> {
    with_database(&db, service::get_all_personal_notes)
}

#[tauri::command]
pub fn create_personal_note_cmd(
    db: State<'_, DbState>,
    input: NewPersonalNote,
) -> Result<PersonalNote, String> {
    with_database(&db, |database| service::create_personal_note(database, input))
}

#[tauri::command]
pub fn update_personal_note_cmd(
    db: State<'_, DbState>,
    id: i64,
    input: UpdatePersonalNote,
) -> Result<PersonalNote, String> {
    with_database(&db, |database| service::update_personal_note(database, id, input))
}

#[tauri::command]
pub fn delete_personal_note_cmd(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    with_database(&db, |database| service::delete_personal_note(database, id))
}

#[tauri::command]
pub fn get_shared_notes_cmd(db: State<'_, DbState>) -> Result<Vec<SharedNote>, String> {
    with_database(&db, service::get_shared_notes)
}

#[tauri::command]
pub fn sync_shared_notes_cmd(db: State<'_, DbState>) -> Result<SharedNotesSyncResult, String> {
    let installation_id = with_database(&db, |database| {
        service::author_context_read(database).map(|(id, _)| id)
    })?;

    if !registry::is_registry_configured() {
        return with_database(&db, service::shared_notes_cache_only);
    }

    let remote = registry::sync_remote()?;
    with_database(&db, |database| {
        let notes = service::apply_shared_remote_sync(database, &installation_id, remote)?;
        Ok(SharedNotesSyncResult {
            synced: true,
            notes,
            message: None,
        })
    })
}

#[tauri::command]
pub fn create_shared_note_cmd(
    db: State<'_, DbState>,
    input: NewSharedNote,
) -> Result<Vec<SharedNote>, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Le titre est obligatoire.".into());
    }

    let (installation_id, author_name) =
        with_database(&db, service::author_context_write)?;

    registry::create_remote_note(
        &installation_id,
        &author_name,
        title,
        &input.content_html,
    )?;

    with_database(&db, |database| {
        service::refresh_shared_notes_after_mutation(database, &installation_id)
    })
}

#[tauri::command]
pub fn update_shared_note_cmd(
    db: State<'_, DbState>,
    note_id: String,
    input: UpdateSharedNote,
) -> Result<Vec<SharedNote>, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Le titre est obligatoire.".into());
    }

    let installation_id = with_database(&db, |database| {
        service::author_context_write(database).map(|(id, _)| id)
    })?;

    registry::update_remote_note(
        &note_id,
        &installation_id,
        title,
        &input.content_html,
    )?;

    with_database(&db, |database| {
        service::refresh_shared_notes_after_mutation(database, &installation_id)
    })
}

#[tauri::command]
pub fn delete_shared_note_cmd(
    db: State<'_, DbState>,
    note_id: String,
) -> Result<Vec<SharedNote>, String> {
    let installation_id = with_database(&db, |database| {
        service::author_context_write(database).map(|(id, _)| id)
    })?;

    registry::delete_remote_note(&note_id, &installation_id)?;

    with_database(&db, |database| {
        service::refresh_shared_notes_after_mutation(database, &installation_id)
    })
}

#[tauri::command]
pub fn add_shared_note_contribution_cmd(
    db: State<'_, DbState>,
    input: NewSharedNoteContribution,
) -> Result<Vec<SharedNote>, String> {
    if input.content_html.trim().is_empty() {
        return Err("Le complément ne peut pas être vide.".into());
    }

    let (installation_id, author_name) =
        with_database(&db, service::author_context_write)?;

    registry::add_remote_contribution(
        &input.note_id,
        &installation_id,
        &author_name,
        &input.content_html,
    )?;

    with_database(&db, |database| {
        service::refresh_shared_notes_after_mutation(database, &installation_id)
    })
}
