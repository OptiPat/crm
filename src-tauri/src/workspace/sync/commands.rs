use super::blob::{
    complete_remote_blob, ensure_remote_blob_audit, execute_remote_blob, next_pending_blob,
    seed_missing_document_blobs,
};
use super::pull::{apply_pull_batch, prepare_pull_batch};
use super::push::{
    complete_remote_push, ensure_remote_audit_entry, ensure_remote_mutation_audit,
    execute_remote_push, next_pending_push, RemotePushResult,
};
use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::workspace_sync::{
    build_team_migration_snapshot, snapshot_checksum, WorkspaceSyncConflict,
};
use crate::database::Database;
use crate::workspace::cache::{
    save_workspace_cache_manifest, team_cache_database_path, team_cache_temp_path,
};
use crate::workspace::commands::resolve_microsoft_team_connection;
use crate::workspace::enrollment::{
    load_workspace_enrollment, mark_workspace_sync_activated, validate_workspace_enrollment,
};
use crate::workspace::guard::{resolve_sharepoint_site_ref, workspace_config_from_db};
use crate::workspace::identity::require_fresh_sensitive_team_authority;
use crate::workspace::migration::{
    compute_mutation_id, compute_sync_key, validate_team_remote_snapshot,
};
use crate::workspace::sharepoint::{
    SharePointGraphClient, LIST_CRM_AUDIT, LIST_CRM_DATA, LIST_CRM_SEQUENCES,
};
use crate::workspace::sync::sequence::reserve_remote_id_block;
use chrono::Utc;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, State};

const MAX_PUSHES_PER_CYCLE: usize = 100;
const MAX_BLOBS_PER_CYCLE: usize = 10;
const ID_BLOCK_SIZE: i64 = 1_000_000;

fn remove_sqlite_cache_artifacts(path: &Path) -> Result<(), String> {
    for suffix in ["", "-wal", "-shm"] {
        let candidate = if suffix.is_empty() {
            path.to_path_buf()
        } else {
            let mut value = path.as_os_str().to_os_string();
            value.push(suffix);
            value.into()
        };
        if candidate.exists() {
            std::fs::remove_file(&candidate).map_err(|error| {
                format!(
                    "Suppression de l'ancien cache {} impossible : {error}",
                    candidate.display()
                )
            })?;
        }
    }
    Ok(())
}

fn create_team_cache_copy(
    app: &AppHandle,
    source_database: &Database,
) -> Result<(std::path::PathBuf, Database), String> {
    let temp_path = team_cache_temp_path(app)?;
    remove_sqlite_cache_artifacts(&temp_path)?;
    source_database
        .backup_to_path(&temp_path)
        .map_err(|error| format!("Copie de sécurité vers le cache équipe impossible : {error}"))?;
    let team_database = Database::open_workspace_cache_at_path(app, &temp_path)
        .map_err(|error| format!("Ouverture du cache équipe impossible : {error}"))?;
    Ok((temp_path, team_database))
}

fn activate_manifest_with_rollback(
    mark_activated: impl FnOnce() -> Result<(), String>,
    save_manifest: impl FnOnce() -> Result<(), String>,
    rollback_activation: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    mark_activated()?;
    if let Err(manifest_error) = save_manifest() {
        return match rollback_activation() {
            Ok(()) => Err(format!(
                "Activation du manifeste cache impossible, enrôlement restauré : {manifest_error}"
            )),
            Err(rollback_error) => Err(format!(
                "Activation du manifeste cache impossible : {manifest_error}. \
                 Le rollback de l'enrôlement a aussi échoué : {rollback_error}"
            )),
        };
    }
    Ok(())
}

