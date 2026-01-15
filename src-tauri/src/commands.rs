use tauri::State;
use std::sync::Mutex;
use crate::database::{Database, models::{Contact, NewContact, Foyer, NewFoyer, Partenaire, NewPartenaire, Document, NewDocument, TemplateEmail, NewTemplateEmail, Alerte, NewAlerte}};

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

// ========== TEMPLATES EMAIL ==========

#[tauri::command]
pub fn get_all_templates_email(db: State<'_, DbState>) -> Result<Vec<TemplateEmail>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_templates_email()
        .map_err(|e| format!("Failed to get templates: {}", e))
}

#[tauri::command]
pub fn create_template_email(db: State<'_, DbState>, new_template: NewTemplateEmail) -> Result<TemplateEmail, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_template_email(new_template)
        .map_err(|e| format!("Failed to create template: {}", e))
}

#[tauri::command]
pub fn get_template_email_by_id(db: State<'_, DbState>, id: i64) -> Result<TemplateEmail, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_template_email_by_id(id)
        .map_err(|e| format!("Failed to get template: {}", e))
}

#[tauri::command]
pub fn update_template_email(db: State<'_, DbState>, id: i64, template: NewTemplateEmail) -> Result<TemplateEmail, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_template_email(id, &template)
        .map_err(|e| format!("Failed to update template: {}", e))
}

#[tauri::command]
pub fn delete_template_email(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_template_email(id)
        .map_err(|e| format!("Failed to delete template: {}", e))
}

// ========== ALERTES ==========

#[tauri::command]
pub fn get_all_alertes(db: State<'_, DbState>) -> Result<Vec<Alerte>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_alertes()
        .map_err(|e| format!("Failed to get alertes: {}", e))
}

#[tauri::command]
pub fn get_alertes_non_traitees(db: State<'_, DbState>) -> Result<Vec<Alerte>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_alertes_non_traitees()
        .map_err(|e| format!("Failed to get alertes: {}", e))
}

#[tauri::command]
pub fn create_alerte(db: State<'_, DbState>, new_alerte: NewAlerte) -> Result<Alerte, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_alerte(new_alerte)
        .map_err(|e| format!("Failed to create alerte: {}", e))
}

#[tauri::command]
pub fn marquer_alerte_lue(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.marquer_alerte_lue(id)
        .map_err(|e| format!("Failed to mark alerte as read: {}", e))
}

#[tauri::command]
pub fn marquer_alerte_traitee(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.marquer_alerte_traitee(id)
        .map_err(|e| format!("Failed to mark alerte as treated: {}", e))
}

#[tauri::command]
pub fn delete_alerte(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_alerte(id)
        .map_err(|e| format!("Failed to delete alerte: {}", e))
}

#[tauri::command]
pub fn generer_alertes_automatiques(db: State<'_, DbState>) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.generer_alertes_automatiques()
        .map_err(|e| format!("Failed to generate alertes: {}", e))
}
