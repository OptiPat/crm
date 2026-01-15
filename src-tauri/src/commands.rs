use tauri::State;
use std::sync::Mutex;
use crate::database::{Database, models::{Contact, NewContact, Foyer, NewFoyer, Partenaire, NewPartenaire, Document, NewDocument}};

pub type DbState = Mutex<Option<Database>>;

#[tauri::command]
pub fn get_all_contacts(db: State<'_, DbState>) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_contacts()
        .map_err(|e| format!("Failed to get contacts: {}", e))
}

#[tauri::command]
pub fn create_contact(db: State<'_, DbState>, new_contact: NewContact) -> Result<Contact, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_contact(new_contact)
        .map_err(|e| format!("Failed to create contact: {}", e))
}

#[tauri::command]
pub fn get_contact_by_id(db: State<'_, DbState>, id: i64) -> Result<Contact, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_contact_by_id(id)
        .map_err(|e| format!("Failed to get contact: {}", e))
}

#[tauri::command]
pub fn delete_contact(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_contact(id)
        .map_err(|e| format!("Failed to delete contact: {}", e))
}

#[tauri::command]
pub fn update_contact(db: State<'_, DbState>, id: i64, contact: NewContact) -> Result<Contact, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_contact(id, &contact)
        .map_err(|e| format!("Failed to update contact: {}", e))
}

// ========== FOYERS ==========

#[tauri::command]
pub fn get_all_foyers(db: State<'_, DbState>) -> Result<Vec<Foyer>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_foyers()
        .map_err(|e| format!("Failed to get foyers: {}", e))
}

#[tauri::command]
pub fn create_foyer(db: State<'_, DbState>, new_foyer: NewFoyer) -> Result<Foyer, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_foyer(new_foyer)
        .map_err(|e| format!("Failed to create foyer: {}", e))
}

#[tauri::command]
pub fn get_foyer_by_id(db: State<'_, DbState>, id: i64) -> Result<Foyer, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_foyer_by_id(id)
        .map_err(|e| format!("Failed to get foyer: {}", e))
}

#[tauri::command]
pub fn update_foyer(db: State<'_, DbState>, id: i64, foyer: NewFoyer) -> Result<Foyer, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_foyer(id, &foyer)
        .map_err(|e| format!("Failed to update foyer: {}", e))
}

#[tauri::command]
pub fn delete_foyer(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_foyer(id)
        .map_err(|e| format!("Failed to delete foyer: {}", e))
}

// ========== PARTENAIRES ==========

#[tauri::command]
pub fn get_all_partenaires(db: State<'_, DbState>) -> Result<Vec<Partenaire>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_partenaires()
        .map_err(|e| format!("Failed to get partenaires: {}", e))
}

#[tauri::command]
pub fn create_partenaire(db: State<'_, DbState>, new_partenaire: NewPartenaire) -> Result<Partenaire, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_partenaire(new_partenaire)
        .map_err(|e| format!("Failed to create partenaire: {}", e))
}

#[tauri::command]
pub fn get_partenaire_by_id(db: State<'_, DbState>, id: i64) -> Result<Partenaire, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_partenaire_by_id(id)
        .map_err(|e| format!("Failed to get partenaire: {}", e))
}

#[tauri::command]
pub fn update_partenaire(db: State<'_, DbState>, id: i64, partenaire: NewPartenaire) -> Result<Partenaire, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_partenaire(id, &partenaire)
        .map_err(|e| format!("Failed to update partenaire: {}", e))
}

#[tauri::command]
pub fn delete_partenaire(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_partenaire(id)
        .map_err(|e| format!("Failed to delete partenaire: {}", e))
}

// ========== DOCUMENTS ==========

#[tauri::command]
pub fn get_all_documents(db: State<'_, DbState>) -> Result<Vec<Document>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_documents()
        .map_err(|e| format!("Failed to get documents: {}", e))
}

#[tauri::command]
pub fn create_document(db: State<'_, DbState>, new_document: NewDocument) -> Result<Document, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_document(new_document)
        .map_err(|e| format!("Failed to create document: {}", e))
}

#[tauri::command]
pub fn get_document_by_id(db: State<'_, DbState>, id: i64) -> Result<Document, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_document_by_id(id)
        .map_err(|e| format!("Failed to get document: {}", e))
}

#[tauri::command]
pub fn update_document(db: State<'_, DbState>, id: i64, document: NewDocument) -> Result<Document, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_document(id, &document)
        .map_err(|e| format!("Failed to update document: {}", e))
}

#[tauri::command]
pub fn delete_document(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_document(id)
        .map_err(|e| format!("Failed to delete document: {}", e))
}
