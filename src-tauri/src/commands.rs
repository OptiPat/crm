use tauri::State;
use std::sync::Mutex;
use crate::database::{Database, models::{Contact, NewContact, Foyer, NewFoyer, Partenaire, NewPartenaire, Document, NewDocument, TemplateEmail, NewTemplateEmail, Alerte, NewAlerte, DashboardStats, CategoryStats, MonthlyStats, ProductStats, PipelineStats, AlerteWithContact, Investissement, NewInvestissement, InvestissementWithDetails}};

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
pub fn delete_all_contacts(db: State<'_, DbState>) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_all_contacts()
        .map_err(|e| format!("Failed to delete all contacts: {}", e))
}

#[tauri::command]
pub fn update_contact(db: State<'_, DbState>, id: i64, contact: NewContact) -> Result<Contact, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_contact(id, &contact)
        .map_err(|e| format!("Failed to update contact: {}", e))
}

#[tauri::command]
pub fn find_contact_by_email(db: State<'_, DbState>, email: String) -> Result<Option<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.find_contact_by_email(&email)
        .map_err(|e| format!("Failed to find contact by email: {}", e))
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

// ========== DASHBOARD ==========

#[tauri::command]
pub fn get_dashboard_stats(db: State<'_, DbState>) -> Result<DashboardStats, String> {
    println!("🔍 [DEBUG] get_dashboard_stats called");
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    match database.get_dashboard_stats() {
        Ok(stats) => {
            println!("✅ [DEBUG] get_dashboard_stats success: clients={}, prospects={}, suspects={}, alertes={}", 
                stats.total_clients, stats.total_prospects, stats.total_suspects, stats.alertes_non_traitees);
            Ok(stats)
        },
        Err(e) => {
            println!("❌ [ERROR] get_dashboard_stats failed: {}", e);
            Err(format!("Failed to get dashboard stats: {}", e))
        }
    }
}

#[tauri::command]
pub fn get_category_stats(db: State<'_, DbState>) -> Result<CategoryStats, String> {
    println!("🔍 [DEBUG] get_category_stats called");
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    match database.get_category_stats() {
        Ok(stats) => {
            println!("✅ [DEBUG] get_category_stats success: clients={}, prospect_client={}, prospect_filleul={}, suspect_client={}, suspect_filleul={}", 
                stats.clients, stats.prospect_client, stats.prospect_filleul, stats.suspect_client, stats.suspect_filleul);
            Ok(stats)
        },
        Err(e) => {
            println!("❌ [ERROR] get_category_stats failed: {}", e);
            Err(format!("Failed to get category stats: {}", e))
        }
    }
}

#[tauri::command]
pub fn get_monthly_stats(db: State<'_, DbState>) -> Result<Vec<MonthlyStats>, String> {
    println!("🔍 [DEBUG] get_monthly_stats called");
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    match database.get_monthly_stats() {
        Ok(stats) => {
            println!("✅ [DEBUG] get_monthly_stats success: {} months returned", stats.len());
            Ok(stats)
        },
        Err(e) => {
            println!("❌ [ERROR] get_monthly_stats failed: {}", e);
            Err(format!("Failed to get monthly stats: {}", e))
        }
    }
}

#[tauri::command]
pub fn get_product_stats(db: State<'_, DbState>) -> Result<Vec<ProductStats>, String> {
    println!("🔍 [DEBUG] get_product_stats called");
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    match database.get_product_stats() {
        Ok(stats) => {
            println!("✅ [DEBUG] get_product_stats success: {} products returned", stats.len());
            Ok(stats)
        },
        Err(e) => {
            println!("❌ [ERROR] get_product_stats failed: {}", e);
            Err(format!("Failed to get product stats: {}", e))
        }
    }
}

#[tauri::command]
pub fn get_pipeline_stats(db: State<'_, DbState>) -> Result<PipelineStats, String> {
    println!("🔍 [DEBUG] get_pipeline_stats called");
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    match database.get_pipeline_stats() {
        Ok(stats) => {
            println!("✅ [DEBUG] get_pipeline_stats success: suspects={}, prospects={}, clients={}", 
                stats.suspects, stats.prospects, stats.clients);
            Ok(stats)
        },
        Err(e) => {
            println!("❌ [ERROR] get_pipeline_stats failed: {}", e);
            Err(format!("Failed to get pipeline stats: {}", e))
        }
    }
}

#[tauri::command]
pub fn get_alertes_with_contacts(db: State<'_, DbState>, limit: i64) -> Result<Vec<AlerteWithContact>, String> {
    println!("🔍 [DEBUG] get_alertes_with_contacts called (limit: {})", limit);
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    match database.get_alertes_with_contacts(limit) {
        Ok(alertes) => {
            println!("✅ [DEBUG] get_alertes_with_contacts success: {} alertes returned", alertes.len());
            Ok(alertes)
        },
        Err(e) => {
            println!("❌ [ERROR] get_alertes_with_contacts failed: {}", e);
            Err(format!("Failed to get alertes with contacts: {}", e))
        }
    }
}

// ========== INVESTISSEMENTS ==========

#[tauri::command]
pub fn get_all_investissements(db: State<'_, DbState>) -> Result<Vec<Investissement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_investissements()
        .map_err(|e| format!("Failed to get investissements: {}", e))
}

#[tauri::command]
pub fn get_investissements_by_contact(db: State<'_, DbState>, contact_id: i64) -> Result<Vec<Investissement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_investissements_by_contact(contact_id)
        .map_err(|e| format!("Failed to get investissements by contact: {}", e))
}

#[tauri::command]
pub fn get_investissements_by_foyer(db: State<'_, DbState>, foyer_id: i64) -> Result<Vec<Investissement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_investissements_by_foyer(foyer_id)
        .map_err(|e| format!("Failed to get investissements by foyer: {}", e))
}

#[tauri::command]
pub fn get_investissements_with_details(db: State<'_, DbState>) -> Result<Vec<InvestissementWithDetails>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_investissements_with_details()
        .map_err(|e| format!("Failed to get investissements with details: {}", e))
}

#[tauri::command]
pub fn create_investissement(db: State<'_, DbState>, new_investissement: NewInvestissement) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_investissement(new_investissement)
        .map_err(|e| format!("Failed to create investissement: {}", e))
}

#[tauri::command]
pub fn get_investissement_by_id(db: State<'_, DbState>, id: i64) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_investissement_by_id(id)
        .map_err(|e| format!("Failed to get investissement: {}", e))
}

#[tauri::command]
pub fn update_investissement(db: State<'_, DbState>, id: i64, investissement: NewInvestissement) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_investissement(id, &investissement)
        .map_err(|e| format!("Failed to update investissement: {}", e))
}

#[tauri::command]
pub fn delete_investissement(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_investissement(id)
        .map_err(|e| format!("Failed to delete investissement: {}", e))
}

#[tauri::command]
pub fn check_and_create_demembrement_alerts(db: State<'_, DbState>) -> Result<Vec<Alerte>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.check_and_create_demembrement_alerts()
        .map_err(|e| format!("Failed to check demembrement alerts: {}", e))
}

// ========== PDF ==========

#[tauri::command]
pub fn read_pdf_file(file_path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    
    println!("🔍 Reading PDF file: {}", file_path);
    
    // Lire le fichier
    let bytes = fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    println!("✅ File read successfully: {} bytes", bytes.len());
    
    Ok(bytes)
}