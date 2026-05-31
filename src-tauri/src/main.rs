// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod backup;
mod commands;
mod contact_name;
mod database;
mod email;
mod system_commands;

use auth::commands::*;
use auth::AuthManager;
use commands::*;
use database::Database;
use email::commands::*;
use email::oauth_commands::*;
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

            // Récupérer la clé de chiffrement si elle existe
            let encryption_key = if !auth.is_first_launch() {
                match auth.get_db_encryption_key() {
                    Ok(key) => Some(key),
                    Err(e) => {
                        eprintln!("Warning: Failed to get encryption key: {}", e);
                        None
                    }
                }
            } else {
                None
            };

            app.manage(Mutex::new(Some(auth)));

            // Initialiser la base de données avec la clé de chiffrement
            let db = if let Some(key) = encryption_key {
                Database::new_with_key(&app.handle(), Some(&key))
                    .expect("Failed to initialize encrypted database")
            } else {
                Database::new(&app.handle()).expect("Failed to initialize database")
            };

            app.manage(Mutex::new(Some(db)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_all_contacts,
            create_contact,
            get_contact_by_id,
            delete_contact,
            delete_all_contacts,
            cleanup_orphaned_data,
            update_contact,
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
            create_partenaire,
            get_partenaire_by_id,
            update_partenaire,
            delete_partenaire,
            get_all_documents,
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
            get_all_alertes,
            get_alertes_non_traitees,
            create_alerte,
            marquer_alerte_lue,
            marquer_alerte_traitee,
            delete_alerte,
            generer_alertes_automatiques,
            get_dashboard_stats,
            get_category_stats,
            get_monthly_stats,
            get_product_stats,
            get_pipeline_stats,
            get_alertes_with_contacts,
            get_all_investissements,
            get_investissements_by_contact,
            get_investissements_by_foyer,
            get_investissements_with_details,
            create_investissement,
            get_investissement_by_id,
            update_investissement,
            delete_investissement,
            check_and_create_demembrement_alerts,
            read_pdf_file,
            // Etiquettes
            get_all_etiquettes,
            get_all_etiquettes_with_count,
            get_etiquette_by_id,
            create_etiquette,
            update_etiquette,
            delete_etiquette,
            get_etiquettes_by_contact,
            get_all_contact_etiquettes_details,
            attribuer_etiquette,
            retirer_etiquette,
            get_contacts_by_etiquette,
            seed_default_etiquettes,
            check_and_apply_auto_etiquettes,
            get_pending_etiquette_emails,
            get_etiquette_email_queue,
            mark_etiquette_email_sent,
            sync_email_campaign_responses,
            mark_email_campaign_response,
            dismiss_email_campaign_followup,
            prepare_email_campaign_relance,
            // Settings
            get_setting,
            set_setting,
            delete_setting,
            get_all_settings,
            get_cgp_config,
            save_cgp_config,
            is_wizard_completed,
            complete_wizard,
            update_wizard_step,
            // Auth
            is_first_launch,
            create_master_password,
            verify_master_password,
            get_recovery_key,
            get_smtp_config,
            save_smtp_config,
            delete_smtp_config,
            test_smtp_connection,
            send_email,
            get_email_connection_status,
            get_oauth_app_settings,
            save_oauth_app_settings,
            connect_email_oauth,
            disconnect_email_oauth,
            test_email_connection,
            fetch_gmail_signature_for_cgp,
            get_app_info,
            list_db_backups,
            get_all_interactions_with_contacts,
            get_exchange_history_timeline,
            get_interactions_by_contact,
            get_contact_relation_status,
            create_interaction,
            update_interaction,
            delete_interaction
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
