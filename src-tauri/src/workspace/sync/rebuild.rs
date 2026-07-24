use super::commands::reserve_and_install_id_blocks;
use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::workspace::WorkspaceConfig;
use crate::database::workspace_restore::{
    restore_snapshot_into_database, table_counts_for_snapshot_records,
};
use crate::database::workspace_sync::snapshot_checksum;
use crate::database::Database;
use crate::workspace::cache::{
    save_workspace_cache_manifest, team_cache_database_path, team_cache_sealed_path,
    team_cache_temp_path,
};
use crate::workspace::commands::resolve_microsoft_team_connection;
use crate::workspace::enrollment::{
    load_workspace_enrollment, validate_workspace_enrollment, WorkspaceEnrollment,
};
use crate::workspace::guard::{resolve_sharepoint_site_ref, workspace_config_from_db};
use crate::workspace::identity::require_fresh_sensitive_team_authority;
use crate::workspace::migration::{
    rebuild_snapshot_from_remote_items, remote_item_record_identity,
    validate_rebuilt_snapshot_in_memory,
};
use crate::workspace::mode::WorkspaceMode;
use crate::workspace::sharepoint::{
    ParsedSharePointListItem, SharePointGraphClient, LIST_CRM_DATA, LIST_CRM_SEQUENCES,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamCacheRebuildReport {
    pub rebuilt: bool,
    pub synchronized_records: usize,
    pub reserved_id_blocks: usize,
}

fn remove_sqlite_artifacts(path: &Path) -> Result<(), String> {
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let candidate = if suffix.is_empty() {
            path.to_path_buf()
        } else {
            PathBuf::from(format!("{}{suffix}", path.display()))
        };
        if candidate.exists() {
            std::fs::remove_file(&candidate).map_err(|error| {
                format!("Suppression du cache {} impossible : {error}", candidate.display())
            })?;
        }
    }
    Ok(())
}

fn config_from_enrollment(enrollment: &WorkspaceEnrollment) -> WorkspaceConfig {
    WorkspaceConfig {
        mode: WorkspaceMode::TeamSharepoint,
        role: None,
        site_hostname: Some(enrollment.site_hostname.clone()),
        site_path: Some(enrollment.site_path.clone()),
        site_id: Some(enrollment.site_id.clone()),
        site_name: enrollment.site_name.clone(),
        office_mailbox_email: enrollment.office_mailbox_email.clone(),
        advisor_group_id: Some(enrollment.advisor_group_id.clone()),
        secretary_group_id: Some(enrollment.secretary_group_id.clone()),
    }
}

