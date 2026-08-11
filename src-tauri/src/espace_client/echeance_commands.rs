//! Commandes des échéances rédigées par le conseiller pour un client.
//!
//! Façade fine : session, activation de l'espace, puis appel à la couche base.
//! Les règles de saisie vivent dans `database::espace_echeance`.

use tauri::State;

use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::models::EspaceEcheance;

use super::commands::require_espace_client_active;

#[tauri::command]
pub fn list_espace_echeances_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<Vec<EspaceEcheance>, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database
        .list_espace_echeances(contact_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_espace_echeance_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
    date_echeance: i64,
    titre: String,
    message: Option<String>,
    rdv_lien_id: Option<String>,
) -> Result<EspaceEcheance, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database.create_espace_echeance(
        contact_id,
        date_echeance,
        &titre,
        message.as_deref(),
        rdv_lien_id.as_deref(),
    )
}

// Pas de commande de modification : une échéance tient en une date et une
// phrase, la supprimer puis la refaire coûte moins qu'un formulaire d'édition.

#[tauri::command]
pub fn delete_espace_echeance_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    id: i64,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database.delete_espace_echeance(id)
}