fn finalize_team_cache(
    app: &AppHandle,
    temp_path: &Path,
    team_database: Database,
) -> Result<Database, String> {
    drop(team_database);
    let final_path = team_cache_database_path(app)?;
    remove_sqlite_cache_artifacts(&final_path)?;
    std::fs::rename(temp_path, &final_path)
        .map_err(|error| format!("Activation atomique du cache équipe impossible : {error}"))?;
    let active_database = Database::open_workspace_cache_at_path(app, &final_path)
        .map_err(|error| format!("Réouverture du cache équipe impossible : {error}"))?;
    let enrollment = load_workspace_enrollment(app)?
        .ok_or_else(|| "Enrôlement équipe absent lors du cutover.".to_string())?;
    activate_manifest_with_rollback(
        || mark_workspace_sync_activated(app).map(|_| ()),
        || save_workspace_cache_manifest(app, &enrollment.workspace_id).map(|_| ()),
        || {
            crate::workspace::enrollment::set_workspace_sync_activated(app, false).map(|_| ())
        },
    )?;
    let sealed_path = crate::workspace::cache::team_cache_sealed_path(app)?;
    if sealed_path.exists() {
        std::fs::remove_file(&sealed_path)
            .map_err(|error| format!("Suppression de l'ancien cache scellé : {error}"))?;
    }
    Ok(active_database)
}

pub(super) fn reserve_and_install_id_blocks(
    database: &Database,
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
    sequence_list_id: &str,
) -> Result<usize, String> {
    let autoincrement_tables = database
        .workspace_sync_autoincrement_tables()
        .map_err(|error| error.to_string())?;
    let mut reserved_blocks = Vec::with_capacity(autoincrement_tables.len());
    for (table_name, max_id) in &autoincrement_tables {
        reserved_blocks.push(reserve_remote_id_block(
            client,
            access_token,
            site_id,
            sequence_list_id,
            table_name,
            max_id.saturating_add(1),
            ID_BLOCK_SIZE,
        )?);
    }
    for block in &reserved_blocks {
        database
            .workspace_sync_install_id_block(
                &block.sequence_key,
                block.start_id,
                block.end_id,
                &block.remote_item_id,
                &block.remote_etag,
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(reserved_blocks.len())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamSyncOnceReport {
    pub pulled: usize,
    pub pushed: usize,
    pub conflicts: usize,
    pub pending: usize,
    pub delta_link_updated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamSyncActivationReport {
    pub activated: bool,
    pub synchronized_records: usize,
    pub reserved_id_blocks: usize,
}

#[tauri::command]
pub fn list_team_sync_conflicts_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<Vec<WorkspaceSyncConflict>, String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        workspace_config_from_db(database)?
    };
    validate_workspace_enrollment(&app_handle, &config)?;
    require_fresh_sensitive_team_authority(&app_handle, &config)?;
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    database
        .workspace_sync_list_open_conflicts()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resolve_team_sync_conflict_keep_local_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    conflict_id: i64,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        workspace_config_from_db(database)?
    };
    validate_workspace_enrollment(&app_handle, &config)?;
    require_fresh_sensitive_team_authority(&app_handle, &config)?;
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    database
        .workspace_sync_resolve_conflict_keep_local(conflict_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resolve_team_sync_conflict_accept_remote_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    conflict_id: i64,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        workspace_config_from_db(database)?
    };
    validate_workspace_enrollment(&app_handle, &config)?;
    require_fresh_sensitive_team_authority(&app_handle, &config)?;
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    database.workspace_sync_resolve_conflict_accept_remote(conflict_id)
}

#[tauri::command]
pub fn activate_team_sync_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<TeamSyncActivationReport, String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        workspace_config_from_db(database)?
    };
    validate_workspace_enrollment(&app_handle, &config)?;
    let authority = require_fresh_sensitive_team_authority(&app_handle, &config)?;
    if !authority.capabilities.can_manage_members {
        return Err("Seul le conseiller peut activer la synchronisation équipe.".into());
    }
    let connection = resolve_microsoft_team_connection(&app_handle)?
        .ok_or_else(|| "Connexion Microsoft équipe absente.".to_string())?;
    let site_ref = resolve_sharepoint_site_ref(&config)?;
    let site_id = config
        .site_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Identifiant du site SharePoint absent.".to_string())?;
    let client = SharePointGraphClient::new(site_ref);
    let data_list = client
        .find_list_by_display_name_blocking(&connection.access_token, site_id, LIST_CRM_DATA)?
        .ok_or_else(|| format!("Liste SharePoint introuvable : {LIST_CRM_DATA}"))?;
    let sequence_list = client
        .find_list_by_display_name_blocking(&connection.access_token, site_id, LIST_CRM_SEQUENCES)?
        .ok_or_else(|| format!("Liste SharePoint introuvable : {LIST_CRM_SEQUENCES}"))?;

    // Le verrou DB est volontairement conservé durant ce cutover ponctuel :
    // aucune mutation locale ne doit se glisser entre le checksum et l'activation.
    let mut guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let source_database = guard.as_ref().ok_or("Base non initialisée")?;
    if source_database
        .workspace_sync_get_state("capture_enabled")
        .map_err(|error| error.to_string())?
        .as_deref()
        == Some("1")
    {
        return Err("La synchronisation équipe est déjà activée.".into());
    }
    let (temp_path, team_database) = create_team_cache_copy(&app_handle, source_database)?;
    let local_snapshot =
        build_team_migration_snapshot(&team_database).map_err(|error| error.to_string())?;
    let expected_checksum = snapshot_checksum(&local_snapshot);
    let validation = validate_team_remote_snapshot(&app_handle, &config, &expected_checksum)?;
    if !validation.valid || !validation.checksum_match {
        return Err(format!(
            "Le snapshot SharePoint ne correspond pas à la base locale : {}",
            validation.errors.join(" ")
        ));
    }

    let initial_delta =
        client.list_items_delta_blocking(&connection.access_token, site_id, &data_list.id, None)?;
    let synchronized_records = initial_delta.items.len();
    let batch = prepare_pull_batch(&team_database, initial_delta)?;
    apply_pull_batch(&team_database, &batch)?;

    let reserved_id_blocks = reserve_and_install_id_blocks(
        &team_database,
        &client,
        &connection.access_token,
        site_id,
        &sequence_list.id,
    )?;
    team_database
        .workspace_sync_activate_capture(&batch.delta_link)
        .map_err(|error| error.to_string())?;
    let active_database = finalize_team_cache(&app_handle, &temp_path, team_database)?;
    *guard = Some(active_database);
    Ok(TeamSyncActivationReport {
        activated: true,
        synchronized_records,
        reserved_id_blocks,
    })
}

