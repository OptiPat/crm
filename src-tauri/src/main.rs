// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod commands;
mod auth;
mod email;

use std::sync::Mutex;
use tauri::Manager;
use database::Database;
use auth::AuthManager;
use commands::*;
use auth::commands::*;
use email::commands::*;

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Bonjour, {}! Bienvenue dans Patrimoine CRM.", name)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Initialiser l'authentification
            let auth = AuthManager::new(&app.handle())
                .expect("Failed to initialize auth");
            
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
                Database::new(&app.handle())
                    .expect("Failed to initialize database")
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
                        update_contact,
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
                        delete_template_email,
                        get_all_alertes,
                        get_alertes_non_traitees,
                        create_alerte,
                        marquer_alerte_lue,
                        marquer_alerte_traitee,
                        delete_alerte,
                        generer_alertes_automatiques,
                        get_dashboard_stats,
                        is_first_launch,
                        create_master_password,
                        verify_master_password,
                        get_recovery_key,
                        get_smtp_config,
                        save_smtp_config,
                        delete_smtp_config,
                        test_smtp_connection,
                        send_email
                    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
