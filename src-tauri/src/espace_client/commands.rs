use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::models::{EspaceAcces, EspaceConnexionLogEntry, EspaceDemande, EspaceSyncSummary};
use crate::espace_client::activation::{generate_six_digit_code, hash_espace_otp};
use crate::espace_client::config::{
    ensure_depot_public_key, get_sync_config, is_espace_client_active, load_sync_secret,
    save_sync_config, EspaceClientSyncConfig, PORTAL_URL_SETTING_KEY,
};
use crate::espace_client::depot_import::{import_espace_depots, ImportEspaceDepotsResult};
use crate::espace_client::avoir_declaration_import::{
    ack_espace_avoir_declarations, import_espace_avoir_declarations,
};
use crate::espace_client::scpi_declaration_import::{
    ack_espace_scpi_declarations, import_espace_scpi_declarations,
};
use crate::espace_client::portal_api::{pull_espace_connexion_log, pull_espace_scpi_declarations, push_espace_acces_revoke, PortalScpiDeclarationLine};
use crate::espace_client::push::push_espace_client_snapshot;
use crate::espace_client::snapshot::{
    build_espace_client_preview, build_espace_client_snapshot,
    build_espace_client_snapshot_for_push, EspaceClientPreview,
};
use crate::espace_client::sync_payload::EspaceClientSyncPayload;
use crate::database::Database;
use tauri::State;

/// R11 — la fonctionnalité est mono-instance et invisible par défaut : aucune
/// commande ne répond tant que `espace_client_active` n'est pas posée.
pub(super) fn require_espace_client_active(database: &Database) -> Result<(), String> {
    if is_espace_client_active(database)? {
        return Ok(());
    }
    Err("Espace client non activé sur cette installation".into())
}

#[tauri::command]
pub fn get_espace_acces_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<Option<EspaceAcces>, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database
        .get_espace_acces_by_contact(contact_id)
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceActivationResult {
    pub acces: EspaceAcces,
    /// Code en clair, affiché une seule fois : le conseiller le dicte au client.
    pub activation_code: String,
}

#[tauri::command]
pub fn activate_espace_acces_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
    email: String,
) -> Result<EspaceActivationResult, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;

    let activation_code = generate_six_digit_code();
    let secret = load_sync_secret(&app, database)?;
    let code_hash = hash_espace_otp(&secret, &activation_code);
    let acces = database.activate_espace_acces(contact_id, &email, &code_hash)?;

    Ok(EspaceActivationResult {
        acces,
        activation_code,
    })
}

#[tauri::command]
pub fn revoke_espace_acces_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<EspaceAcces, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;

    // Le portail d'abord : c'est lui qui détient les sessions ouvertes et les
    // codes valides. Marquer l'accès révoqué côté CRM alors que le portail
    // continue de servir le patrimoine donnerait une révocation de façade.
    let portal_configured = database
        .get_setting(crate::espace_client::config::PORTAL_URL_SETTING_KEY)
        .ok()
        .flatten()
        .is_some_and(|url| !url.trim().is_empty());
    if portal_configured {
        push_espace_acces_revoke(&app, database, contact_id).map_err(|error| {
            format!("Révocation refusée : le portail n'a pas pu être joint ({error}). L'accès reste actif, réessayez.")
        })?;
    }

    database.revoke_espace_acces(contact_id)
}

#[tauri::command]
pub fn get_espace_sync_summary_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<EspaceSyncSummary, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database.get_espace_sync_summary().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_espace_client_sync_config_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<EspaceClientSyncConfig, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    get_sync_config(database)
}

#[tauri::command]
pub fn save_espace_client_sync_config_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    portal_url: String,
    sync_secret: Option<String>,
    rdv_lien_id: Option<String>,
) -> Result<EspaceClientSyncConfig, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    save_sync_config(
        &app,
        database,
        &portal_url,
        sync_secret.as_deref(),
        rdv_lien_id.as_deref(),
    )
}

#[tauri::command]
pub fn build_espace_client_snapshot_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<EspaceClientSyncPayload, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    build_espace_client_snapshot(database, contact_id)
}

/// L'aperçu lit la timeline du moteur Rust plutôt que de la reconstruire :
/// une règle d'affichage écrite deux fois finit par diverger, ce qui est déjà
/// arrivé (alertes transmises d'un côté, masquées de l'autre).
#[tauri::command]
pub fn build_espace_client_preview_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<EspaceClientPreview, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    build_espace_client_preview(database, contact_id)
}

#[derive(serde::Serialize)]
pub struct PushEspaceClientContactResult {
    pub sequence: i64,
    pub investissement_count: usize,
    pub timeline_count: usize,
}