#[tauri::command]
pub fn bootstrap_team_sync_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<TeamSyncActivationReport, String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        workspace_config_from_db(database)?
    };
    validate_workspace_enrollment(&app_handle, &config)?;
    let authority = require_fresh_sensitive_team_authority(&app_handle, &config)?;
    if authority.identity.is_none() {
        return Err("Identité Microsoft équipe indisponible.".into());
    }
    let enrollment = load_workspace_enrollment(&app_handle)?
        .ok_or_else(|| "Rejoignez d'abord l'espace équipe depuis les paramètres.".to_string())?;
    if enrollment.sync_activated {
        return Err("La synchronisation équipe est déjà activée sur ce poste.".into());
    }
    let connection = resolve_microsoft_team_connection(&app_handle)?
        .ok_or_else(|| "Connexion Microsoft équipe absente.".to_string())?;
    let site_ref = resolve_sharepoint_site_ref(&config)?;
    let site_id = config
        .site_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Identifiant du site SharePoint absent.".to_string())?;
    let client = SharePointGraphClient::new(site_ref);
    let data_list = client
        .find_list_by_display_name_blocking(&connection.access_token, site_id, LIST_CRM_DATA)?
        .ok_or_else(|| format!("Liste SharePoint introuvable : {LIST_CRM_DATA}"))?;
    let sequence_list = client
        .find_list_by_display_name_blocking(&connection.access_token, site_id, LIST_CRM_SEQUENCES)?
        .ok_or_else(|| format!("Liste SharePoint introuvable : {LIST_CRM_SEQUENCES}"))?;

    let mut guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let source_database = guard.as_ref().ok_or("Base non initialisée")?;
    let local_snapshot =
        build_team_migration_snapshot(source_database).map_err(|error| error.to_string())?;
    if !local_snapshot.records.is_empty() {
        return Err(
            "Ce poste contient déjà des données CRM. Utilisez la migration conseiller ou un poste local vide pour rejoindre l'équipe."
                .into(),
        );
    }
    let (temp_path, team_database) = create_team_cache_copy(&app_handle, source_database)?;
    let initial_delta =
        client.list_items_delta_blocking(&connection.access_token, site_id, &data_list.id, None)?;
    let synchronized_records = initial_delta.items.len();
    let batch = prepare_pull_batch(&team_database, initial_delta)?;
    apply_pull_batch(&team_database, &batch)?;
    let reserved_id_blocks = reserve_and_install_id_blocks(
        &team_database,
        &client,
        &connection.access_token,
        site_id,
        &sequence_list.id,
    )?;
    team_database
        .workspace_sync_activate_capture(&batch.delta_link)
        .map_err(|error| error.to_string())?;
    let active_database = finalize_team_cache(&app_handle, &temp_path, team_database)?;
    *guard = Some(active_database);
    Ok(TeamSyncActivationReport {
        activated: true,
        synchronized_records,
        reserved_id_blocks,
    })
}

