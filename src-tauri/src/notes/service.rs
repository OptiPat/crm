use crate::database::Database;
use super::models::{
    NewPersonalNote, PersonalNote, SharedNote, SharedNotesSyncResult, UpdatePersonalNote,
};
use super::registry::{self, RemoteSyncPayload};

pub(crate) fn author_context_read(db: &Database) -> Result<(String, String), String> {
    let view = crate::licensing::get_status(db)?;
    let installation_id = view.installation_id.trim().to_string();
    if installation_id.is_empty() {
        return Err(
            "Installation non identifiée. Activez d'abord la licence (email requis).".to_string(),
        );
    }
    let author_name = view
        .client_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .or(view.client_email.as_deref())
        .unwrap_or("Utilisateur CRM")
        .trim()
        .to_string();
    Ok((installation_id, author_name))
}

pub(crate) fn author_context_write(db: &Database) -> Result<(String, String), String> {
    let view = crate::licensing::get_status(db)?;
    if !view.is_valid {
        return Err(
            "Licence expirée ou inactive. Réactivez la licence pour modifier les notes partagées."
                .to_string(),
        );
    }
    author_context_read(db)
}

pub fn apply_shared_remote_sync(
    db: &Database,
    installation_id: &str,
    remote: RemoteSyncPayload,
) -> Result<Vec<SharedNote>, String> {
    db.replace_shared_notes_cache(&remote.notes, &remote.contributions)
        .map_err(|e| format!("Mise à jour cache notes : {e}"))?;
    db.get_shared_notes_view(installation_id)
        .map_err(|e| format!("Lecture notes partagées : {e}"))
}

pub fn shared_notes_cache_only(db: &Database) -> Result<SharedNotesSyncResult, String> {
    let (installation_id, _) = author_context_read(db)?;
    let notes = db
        .get_shared_notes_view(&installation_id)
        .map_err(|e| format!("Lecture cache notes partagées : {e}"))?;
    Ok(SharedNotesSyncResult {
        synced: false,
        notes,
        message: Some(
            "Registre notes non configuré à la compilation (NOTES_REGISTRY_*).".into(),
        ),
    })
}

pub fn refresh_shared_notes_after_mutation(
    db: &Database,
    installation_id: &str,
) -> Result<Vec<SharedNote>, String> {
    if !registry::is_registry_configured() {
        return Err("Registre notes non configuré (NOTES_REGISTRY_*).".into());
    }
    let remote = registry::sync_remote()?;
    match apply_shared_remote_sync(db, installation_id, remote) {
        Ok(notes) => Ok(notes),
        Err(local_err) => match db.get_shared_notes_view(installation_id) {
            Ok(notes) if !notes.is_empty() => Ok(notes),
            _ => Err(format!(
                "Note enregistrée à distance mais cache local non mis à jour : {local_err}"
            )),
        },
    }
}

pub fn get_shared_notes(db: &Database) -> Result<Vec<SharedNote>, String> {
    let (installation_id, _) = author_context_read(db)?;
    db.get_shared_notes_view(&installation_id)
        .map_err(|e| format!("Lecture notes partagées : {e}"))
}

pub fn create_personal_note(db: &Database, input: NewPersonalNote) -> Result<PersonalNote, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Le titre est obligatoire.".into());
    }
    db.create_personal_note(NewPersonalNote {
        title: title.to_string(),
        content_html: input.content_html,
        category: input.category,
        pinned: input.pinned,
    })
    .map_err(|e| format!("Création note : {e}"))
}

pub fn update_personal_note(
    db: &Database,
    id: i64,
    input: UpdatePersonalNote,
) -> Result<PersonalNote, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Le titre est obligatoire.".into());
    }
    db.update_personal_note(
        id,
        UpdatePersonalNote {
            title: title.to_string(),
            content_html: input.content_html,
            category: input.category,
            pinned: input.pinned,
        },
    )
    .map_err(|e| format!("Mise à jour note : {e}"))
}

pub fn delete_personal_note(db: &Database, id: i64) -> Result<(), String> {
    db.delete_personal_note(id)
        .map_err(|e| format!("Suppression note : {e}"))
}

pub fn get_all_personal_notes(db: &Database) -> Result<Vec<PersonalNote>, String> {
    db.get_all_personal_notes()
        .map_err(|e| format!("Lecture notes : {e}"))
}
