use tauri::State;
use std::sync::Mutex;
use crate::database::{Database, models::{Contact, NewContact, Famille, NewFamille, Foyer, NewFoyer, Partenaire, NewPartenaire, Document, NewDocument, TemplateEmail, NewTemplateEmail, Alerte, NewAlerte, DashboardStats, CategoryStats, MonthlyStats, ProductStats, PipelineStats, AlerteWithContact, Investissement, NewInvestissement, InvestissementWithDetails, Etiquette, NewEtiquette, ContactEtiquette, EtiquetteWithCount, ContactEtiquetteDetails}};

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
pub fn cleanup_orphaned_data(db: State<'_, DbState>) -> Result<(usize, usize), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.cleanup_all_orphaned_data()
        .map_err(|e| format!("Failed to cleanup orphaned data: {}", e))
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

// ========== FILLEULS ==========

#[tauri::command]
pub fn get_filleuls_by_parrain(db: State<'_, DbState>, parrain_id: i64) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_filleuls_by_parrain(parrain_id)
        .map_err(|e| format!("Failed to get filleuls: {}", e))
}

#[tauri::command]
pub fn find_contact_by_name(db: State<'_, DbState>, nom: String, prenom: String) -> Result<Option<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.find_contact_by_name(&nom, &prenom)
        .map_err(|e| format!("Failed to find contact by name: {}", e))
}

#[tauri::command]
pub fn get_clients_by_prescripteur(db: State<'_, DbState>, prescripteur_id: i64) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_clients_by_prescripteur(prescripteur_id)
        .map_err(|e| format!("Failed to get clients by prescripteur: {}", e))
}

// ========== FOYERS ==========

// ========== FAMILLES ==========

#[tauri::command]
pub fn get_all_familles(db: State<'_, DbState>) -> Result<Vec<Famille>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_familles()
        .map_err(|e| format!("Failed to get familles: {}", e))
}

#[tauri::command]
pub fn create_famille(db: State<'_, DbState>, new_famille: NewFamille) -> Result<Famille, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_famille(new_famille)
        .map_err(|e| format!("Failed to create famille: {}", e))
}

#[tauri::command]
pub fn get_famille_by_id(db: State<'_, DbState>, id: i64) -> Result<Famille, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_famille_by_id(id)
        .map_err(|e| format!("Failed to get famille: {}", e))
}

#[tauri::command]
pub fn update_famille(db: State<'_, DbState>, id: i64, famille: NewFamille) -> Result<Famille, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_famille(id, &famille)
        .map_err(|e| format!("Failed to update famille: {}", e))
}

#[tauri::command]
pub fn delete_famille(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_famille(id)
        .map_err(|e| format!("Failed to delete famille: {}", e))
}

#[tauri::command]
pub fn get_or_create_famille(db: State<'_, DbState>, nom: String) -> Result<Famille, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_or_create_famille(&nom)
        .map_err(|e| format!("Failed to get or create famille: {}", e))
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
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_dashboard_stats()
        .map_err(|e| format!("Failed to get dashboard stats: {}", e))
}

#[tauri::command]
pub fn get_category_stats(db: State<'_, DbState>) -> Result<CategoryStats, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_category_stats()
        .map_err(|e| format!("Failed to get category stats: {}", e))
}

#[tauri::command]
pub fn get_monthly_stats(db: State<'_, DbState>) -> Result<Vec<MonthlyStats>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_monthly_stats()
        .map_err(|e| format!("Failed to get monthly stats: {}", e))
}

#[tauri::command]
pub fn get_product_stats(db: State<'_, DbState>) -> Result<Vec<ProductStats>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_product_stats()
        .map_err(|e| format!("Failed to get product stats: {}", e))
}

#[tauri::command]
pub fn get_pipeline_stats(db: State<'_, DbState>) -> Result<PipelineStats, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_pipeline_stats()
        .map_err(|e| format!("Failed to get pipeline stats: {}", e))
}

#[tauri::command]
pub fn get_alertes_with_contacts(db: State<'_, DbState>, limit: i64) -> Result<Vec<AlerteWithContact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_alertes_with_contacts(limit)
        .map_err(|e| format!("Failed to get alertes with contacts: {}", e))
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
    
    fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

// ========== ETIQUETTES ==========

#[tauri::command]
pub fn get_all_etiquettes(db: State<'_, DbState>) -> Result<Vec<Etiquette>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_etiquettes()
        .map_err(|e| format!("Failed to get etiquettes: {}", e))
}

#[tauri::command]
pub fn get_all_etiquettes_with_count(db: State<'_, DbState>) -> Result<Vec<EtiquetteWithCount>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_all_etiquettes_with_count()
        .map_err(|e| format!("Failed to get etiquettes with count: {}", e))
}

#[tauri::command]
pub fn get_etiquette_by_id(db: State<'_, DbState>, id: i64) -> Result<Etiquette, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_etiquette_by_id(id)
        .map_err(|e| format!("Failed to get etiquette: {}", e))
}

#[tauri::command]
pub fn create_etiquette(db: State<'_, DbState>, new_etiquette: NewEtiquette) -> Result<Etiquette, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.create_etiquette(new_etiquette)
        .map_err(|e| format!("Failed to create etiquette: {}", e))
}

#[tauri::command]
pub fn update_etiquette(db: State<'_, DbState>, id: i64, etiquette: NewEtiquette) -> Result<Etiquette, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.update_etiquette(id, &etiquette)
        .map_err(|e| format!("Failed to update etiquette: {}", e))
}

#[tauri::command]
pub fn delete_etiquette(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.delete_etiquette(id)
        .map_err(|e| format!("Failed to delete etiquette: {}", e))
}

#[tauri::command]
pub fn get_etiquettes_by_contact(db: State<'_, DbState>, contact_id: i64) -> Result<Vec<ContactEtiquetteDetails>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_etiquettes_by_contact(contact_id)
        .map_err(|e| format!("Failed to get contact etiquettes: {}", e))
}

#[tauri::command]
pub fn attribuer_etiquette(db: State<'_, DbState>, contact_id: i64, etiquette_id: i64, attribue_par: Option<String>) -> Result<ContactEtiquette, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.attribuer_etiquette(contact_id, etiquette_id, attribue_par)
        .map_err(|e| format!("Failed to assign etiquette: {}", e))
}

#[tauri::command]
pub fn retirer_etiquette(db: State<'_, DbState>, contact_id: i64, etiquette_id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.retirer_etiquette(contact_id, etiquette_id)
        .map_err(|e| format!("Failed to remove etiquette: {}", e))
}

#[tauri::command]
pub fn get_contacts_by_etiquette(db: State<'_, DbState>, etiquette_id: i64) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_contacts_by_etiquette(etiquette_id)
        .map_err(|e| format!("Failed to get contacts by etiquette: {}", e))
}

#[tauri::command]
pub fn seed_default_etiquettes(db: State<'_, DbState>) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.seed_default_etiquettes()
        .map_err(|e| format!("Failed to seed default etiquettes: {}", e))
}

#[tauri::command]
pub fn check_and_apply_auto_etiquettes(db: State<'_, DbState>) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.check_and_apply_auto_etiquettes()
        .map_err(|e| format!("Failed to apply auto etiquettes: {}", e))
}

#[tauri::command]
pub fn get_pending_etiquette_emails(db: State<'_, DbState>) -> Result<Vec<(i64, i64, i64, String, String)>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.get_pending_etiquette_emails()
        .map_err(|e| format!("Failed to get pending emails: {}", e))
}

#[tauri::command]
pub fn mark_etiquette_email_sent(db: State<'_, DbState>, contact_etiquette_id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    
    database.mark_etiquette_email_sent(contact_etiquette_id)
        .map_err(|e| format!("Failed to mark email sent: {}", e))
}