#[tauri::command]
pub fn team_sync_once_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<TeamSyncOnceReport, String> {
    require_ui_session(&session)?;
    let (config, previous_delta_link) = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        if database
            .workspace_sync_get_state("capture_enabled")
            .map_err(|error| error.to_string())?
            .as_deref()
            != Some("1")
        {
            return Err(
                "La synchronisation continue n'est pas encore activée pour ce cache équipe.".into(),
            );
        }
        (
            workspace_config_from_db(database)?,
            database
                .workspace_sync_get_state("crm_data_delta_link")
                .map_err(|error| error.to_string())?,
        )
    };
    validate_workspace_enrollment(&app_handle, &config)?;
    let authority = require_fresh_sensitive_team_authority(&app_handle, &config)?;
    let actor_id = authority
        .identity
        .as_ref()
        .map(|identity| identity.microsoft_oid.clone())
        .ok_or_else(|| "Identité Microsoft équipe indisponible.".to_string())?;
    let connection = resolve_microsoft_team_connection(&app_handle)?
        .ok_or_else(|| "Connexion Microsoft équipe absente.".to_string())?;
    let access_token = connection.access_token;
    let site_ref = resolve_sharepoint_site_ref(&config)?;
    let site_id = config
        .site_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Identifiant du site SharePoint absent.".to_string())?;
    let client = SharePointGraphClient::new(site_ref);
    let list = client
        .find_list_by_display_name_blocking(&access_token, site_id, LIST_CRM_DATA)?
        .ok_or_else(|| format!("Liste SharePoint introuvable : {LIST_CRM_DATA}"))?;
    let audit_list = client
        .find_list_by_display_name_blocking(&access_token, site_id, LIST_CRM_AUDIT)?
        .ok_or_else(|| format!("Liste SharePoint introuvable : {LIST_CRM_AUDIT}"))?;

    let remote_delta = client.list_items_delta_blocking(
        &access_token,
        site_id,
        &list.id,
        previous_delta_link.as_deref(),
    )?;
    let pulled = remote_delta.items.len();
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        let batch = prepare_pull_batch(database, remote_delta)?;
        apply_pull_batch(database, &batch)?;
        database
            .workspace_sync_mark_online()
            .map_err(|error| error.to_string())?;
    }

    let mut pushed = 0;
    let mut conflicts = 0;
    for _ in 0..MAX_PUSHES_PER_CYCLE {
        let plan = {
            let guard = db
                .lock()
                .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
            let database = guard.as_ref().ok_or("Base non initialisée")?;
            next_pending_push(database)?
        };
        let Some(plan) = plan else {
            break;
        };
        let result = execute_remote_push(
            &client,
            &access_token,
            site_id,
            &list.id,
            &actor_id,
            &Utc::now().to_rfc3339(),
            &plan,
        )?;
        match &result {
            RemotePushResult::Applied { .. } => {
                ensure_remote_mutation_audit(
                    &client,
                    &access_token,
                    site_id,
                    &audit_list.id,
                    &actor_id,
                    &Utc::now().to_rfc3339(),
                    &plan.queue_item,
                )?;
                let guard = db
                    .lock()
                    .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
                let database = guard.as_ref().ok_or("Base non initialisée")?;
                if complete_remote_push(database, &plan, &result)? {
                    pushed += 1;
                }
            }
            RemotePushResult::Conflict {
                remote_item_id,
                remote_payload_json,
                remote_etag,
                remote_deleted,
                ..
            } => {
                let conflict_key = format!(
                    "{}:{}",
                    plan.queue_item.table_name, plan.queue_item.record_key
                );
                let mutation_id = compute_mutation_id(
                    &compute_sync_key("sync_conflict", &conflict_key),
                    plan.queue_item.revision,
                );
                ensure_remote_audit_entry(
                    &client,
                    &access_token,
                    site_id,
                    &audit_list.id,
                    &mutation_id,
                    &plan.queue_item.table_name,
                    &plan.queue_item.record_key,
                    &actor_id,
                    "conflict",
                    &format!(
                        "Conflit de synchronisation — révision {}",
                        plan.queue_item.revision
                    ),
                    &Utc::now().to_rfc3339(),
                )?;
                let guard = db
                    .lock()
                    .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
                let database = guard.as_ref().ok_or("Base non initialisée")?;
                database.workspace_sync_record_push_conflict(
                    &plan.queue_item.table_name,
                    &plan.queue_item.record_key,
                    remote_item_id,
                    remote_payload_json.as_deref(),
                    remote_etag.as_deref(),
                    *remote_deleted,
                )?;
                conflicts += 1;
                break;
            }
        }
    }

    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        seed_missing_document_blobs(database)?;
    }
    for _ in 0..MAX_BLOBS_PER_CYCLE {
        let plan = {
            let guard = db
                .lock()
                .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
            let database = guard.as_ref().ok_or("Base non initialisée")?;
            next_pending_blob(database)?
        };
        let Some(plan) = plan else {
            break;
        };
        let result = match execute_remote_blob(&client, &access_token, site_id, &plan) {
            Ok(result) => result,
            Err(error) => {
                let guard = db
                    .lock()
                    .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
                let database = guard.as_ref().ok_or("Base non initialisée")?;
                database
                    .workspace_blob_record_error(plan.queue.id, plan.queue.revision, &error)
                    .map_err(|db_error| db_error.to_string())?;
                return Err(error);
            }
        };
        ensure_remote_blob_audit(
            &client,
            &access_token,
            site_id,
            &audit_list.id,
            &actor_id,
            &Utc::now().to_rfc3339(),
            &plan,
        )?;
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        complete_remote_blob(database, &plan, &result)?;
    }

    let (pending, stored_conflicts) = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        database
            .workspace_sync_mark_online()
            .map_err(|error| error.to_string())?;
        (
            database
                .workspace_sync_list_pending()
                .map_err(|error| error.to_string())?
                .len()
                + database
                    .workspace_blob_pending_count()
                    .map_err(|error| error.to_string())?,
            database
                .workspace_sync_open_conflict_count()
                .map_err(|error| error.to_string())?,
        )
    };
    Ok(TeamSyncOnceReport {
        pulled,
        pushed,
        conflicts: conflicts + stored_conflicts,
        pending,
        delta_link_updated: true,
    })
}

#[cfg(test)]
mod tests {
    use super::activate_manifest_with_rollback;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn failed_manifest_write_rolls_back_sync_activation() {
        let rolled_back = AtomicBool::new(false);
        let error = activate_manifest_with_rollback(
            || Ok(()),
            || Err("disque plein".into()),
            || {
                rolled_back.store(true, Ordering::SeqCst);
                Ok(())
            },
        )
        .unwrap_err();

        assert!(rolled_back.load(Ordering::SeqCst));
        assert!(error.contains("enrôlement restauré"));
    }

    #[test]
    fn successful_manifest_write_does_not_run_rollback() {
        let rolled_back = AtomicBool::new(false);
        activate_manifest_with_rollback(
            || Ok(()),
            || Ok(()),
            || {
                rolled_back.store(true, Ordering::SeqCst);
                Ok(())
            },
        )
        .unwrap();
        assert!(!rolled_back.load(Ordering::SeqCst));
    }
}
