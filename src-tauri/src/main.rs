// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_branding;
mod auth;
mod birthday_notifications;
mod backup;
mod backup_sidecar;
mod commands;
mod compta;
mod documents_storage;
mod contact_name;
mod database;
mod email;
mod export_archive;
mod licensing;
mod local_api;
mod notes;
mod newsletter;
mod scpi_bulletin;
mod system_commands;

use app_branding::commands::{apply_app_branding_os, get_app_branding, save_app_branding};
use auth::commands::*;
use auth::AuthManager;
use commands::*;
use compta::commands::{
    compute_compta_driving_distance_km, browse_compta_drive, download_compta_drive_file, import_compta_calendar_trip,
    import_compta_drive_depense, reset_compta_distance_cache, scan_compta_calendar_month,
    scan_compta_drive_month,
};
use database::Database;
use email::commands::*;
use email::oauth_commands::*;
use birthday_notifications::{
    generate_birthday_message_draft_cmd, get_birthday_builtin_bodies_cmd, get_birthday_message_settings_cmd, get_birthday_telegram_settings_cmd, list_birthdays_today_cmd,
    run_birthday_telegram_if_due_cmd, save_birthday_message_settings_cmd, save_birthday_telegram_settings_cmd,
    send_birthday_telegram_reminders_now_cmd, test_birthday_telegram_cmd,
};
use licensing::{
    activate_license_cmd, get_license_status_cmd, needs_license_activation_cmd,
    start_license_trial_cmd,
};
use notes::{
    add_shared_note_contribution_cmd, create_personal_note_cmd, create_shared_note_cmd,
    delete_personal_note_cmd, delete_shared_note_cmd, get_all_personal_notes_cmd,
    get_shared_notes_cmd, sync_shared_notes_cmd, update_personal_note_cmd,
    update_shared_note_cmd,
};
use local_api::{
    get_local_api_settings_cmd, get_scpi_campaign_dashboard_cmd, regenerate_local_api_token_cmd,
    save_local_api_settings_cmd,
};
use scpi_bulletin::prepare_scpi_bulletins_from_pdfs_cmd;
use newsletter::*;
use std::sync::Mutex;
use system_commands::*;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Bonjour, {}! Bienvenue dans CRM W.Y.S.", name)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Initialiser l'authentification
            let auth = AuthManager::new(&app.handle()).expect("Failed to initialize auth");
            app.manage(Mutex::new(Some(auth)));

            // La base reste FERMÉE tant que l'utilisateur n'a pas saisi son mot de passe
            // (simple verrou d'accès). Elle est ouverte par les commandes
            // `create_master_password` / `unlock`.
            app.manage(Mutex::new(Option::<Database>::None));

            email::legacy_cleanup::remove_legacy_smtp_config(&app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_all_contacts,
            get_contacts_by_foyer,
            create_contact,
            create_contacts_bulk,
            get_contact_by_id,
            delete_contact,
            delete_all_contacts,
            cleanup_orphaned_data,
            update_contact,
            update_contact_fiscal,
            find_contact_by_email,
            get_filleuls_by_parrain,
            find_contact_by_name,
            begin_import_transaction,
            commit_import_transaction,
            rollback_import_transaction,
            get_clients_by_prescripteur,
            get_all_familles,
            create_famille,
            get_famille_by_id,
            update_famille,
            delete_famille,
            get_or_create_famille,
            get_all_foyers,
            create_foyer,
            get_foyer_by_id,
            update_foyer,
            delete_foyer,
            get_all_partenaires,
            list_pipes,
            get_pipe_by_id,
            create_pipe,
            update_pipe,
            delete_pipe,
            set_pipe_stage,
            list_pipe_timeline_entries,
            get_pipe_timeline_entry,
            create_pipe_timeline_entry,
            delete_pipe_timeline_entry,
            update_pipe_timeline_milestone_notes,
            update_pipe_timeline_entry,
            create_partenaire,
            get_partenaire_by_id,
            update_partenaire,
            delete_partenaire,
            get_all_taches,
            get_taches_by_contact,
            create_tache,
            update_tache,
            set_tache_statut,
            delete_tache,
            get_all_documents,
            get_documents_by_contact,
            create_document,
            get_document_by_id,
            update_document,
            delete_document,
            get_all_templates_email,
            create_template_email,
            get_template_email_by_id,
            update_template_email,
            set_template_etiquette_links,
            get_etiquette_ids_for_template,
            delete_template_email,
            seed_default_email_templates,
            preview_ephemeral_campaign_audience,
            sync_ephemeral_campaign_queue,
            archive_ephemeral_campaign,
            get_all_alertes,
            get_alertes_non_traitees,
            get_app_notifications_summary,
            create_alerte,
            marquer_alerte_lue,
            marquer_alerte_traitee,
            delete_alerte,
            snooze_alerte,
            count_alertes_traitees_depuis,
            generer_alertes_automatiques,
            get_dashboard_stats,
            get_category_stats,
            get_monthly_stats,
            get_yearly_activity_stats,
            get_activity_period_summary,
            get_product_stats,
            get_pipeline_stats,
            get_conversion_client_stats,
            get_conversion_filleul_stats,
            get_activity_bucket_contacts,
            get_conversion_client_contacts,
            get_conversion_filleul_contacts,
            get_alertes_with_contacts,
            get_all_investissements,
            get_nom_produit_suggestions,
            get_investissements_by_contact,
            get_investissements_by_foyer,
            get_investissements_by_foyer_contacts,
            get_investissements_with_details,
            create_investissement,
            get_investissement_by_id,
            update_investissement,
            delete_investissement,
            close_investissement,
            reopen_investissement,
            get_valorisations_by_investissement,
            create_investissement_valorisation,
            prepare_stellium_perf_campaign,
            get_stellium_perf_campaign_dashboard_cmd,
            ensure_stellium_perf_email_templates,
            discover_stellium_perf_campaign_prepare_input,
            delete_investissement_valorisation,
            get_versements_by_investissement,
            create_investissement_versement,
            delete_investissement_versement,
            check_and_create_demembrement_alerts,
            read_pdf_file,
            // Etiquettes
            get_all_etiquettes,
            get_all_etiquettes_with_count,
            get_etiquette_by_id,
            create_etiquette,
            update_etiquette,
            delete_etiquette,
            get_etiquette_action,
            set_etiquette_action,
            get_etiquettes_by_contact,
            get_all_contact_etiquettes_details,
            attribuer_etiquette,
            attribuer_etiquette_bulk,
            retirer_etiquette,
            exclude_contact_auto_etiquette,
            clear_auto_etiquette_exclusion,
            get_auto_etiquette_exclusion_ids,
            get_contacts_by_etiquette,
            seed_default_etiquettes,
            check_and_apply_auto_etiquettes,
            get_all_segments,
            get_all_segments_with_count,
            create_segment,
            update_segment,
            delete_segment,
            evaluate_segment_for_contact,
            get_contacts_matching_segment,
            get_contacts_matching_rule_json,
            preview_segment_rule_count,
            get_contact_auto_etiquette_log,
            get_pending_etiquette_emails,
            get_etiquette_email_queue,
            get_envois_snapshot,
            mark_etiquette_email_sent,
            log_email_send_error,
            get_email_send_log,
            set_etiquette_pipeline_actif,
            get_etiquette_pipeline_board,
            set_contact_pipeline_status,
            create_calendar_rdv,
            update_calendar_rdv,
            cancel_calendar_rdv,
            sync_calendar_rdv,
            get_calendar_events_today,
            list_google_calendar_week,
            sync_pipe_google_rdvs,
            resolve_pipe_rdv_google_event_id,
            mark_pipe_rdv_calendar_cancelled,
            mark_calendar_rdv_effectue,
            sync_email_campaign_responses,
            mark_email_campaign_response,
            mark_email_campaign_messaging_relance,
            dismiss_email_campaign_followup,
            cancel_pending_email_campaign,
            restore_pending_email_campaign,
            dismiss_cancelled_pending_email_campaign,
            prepare_email_campaign_relance,
            count_misplaced_sent_campaigns,
            repair_misplaced_sent_campaigns,
            scan_stellium_exceltis_emails,
            get_stellium_exceltis_signals,
            dismiss_stellium_exceltis_signal,
            reset_stellium_exceltis_dismissed,
            // Settings
            get_setting,
            set_setting,
            delete_setting,
            get_all_settings,
            get_local_api_settings_cmd,
            save_local_api_settings_cmd,
            regenerate_local_api_token_cmd,
            get_birthday_telegram_settings_cmd,
            save_birthday_telegram_settings_cmd,
            list_birthdays_today_cmd,
            generate_birthday_message_draft_cmd,
            get_birthday_message_settings_cmd,
            get_birthday_builtin_bodies_cmd,
            save_birthday_message_settings_cmd,
            run_birthday_telegram_if_due_cmd,
            send_birthday_telegram_reminders_now_cmd,
            test_birthday_telegram_cmd,
            get_scpi_campaign_dashboard_cmd,
            prepare_scpi_bulletins_from_pdfs_cmd,
            get_cgp_config,
            save_cgp_config,
            is_wizard_completed,
            complete_wizard,
            update_wizard_step,
            // App branding (hors base — visible avant déverrouillage)
            get_app_branding,
            save_app_branding,
            apply_app_branding_os,
            // Auth
            is_first_launch,
            is_database_unlocked,
            create_master_password,
            verify_master_password,
            unlock,
            lock,
            change_master_password,
            get_license_status_cmd,
            needs_license_activation_cmd,
            start_license_trial_cmd,
            activate_license_cmd,
            get_all_personal_notes_cmd,
            create_personal_note_cmd,
            update_personal_note_cmd,
            delete_personal_note_cmd,
            get_shared_notes_cmd,
            sync_shared_notes_cmd,
            create_shared_note_cmd,
            update_shared_note_cmd,
            delete_shared_note_cmd,
            add_shared_note_contribution_cmd,
            send_email,
            get_email_connection_status,
            get_oauth_app_settings,
            save_oauth_app_settings,
            connect_email_oauth,
            disconnect_email_oauth,
            connect_google_calendar_oauth,
            disconnect_google_calendar_oauth_cmd,
            test_email_connection,
            fetch_gmail_signature_for_cgp,
            get_app_info,
            list_db_backups,
            create_manual_db_backup,
            restore_db_backup,
            export_full_archive,
            open_document_file,
            open_gmail_message,
            open_external_url,
            get_all_interactions_with_contacts,
            get_exchange_history_timeline,
            get_exchange_history_timeline_for_contact,
            get_interactions_by_contact,
            get_contact_relation_status,
            create_interaction,
            update_interaction,
            delete_interaction,
            sync_contact_gmail_messages,
            email::google_contacts::sync_contact_google_cmd,
            email::google_contacts::sync_all_contacts_google_cmd,
            email::google_contacts::list_google_contact_name_proposals_cmd,
            email::google_contacts::apply_google_contact_name_proposal_cmd,
            email::google_contacts::dismiss_google_contact_name_proposal_cmd,
            get_contact_gmail_messages,
            fetch_contact_gmail_message_body,
            open_contact_mail_attachment,
            get_contact_mail_sync_state,
            get_newsletter_settings,
            save_newsletter_settings,
            generate_newsletter_content,
            refine_newsletter_content,
            ensure_newsletter_etiquette,
            activate_newsletter_campaign,
            get_newsletter_audience_members,
            get_newsletter_audience_preview,
            get_newsletter_unsubscribed,
            prepare_newsletter_edition,
            cancel_newsletter_preparation,
            get_newsletter_send_queue,
            count_newsletter_send_ready,
            list_newsletter_editions,
            get_newsletter_edition_detail,
            get_last_newsletter_edition_duplicate,
            start_newsletter_edition_send,
            record_newsletter_edition_send,
            finish_newsletter_edition_send,
            // Champs personnalisés
            get_custom_field_defs,
            create_custom_field_def,
            update_custom_field_def,
            delete_custom_field_def,
            get_contact_custom_fields,
            set_contact_custom_fields,
            get_all_contact_custom_values,
            // Comptabilité
            get_compta_config,
            save_compta_config,
            get_compta_depenses,
            create_compta_depense,
            update_compta_depense,
            delete_compta_depense,
            get_compta_encaissements,
            create_compta_encaissement,
            update_compta_encaissement,
            delete_compta_encaissement,
            get_compta_deplacements,
            create_compta_deplacement,
            update_compta_deplacement,
            delete_compta_deplacement,
            get_compta_bilan_data,
            get_compta_closed_months,
            set_compta_month_closed,
            is_compta_month_closed,
            scan_compta_drive_month,
            browse_compta_drive,
            download_compta_drive_file,
            scan_compta_calendar_month,
            import_compta_drive_depense,
            import_compta_calendar_trip,
            compute_compta_driving_distance_km,
            reset_compta_distance_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