#[tauri::command]
pub fn push_espace_client_contact_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<PushEspaceClientContactResult, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    // Crée la paire de clés au premier envoi : sans clé publique côté portail,
    // aucun dépôt ne pourrait être scellé.
    ensure_depot_public_key(&app, database)?;
    let payload = build_espace_client_snapshot_for_push(database, contact_id)?;
    push_espace_client_snapshot(&app, database, &payload)?;
    Ok(PushEspaceClientContactResult {
        sequence: payload.sequence,
        investissement_count: payload.investissements.len(),
        timeline_count: payload.timeline.len(),
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushEspaceClientAllResult {
    pub total: usize,
    pub reussis: usize,
    /// Un contact en échec n'interrompt pas les suivants : le conseiller voit
    /// à la fin lesquels rejouer, plutôt qu'une synchronisation à moitié faite
    /// sans savoir où elle s'est arrêtée.
    pub echecs: Vec<String>,
}

#[tauri::command]
pub fn push_all_espace_clients_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<PushEspaceClientAllResult, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    ensure_depot_public_key(&app, database)?;

    let contacts = database
        .list_espace_contacts_actifs()
        .map_err(|e| e.to_string())?;

    let mut reussis = 0usize;
    let mut echecs = Vec::new();
    for contact_id in &contacts {
        let resultat = build_espace_client_snapshot_for_push(database, *contact_id)
            .and_then(|payload| push_espace_client_snapshot(&app, database, &payload));
        match resultat {
            Ok(()) => reussis += 1,
            Err(error) => echecs.push(format!("contact {contact_id} : {error}")),
        }
    }

    Ok(PushEspaceClientAllResult {
        total: contacts.len(),
        reussis,
        echecs,
    })
}

#[tauri::command]
pub fn get_espace_connexion_log_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<Vec<EspaceConnexionLogEntry>, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;

    match pull_espace_connexion_log(&app, database, contact_id, 50) {
        Ok(lines) => {
            for line in &lines {
                database
                    .insert_espace_connexion_log_if_new(
                        contact_id,
                        &line.event,
                        line.detail.as_deref(),
                        line.ip.as_deref(),
                        line.user_agent.as_deref(),
                        line.created_at,
                    )
                    .map_err(|e| e.to_string())?;
            }
            Ok(lines
                .into_iter()
                .map(|line| EspaceConnexionLogEntry {
                    id: line.id,
                    contact_id: line.contact_id,
                    event: line.event,
                    detail: line.detail,
                    ip: line.ip,
                    user_agent: line.user_agent,
                    created_at: line.created_at,
                })
                .collect())
        }
        Err(_) => database
            .list_espace_connexion_log(contact_id, 50)
            .map_err(|e| e.to_string()),
    }
}

fn portal_configured(database: &Database) -> bool {
    database
        .get_setting(PORTAL_URL_SETTING_KEY)
        .ok()
        .flatten()
        .is_some_and(|url| !url.trim().is_empty())
}

fn try_push_contact_snapshot(
    app: &tauri::AppHandle,
    database: &Database,
    contact_id: i64,
) -> Result<(), String> {
    if !portal_configured(database) {
        return Ok(());
    }
    let payload = build_espace_client_snapshot_for_push(database, contact_id)?;
    push_espace_client_snapshot(app, database, &payload)
}

#[tauri::command]
pub fn list_espace_demandes_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<Vec<EspaceDemande>, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    database
        .list_espace_demandes_by_contact(contact_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_espace_demande_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
    type_document: String,
    template_key: Option<String>,
    libelle: String,
) -> Result<EspaceDemande, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;

    let demande = database.create_espace_demande(
        contact_id,
        &type_document,
        template_key.as_deref(),
        &libelle,
    )?;

    if portal_configured(database) {
        if let Err(error) = try_push_contact_snapshot(&app, database, contact_id) {
            return Err(format!(
                "Demande créée mais synchronisation portail échouée : {error}"
            ));
        }
    }

    Ok(demande)
}

#[tauri::command]
pub fn cancel_espace_demande_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    demande_id: i64,
) -> Result<EspaceDemande, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;

    let existing = database
        .get_espace_demande_by_id(demande_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Demande introuvable".to_string())?;
    let contact_id = existing.contact_id;

    let demande = database.cancel_espace_demande(demande_id)?;

    if portal_configured(database) {
        if let Err(error) = try_push_contact_snapshot(&app, database, contact_id) {
            return Err(format!(
                "Demande annulée mais synchronisation portail échouée : {error}"
            ));
        }
    }

    Ok(demande)
}

#[tauri::command]
pub fn import_espace_depots_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<ImportEspaceDepotsResult, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    let mut result = import_espace_depots(&app, database, contact_id)?;
    let scpi = import_espace_scpi_declarations(&app, database, contact_id)?;
    let avoirs = import_espace_avoir_declarations(&app, database, contact_id)?;
    result.scpi_declarations_imported = scpi.imported;
    result.avoirs_imported = avoirs.imported;
    result.errors.extend(scpi.errors);
    result.errors.extend(avoirs.errors);
    if !scpi.a_accuser.is_empty() || !avoirs.a_accuser.is_empty() {
        // Photo d'abord, accusé de réception ensuite : le client doit continuer
        // à voir le montant qu'il a saisi tant que le portail n'a pas reçu la
        // valeur reprise par le CRM.
        match try_push_contact_snapshot(&app, database, contact_id) {
            Ok(()) => {
                result.errors.extend(ack_espace_scpi_declarations(
                    &app,
                    database,
                    contact_id,
                    &scpi.a_accuser,
                ));
                result.errors.extend(ack_espace_avoir_declarations(
                    &app,
                    database,
                    contact_id,
                    &avoirs.a_accuser,
                ));
            }
            Err(error) => result.errors.push(format!(
                "Déclarations importées mais synchronisation portail échouée : {error}"
            )),
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn list_espace_scpi_declarations_pending_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<Vec<PortalScpiDeclarationLine>, String> {
    require_ui_session(&session)?;
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    require_espace_client_active(database)?;
    pull_espace_scpi_declarations(&app, database, contact_id)
}

#[cfg(test)]
mod tests {
    use crate::espace_client::config::PORTAL_URL_SETTING_KEY;

    #[test]
    fn portal_url_setting_key_is_stable() {
        assert_eq!(PORTAL_URL_SETTING_KEY, "espace_client_portal_url");
    }
}