fn prepare_rebuilt_cache(
    app: &AppHandle,
    config: &WorkspaceConfig,
    use_seeded_cache: bool,
) -> Result<(PathBuf, Database, TeamCacheRebuildReport), String> {
    let connection = resolve_microsoft_team_connection(app)?
        .ok_or_else(|| "Connexion Microsoft équipe absente.".to_string())?;
    let site_ref = resolve_sharepoint_site_ref(config)?;
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
        .find_list_by_display_name_blocking(
            &connection.access_token,
            site_id,
            LIST_CRM_SEQUENCES,
        )?
        .ok_or_else(|| format!("Liste SharePoint introuvable : {LIST_CRM_SEQUENCES}"))?;
    let remote_delta = client.list_items_delta_blocking(
        &connection.access_token,
        site_id,
        &data_list.id,
        None,
    )?;
    let delta_link = remote_delta.delta_link.clone();
    let remote_items = remote_delta
        .items
        .into_iter()
        .filter(|item| !item.deleted)
        .map(|item| {
            Ok(ParsedSharePointListItem {
                id: item.id,
                etag: item
                    .etag
                    .ok_or_else(|| "Élément delta SharePoint sans ETag.".to_string())?,
                fields: item.fields,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let (mut snapshot, tombstone_count, parse_errors) =
        rebuild_snapshot_from_remote_items(&remote_items)?;
    let expected_checksum = snapshot_checksum(&snapshot);
    let validation = validate_rebuilt_snapshot_in_memory(
        &snapshot,
        &expected_checksum,
        tombstone_count,
        parse_errors,
    );
    if !validation.valid {
        return Err(format!(
            "Snapshot SharePoint invalide : {}",
            validation.errors.join(" ")
        ));
    }

    let temp_path = team_cache_temp_path(app)?;
    crate::licensing::set_workspace_write_allowed(true);
    let rebuilt_database = if use_seeded_cache {
        if !temp_path.is_file() {
            return Err("Copie temporaire du cache équipe absente.".into());
        }
        Database::open_workspace_cache_at_path(app, &temp_path)
            .map_err(|error| format!("Ouverture du cache de reconstruction : {error}"))?
    } else {
        remove_sqlite_artifacts(&temp_path)?;
        Database::create_workspace_cache_at_path(app, &temp_path, config)
            .map_err(|error| format!("Création du cache de reconstruction : {error}"))?
    };
    rebuilt_database
        .workspace_sync_reset_for_rebuild()
        .map_err(|error| format!("Réinitialisation de la synchronisation locale : {error}"))?;
    snapshot.table_counts =
        table_counts_for_snapshot_records(rebuilt_database.connection(), &snapshot.records)?;
    restore_snapshot_into_database(&rebuilt_database, &snapshot)?;
    for item in &remote_items {
        if let Some((table_name, record_key)) = remote_item_record_identity(item) {
            rebuilt_database
                .workspace_sync_upsert_remote_mapping(
                    &table_name,
                    &record_key,
                    &item.id,
                    &item.etag,
                )
                .map_err(|error| error.to_string())?;
        }
    }
    let reserved_id_blocks = reserve_and_install_id_blocks(
        &rebuilt_database,
        &client,
        &connection.access_token,
        site_id,
        &sequence_list.id,
    )?;
    rebuilt_database
        .workspace_sync_activate_capture(&delta_link)
        .map_err(|error| error.to_string())?;
    rebuilt_database
        .workspace_sync_mark_online()
        .map_err(|error| error.to_string())?;
    let report = TeamCacheRebuildReport {
        rebuilt: true,
        synchronized_records: snapshot.records.len(),
        reserved_id_blocks,
    };
    Ok((temp_path, rebuilt_database, report))
}

fn replace_active_team_cache(
    app: &AppHandle,
    guard: &mut Option<Database>,
    temp_path: &Path,
    rebuilt_database: Database,
) -> Result<Database, String> {
    drop(rebuilt_database);
    let final_path = team_cache_database_path(app)?;
    let backup_path = final_path.with_extension("db.before-rebuild");
    remove_sqlite_artifacts(&backup_path)?;
    if guard.is_some() {
        return Err("La base active a été rouverte pendant la reconstruction.".into());
    }
    std::fs::rename(&final_path, &backup_path)
        .map_err(|error| format!("Mise à l'abri de l'ancien cache impossible : {error}"))?;
    if let Err(error) = std::fs::rename(temp_path, &final_path) {
        let _ = std::fs::rename(&backup_path, &final_path);
        let restored = Database::open_workspace_cache_at_path(app, &final_path)
            .map_err(|reopen| format!("{error}. Réouverture de l'ancien cache : {reopen}"))?;
        *guard = Some(restored);
        return Err(format!("Remplacement du cache équipe impossible : {error}"));
    }
    match Database::open_workspace_cache_at_path(app, &final_path) {
        Ok(database) => {
            if let Err(error) = remove_sqlite_artifacts(&backup_path) {
                *guard = Some(database);
                return Err(format!(
                    "Cache reconstruit mais nettoyage sécurisé de l'ancien cache impossible : {error}"
                ));
            }
            let sealed_path = team_cache_sealed_path(app)?;
            if sealed_path.exists() {
                if let Err(error) = std::fs::remove_file(&sealed_path) {
                    eprintln!("⚠️ Suppression du cache scellé obsolète différée : {error}");
                }
            }
            Ok(database)
        }
        Err(error) => {
            remove_sqlite_artifacts(&final_path)?;
            std::fs::rename(&backup_path, &final_path).map_err(|rollback| {
                format!(
                    "Nouveau cache invalide ({error}) et restauration de l'ancien impossible : {rollback}"
                )
            })?;
            let restored = Database::open_workspace_cache_at_path(app, &final_path)
                .map_err(|reopen| format!("Réouverture de l'ancien cache : {reopen}"))?;
            *guard = Some(restored);
            Err(format!(
                "Le cache reconstruit est invalide, ancien cache restauré : {error}"
            ))
        }
    }
}

fn restore_active_cache_after_rebuild_failure(app: &AppHandle, db: &DbState) -> Result<(), String> {
    let mut guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    if guard.is_some() {
        return Ok(());
    }
    let final_path = team_cache_database_path(app)?;
    let database = Database::open_workspace_cache_at_path(app, &final_path)
        .map_err(|error| format!("Réouverture de l'ancien cache équipe : {error}"))?;
    *guard = Some(database);
    Ok(())
}

#[tauri::command]
pub fn rebuild_team_cache_from_sharepoint_cmd(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<TeamCacheRebuildReport, String> {
    require_ui_session(&session)?;
    let config = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        workspace_config_from_db(database)?
    };
    validate_workspace_enrollment(&app_handle, &config)?;
    let enrollment = load_workspace_enrollment(&app_handle)?
        .ok_or_else(|| "Enrôlement équipe absent.".to_string())?;
    if !enrollment.sync_activated {
        return Err("La reconstruction requiert un cache équipe déjà activé.".into());
    }
    let authority = require_fresh_sensitive_team_authority(&app_handle, &config)?;
    if !authority.capabilities.can_manage_members {
        return Err("Seul le conseiller peut reconstruire le cache équipe.".into());
    }
    let temp_path = team_cache_temp_path(&app_handle)?;
    {
        let mut guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let source_database = guard.as_ref().ok_or("Base non initialisée")?;
        let pending = source_database
            .workspace_sync_list_pending()
            .map_err(|error| error.to_string())?
            .len()
            + source_database
                .workspace_blob_pending_count()
                .map_err(|error| error.to_string())?;
        let conflicts = source_database
            .workspace_sync_open_conflict_count()
            .map_err(|error| error.to_string())?;
        if pending > 0 || conflicts > 0 {
            return Err(
                "Résolvez et synchronisez toutes les modifications locales avant de reconstruire le cache."
                    .into(),
            );
        }
        remove_sqlite_artifacts(&temp_path)?;
        source_database
            .backup_to_path(&temp_path)
            .map_err(|error| format!("Copie du cache avant reconstruction : {error}"))?;
        let previous = guard
            .take()
            .ok_or_else(|| "Base active absente pendant la reconstruction.".to_string())?;
        drop(previous);
    }
    let prepared = prepare_rebuilt_cache(&app_handle, &config, true);
    let (temp_path, rebuilt_database, report) = match prepared {
        Ok(result) => result,
        Err(error) => {
            let _ = remove_sqlite_artifacts(&temp_path);
            restore_active_cache_after_rebuild_failure(&app_handle, db.inner())
                .map_err(|restore| format!("{error} Réouverture impossible : {restore}"))?;
            return Err(error);
        }
    };
    let mut guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let active_database =
        match replace_active_team_cache(&app_handle, &mut guard, &temp_path, rebuilt_database) {
            Ok(database) => database,
            Err(error) => {
                drop(guard);
                restore_active_cache_after_rebuild_failure(&app_handle, db.inner())
                    .map_err(|restore| format!("{error} Réouverture impossible : {restore}"))?;
                return Err(error);
            }
        };
    *guard = Some(active_database);
    Ok(report)
}

pub fn recover_missing_team_cache(
    app: &AppHandle,
) -> Result<TeamCacheRebuildReport, String> {
    let enrollment = load_workspace_enrollment(app)?
        .ok_or_else(|| "Aucun enrôlement équipe à restaurer.".to_string())?;
    if !enrollment.sync_activated {
        return Err("La synchronisation équipe n'est pas activée sur ce poste.".into());
    }
    let final_path = team_cache_database_path(app)?;
    let sealed_path = team_cache_sealed_path(app)?;
    if final_path.exists() || sealed_path.exists() {
        save_workspace_cache_manifest(app, &enrollment.workspace_id)?;
        crate::workspace::cache_seal::unseal_team_cache_if_needed(app)?;
        let database = Database::open_workspace_cache_at_path(app, &final_path)
            .map_err(|error| format!("Validation du cache local existant : {error}"))?;
        crate::workspace::cache_seal::seal_team_cache_database(app, database)?;
        return Ok(TeamCacheRebuildReport {
            rebuilt: false,
            synchronized_records: 0,
            reserved_id_blocks: 0,
        });
    }
    let mut config = config_from_enrollment(&enrollment);
    let authority = require_fresh_sensitive_team_authority(app, &config)?;
    config.role = Some(authority.role);
    let (temp_path, rebuilt_database, report) = prepare_rebuilt_cache(app, &config, false)?;
    drop(rebuilt_database);
    let activation = (|| {
        std::fs::rename(&temp_path, &final_path)
            .map_err(|error| format!("Activation du cache reconstruit impossible : {error}"))?;
        save_workspace_cache_manifest(app, &enrollment.workspace_id)?;
        let database = Database::open_workspace_cache_at_path(app, &final_path)
            .map_err(|error| format!("Validation du cache reconstruit : {error}"))?;
        crate::workspace::cache_seal::seal_team_cache_database(app, database)?;
        Ok::<(), String>(())
    })();
    if let Err(error) = activation {
        let _ = remove_sqlite_artifacts(&temp_path);
        let _ = remove_sqlite_artifacts(&final_path);
        let _ = std::fs::remove_file(&sealed_path);
        return Err(error);
    }
    Ok(report)
}
