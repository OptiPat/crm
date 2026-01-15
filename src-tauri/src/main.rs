// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod commands;
mod auth;

use std::sync::Mutex;
use tauri::Manager;
use database::Database;
use auth::AuthManager;
use commands::*;
use auth::commands::*;

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
            
            app.manage(Mutex::new(Some(auth)));
            
            // Initialiser la base de données
            let db = Database::new(&app.handle())
                .expect("Failed to initialize database");
            
            app.manage(Mutex::new(Some(db)));
            
            Ok(())
        })
                    .invoke_handler(tauri::generate_handler![
                        greet,
                        get_all_contacts,
                        create_contact,
                        get_contact_by_id,
                        delete_contact,
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
                        is_first_launch,
                        create_master_password,
                        verify_master_password,
                        get_recovery_key
                    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
