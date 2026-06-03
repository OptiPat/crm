use crate::database::{
    models::{
        Alerte, AlerteWithContact, CategoryStats, CgpConfig, Contact, ContactEtiquette,
        ContactEtiquetteDetails, DashboardStats, Document, Etiquette, EtiquetteWithCount, Famille,
        Foyer, Investissement, InvestissementWithDetails, MonthlyStats, NewAlerte, NewContact,
        NewDocument, NewEtiquette, NewFamille, NewFoyer, NewInvestissement, NewInvestissementValorisation, NewPartenaire,
        ExchangeHistoryEntry, Interaction, InteractionWithContact, InvestissementValorisation, NewInteraction,
        NewTemplateEmail, NewSegment, Partenaire,
        PipelineStats, ProductStats, Segment, SegmentWithCount, Setting, TemplateEmail,
        YearlyActivityStats,
    },
    Database,
};
use std::sync::Mutex;
use tauri::{Manager, State};

pub type DbState = Mutex<Option<Database>>;

#[tauri::command]
pub fn get_all_contacts(db: State<'_, DbState>) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_contacts()
        .map_err(|e| format!("Failed to get contacts: {}", e))
}

#[tauri::command]
pub fn create_contact(db: State<'_, DbState>, new_contact: NewContact) -> Result<Contact, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let contact = database
        .create_contact(new_contact)
        .map_err(|e| format!("Failed to create contact: {}", e))?;
    if let Some(id) = contact.id {
        let _ = database.check_auto_etiquettes_for_contact(id);
    }
    Ok(contact)
}

#[tauri::command]
pub fn get_contact_by_id(db: State<'_, DbState>, id: i64) -> Result<Contact, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_contact_by_id(id)
        .map_err(|e| format!("Failed to get contact: {}", e))
}

#[tauri::command]
pub fn delete_contact(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_contact(id)
        .map_err(|e| format!("Failed to delete contact: {}", e))
}

#[tauri::command]
pub fn delete_all_contacts(db: State<'_, DbState>) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_all_contacts()
        .map_err(|e| format!("Failed to delete all contacts: {}", e))
}

#[tauri::command]
pub fn cleanup_orphaned_data(db: State<'_, DbState>) -> Result<(usize, usize), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .cleanup_all_orphaned_data()
        .map_err(|e| format!("Failed to cleanup orphaned data: {}", e))
}

#[tauri::command]
pub fn update_contact(
    db: State<'_, DbState>,
    id: i64,
    contact: NewContact,
) -> Result<Contact, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let updated = database
        .update_contact(id, &contact)
        .map_err(|e| format!("Failed to update contact: {}", e))?;
    let _ = database.check_auto_etiquettes_for_contact(id);
    Ok(updated)
}

#[tauri::command]
pub fn find_contact_by_email(
    db: State<'_, DbState>,
    email: String,
) -> Result<Option<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .find_contact_by_email(&email)
        .map_err(|e| format!("Failed to find contact by email: {}", e))
}

// ========== FILLEULS ==========

#[tauri::command]
pub fn get_filleuls_by_parrain(
    db: State<'_, DbState>,
    parrain_id: i64,
) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_filleuls_by_parrain(parrain_id)
        .map_err(|e| format!("Failed to get filleuls: {}", e))
}

#[tauri::command]
pub fn find_contact_by_name(
    db: State<'_, DbState>,
    nom: String,
    prenom: String,
) -> Result<Option<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .find_contact_by_name(&nom, &prenom)
        .map_err(|e| format!("Failed to find contact by name: {}", e))
}

#[tauri::command]
pub fn get_clients_by_prescripteur(
    db: State<'_, DbState>,
    prescripteur_id: i64,
) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_clients_by_prescripteur(prescripteur_id)
        .map_err(|e| format!("Failed to get clients by prescripteur: {}", e))
}

// ========== FOYERS ==========

// ========== FAMILLES ==========

#[tauri::command]
pub fn get_all_familles(db: State<'_, DbState>) -> Result<Vec<Famille>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_familles()
        .map_err(|e| format!("Failed to get familles: {}", e))
}

#[tauri::command]
pub fn create_famille(db: State<'_, DbState>, new_famille: NewFamille) -> Result<Famille, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_famille(new_famille)
        .map_err(|e| format!("Failed to create famille: {}", e))
}

#[tauri::command]
pub fn get_famille_by_id(db: State<'_, DbState>, id: i64) -> Result<Famille, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_famille_by_id(id)
        .map_err(|e| format!("Failed to get famille: {}", e))
}

#[tauri::command]
pub fn update_famille(
    db: State<'_, DbState>,
    id: i64,
    famille: NewFamille,
) -> Result<Famille, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_famille(id, &famille)
        .map_err(|e| format!("Failed to update famille: {}", e))
}

#[tauri::command]
pub fn delete_famille(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_famille(id)
        .map_err(|e| format!("Failed to delete famille: {}", e))
}

#[tauri::command]
pub fn get_or_create_famille(db: State<'_, DbState>, nom: String) -> Result<Famille, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_or_create_famille(&nom)
        .map_err(|e| format!("Failed to get or create famille: {}", e))
}

// ========== FOYERS ==========

#[tauri::command]
pub fn get_all_foyers(db: State<'_, DbState>) -> Result<Vec<Foyer>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_foyers()
        .map_err(|e| format!("Failed to get foyers: {}", e))
}

#[tauri::command]
pub fn create_foyer(db: State<'_, DbState>, new_foyer: NewFoyer) -> Result<Foyer, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_foyer(new_foyer)
        .map_err(|e| format!("Failed to create foyer: {}", e))
}

#[tauri::command]
pub fn get_foyer_by_id(db: State<'_, DbState>, id: i64) -> Result<Foyer, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_foyer_by_id(id)
        .map_err(|e| format!("Failed to get foyer: {}", e))
}

#[tauri::command]
pub fn update_foyer(db: State<'_, DbState>, id: i64, foyer: NewFoyer) -> Result<Foyer, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_foyer(id, &foyer)
        .map_err(|e| format!("Failed to update foyer: {}", e))
}

#[tauri::command]
pub fn delete_foyer(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_foyer(id)
        .map_err(|e| format!("Failed to delete foyer: {}", e))
}

// ========== PARTENAIRES ==========

#[tauri::command]
pub fn get_all_partenaires(db: State<'_, DbState>) -> Result<Vec<Partenaire>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_partenaires()
        .map_err(|e| format!("Failed to get partenaires: {}", e))
}

#[tauri::command]
pub fn create_partenaire(
    db: State<'_, DbState>,
    new_partenaire: NewPartenaire,
) -> Result<Partenaire, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_partenaire(new_partenaire)
        .map_err(|e| format!("Failed to create partenaire: {}", e))
}

#[tauri::command]
pub fn get_partenaire_by_id(db: State<'_, DbState>, id: i64) -> Result<Partenaire, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_partenaire_by_id(id)
        .map_err(|e| format!("Failed to get partenaire: {}", e))
}

#[tauri::command]
pub fn update_partenaire(
    db: State<'_, DbState>,
    id: i64,
    partenaire: NewPartenaire,
) -> Result<Partenaire, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_partenaire(id, &partenaire)
        .map_err(|e| format!("Failed to update partenaire: {}", e))
}

#[tauri::command]
pub fn delete_partenaire(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_partenaire(id)
        .map_err(|e| format!("Failed to delete partenaire: {}", e))
}

// ========== DOCUMENTS ==========

#[tauri::command]
pub fn get_all_documents(db: State<'_, DbState>) -> Result<Vec<Document>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_documents()
        .map_err(|e| format!("Failed to get documents: {}", e))
}

#[tauri::command]
pub fn create_document(
    db: State<'_, DbState>,
    new_document: NewDocument,
) -> Result<Document, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_document(new_document)
        .map_err(|e| format!("Failed to create document: {}", e))
}

#[tauri::command]
pub fn get_document_by_id(db: State<'_, DbState>, id: i64) -> Result<Document, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_document_by_id(id)
        .map_err(|e| format!("Failed to get document: {}", e))
}

#[tauri::command]
pub fn update_document(
    db: State<'_, DbState>,
    id: i64,
    document: NewDocument,
) -> Result<Document, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_document(id, &document)
        .map_err(|e| format!("Failed to update document: {}", e))
}

#[tauri::command]
pub fn delete_document(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_document(id)
        .map_err(|e| format!("Failed to delete document: {}", e))
}

// ========== TEMPLATES EMAIL ==========

#[tauri::command]
pub fn get_all_templates_email(db: State<'_, DbState>) -> Result<Vec<TemplateEmail>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_templates_email()
        .map_err(|e| format!("Failed to get templates: {}", e))
}

#[tauri::command]
pub fn create_template_email(
    db: State<'_, DbState>,
    new_template: NewTemplateEmail,
) -> Result<TemplateEmail, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_template_email(new_template)
        .map_err(|e| format!("Failed to create template: {}", e))
}

#[tauri::command]
pub fn get_template_email_by_id(db: State<'_, DbState>, id: i64) -> Result<TemplateEmail, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_template_email_by_id(id)
        .map_err(|e| format!("Failed to get template: {}", e))
}

#[tauri::command]
pub fn update_template_email(
    db: State<'_, DbState>,
    id: i64,
    template: NewTemplateEmail,
) -> Result<TemplateEmail, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_template_email(id, &template)
        .map_err(|e| format!("Failed to update template: {}", e))
}

#[derive(serde::Deserialize)]
pub struct SetTemplateEtiquetteLinksInput {
    pub template_id: i64,
    pub etiquette_ids: Vec<i64>,
}

#[tauri::command]
pub fn set_template_etiquette_links(
    db: State<'_, DbState>,
    input: SetTemplateEtiquetteLinksInput,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .set_template_etiquette_links(input.template_id, &input.etiquette_ids)
        .map_err(|e| format!("Failed to link template to etiquettes: {}", e))
}

#[tauri::command]
pub fn get_etiquette_ids_for_template(
    db: State<'_, DbState>,
    template_id: i64,
) -> Result<Vec<i64>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_etiquette_ids_for_template(template_id)
        .map_err(|e| format!("Failed to get etiquettes for template: {}", e))
}

#[tauri::command]
pub fn delete_template_email(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_template_email(id)
        .map_err(|e| format!("Failed to delete template: {}", e))
}

#[tauri::command]
pub fn seed_default_email_templates(
    db: State<'_, DbState>,
    only_if_empty: Option<bool>,
) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .ensure_default_email_templates(only_if_empty.unwrap_or(false))
        .map_err(|e| format!("Failed to seed email templates: {}", e))
}

// ========== ALERTES ==========

#[tauri::command]
pub fn get_all_alertes(db: State<'_, DbState>) -> Result<Vec<Alerte>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_alertes()
        .map_err(|e| format!("Failed to get alertes: {}", e))
}

#[tauri::command]
pub fn get_alertes_non_traitees(db: State<'_, DbState>) -> Result<Vec<Alerte>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_alertes_non_traitees()
        .map_err(|e| format!("Failed to get alertes: {}", e))
}

#[tauri::command]
pub fn create_alerte(db: State<'_, DbState>, new_alerte: NewAlerte) -> Result<Alerte, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_alerte(new_alerte)
        .map_err(|e| format!("Failed to create alerte: {}", e))
}

#[tauri::command]
pub fn marquer_alerte_lue(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .marquer_alerte_lue(id)
        .map_err(|e| format!("Failed to mark alerte as read: {}", e))
}

#[tauri::command]
pub fn marquer_alerte_traitee(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .marquer_alerte_traitee(id)
        .map_err(|e| format!("Failed to mark alerte as treated: {}", e))
}

#[tauri::command]
pub fn delete_alerte(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_alerte(id)
        .map_err(|e| format!("Failed to delete alerte: {}", e))
}

#[tauri::command]
pub fn generer_alertes_automatiques(db: State<'_, DbState>) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .generer_alertes_automatiques()
        .map_err(|e| format!("Failed to generate alertes: {}", e))
}

// ========== DASHBOARD ==========

#[tauri::command]
pub fn get_dashboard_stats(db: State<'_, DbState>) -> Result<DashboardStats, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_dashboard_stats()
        .map_err(|e| format!("Failed to get dashboard stats: {}", e))
}

#[tauri::command]
pub fn get_category_stats(db: State<'_, DbState>) -> Result<CategoryStats, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_category_stats()
        .map_err(|e| format!("Failed to get category stats: {}", e))
}

#[tauri::command]
pub fn get_monthly_stats(db: State<'_, DbState>) -> Result<Vec<MonthlyStats>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_monthly_stats()
        .map_err(|e| format!("Failed to get monthly stats: {}", e))
}

#[tauri::command]
pub fn get_yearly_activity_stats(
    db: State<'_, DbState>,
) -> Result<Vec<YearlyActivityStats>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_yearly_activity_stats()
        .map_err(|e| format!("Failed to get yearly activity stats: {}", e))
}

#[tauri::command]
pub fn get_product_stats(db: State<'_, DbState>) -> Result<Vec<ProductStats>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_product_stats()
        .map_err(|e| format!("Failed to get product stats: {}", e))
}

#[tauri::command]
pub fn get_pipeline_stats(db: State<'_, DbState>) -> Result<PipelineStats, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_pipeline_stats()
        .map_err(|e| format!("Failed to get pipeline stats: {}", e))
}

#[tauri::command]
pub fn get_alertes_with_contacts(
    db: State<'_, DbState>,
    limit: Option<i64>,
) -> Result<Vec<AlerteWithContact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_alertes_with_contacts(limit)
        .map_err(|e| format!("Failed to get alertes with contacts: {}", e))
}

// ========== INVESTISSEMENTS ==========

#[tauri::command]
pub fn get_all_investissements(db: State<'_, DbState>) -> Result<Vec<Investissement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_investissements()
        .map_err(|e| format!("Failed to get investissements: {}", e))
}

#[tauri::command]
pub fn get_investissements_by_contact(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<Investissement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_investissements_by_contact(contact_id)
        .map_err(|e| format!("Failed to get investissements by contact: {}", e))
}

#[tauri::command]
pub fn get_investissements_by_foyer(
    db: State<'_, DbState>,
    foyer_id: i64,
) -> Result<Vec<Investissement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_investissements_by_foyer(foyer_id)
        .map_err(|e| format!("Failed to get investissements by foyer: {}", e))
}

#[tauri::command]
pub fn get_investissements_with_details(
    db: State<'_, DbState>,
) -> Result<Vec<InvestissementWithDetails>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_investissements_with_details()
        .map_err(|e| format!("Failed to get investissements with details: {}", e))
}

#[tauri::command]
pub fn create_investissement(
    db: State<'_, DbState>,
    new_investissement: NewInvestissement,
) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let inv = database
        .create_investissement(new_investissement)
        .map_err(|e| format!("Failed to create investissement: {}", e))?;
    let _ = database.sync_auto_etiquettes_after_investissement(
        inv.contact_id,
        inv.foyer_id,
        Some(inv.id),
    );
    Ok(inv)
}

#[tauri::command]
pub fn get_investissement_by_id(db: State<'_, DbState>, id: i64) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_investissement_by_id(id)
        .map_err(|e| format!("Failed to get investissement: {}", e))
}

#[tauri::command]
pub fn update_investissement(
    db: State<'_, DbState>,
    id: i64,
    investissement: NewInvestissement,
) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let inv = database
        .update_investissement(id, &investissement)
        .map_err(|e| format!("Failed to update investissement: {}", e))?;
    let _ = database.sync_auto_etiquettes_after_investissement(
        inv.contact_id,
        inv.foyer_id,
        Some(inv.id),
    );
    Ok(inv)
}

#[tauri::command]
pub fn delete_investissement(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let inv = database.get_investissement_by_id(id).ok();
    database
        .delete_investissement(id)
        .map_err(|e| format!("Failed to delete investissement: {}", e))?;
    if let Some(inv) = inv {
        let _ = database.sync_auto_etiquettes_after_investissement(inv.contact_id, inv.foyer_id, None);
    }
    Ok(())
}

#[tauri::command]
pub fn get_valorisations_by_investissement(
    db: State<'_, DbState>,
    investissement_id: i64,
) -> Result<Vec<InvestissementValorisation>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_valorisations_by_investissement(investissement_id)
        .map_err(|e| format!("Failed to get valorisations: {}", e))
}

#[tauri::command]
pub fn create_investissement_valorisation(
    db: State<'_, DbState>,
    valorisation: NewInvestissementValorisation,
) -> Result<InvestissementValorisation, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_investissement_valorisation(valorisation)
        .map_err(|e| format!("Failed to create valorisation: {}", e))
}

#[tauri::command]
pub fn delete_investissement_valorisation(
    db: State<'_, DbState>,
    id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_investissement_valorisation(id)
        .map_err(|e| format!("Failed to delete valorisation: {}", e))
}

#[tauri::command]
pub fn check_and_create_demembrement_alerts(db: State<'_, DbState>) -> Result<Vec<Alerte>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .check_and_create_demembrement_alerts()
        .map_err(|e| format!("Failed to check demembrement alerts: {}", e))
}

// ========== PDF ==========

#[tauri::command]
pub fn read_pdf_file(file_path: String) -> Result<Vec<u8>, String> {
    use std::fs;

    fs::read(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}

// ========== ETIQUETTES ==========

#[tauri::command]
pub fn get_all_etiquettes(db: State<'_, DbState>) -> Result<Vec<Etiquette>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_etiquettes()
        .map_err(|e| format!("Failed to get etiquettes: {}", e))
}

#[tauri::command]
pub fn get_all_etiquettes_with_count(
    db: State<'_, DbState>,
) -> Result<Vec<EtiquetteWithCount>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_etiquettes_with_count()
        .map_err(|e| format!("Failed to get etiquettes with count: {}", e))
}

#[tauri::command]
pub fn get_etiquette_by_id(db: State<'_, DbState>, id: i64) -> Result<Etiquette, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_etiquette_by_id(id)
        .map_err(|e| format!("Failed to get etiquette: {}", e))
}

#[tauri::command]
pub fn create_etiquette(
    db: State<'_, DbState>,
    new_etiquette: NewEtiquette,
) -> Result<Etiquette, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let etiqu = database
        .create_etiquette(new_etiquette)
        .map_err(|e| format!("Failed to create etiquette: {}", e))?;
    if etiqu.actif && Database::etiquette_has_auto_rule(&etiqu) {
        let _ = database.check_auto_etiquettes_for_etiquette(etiqu.id);
    }
    Ok(etiqu)
}

#[tauri::command]
pub fn update_etiquette(
    db: State<'_, DbState>,
    id: i64,
    etiquette: NewEtiquette,
) -> Result<Etiquette, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let etiqu = database
        .update_etiquette(id, &etiquette)
        .map_err(|e| format!("Failed to update etiquette: {}", e))?;
    if etiqu.actif && Database::etiquette_has_auto_rule(&etiqu) {
        let _ = database.check_auto_etiquettes_for_etiquette(etiqu.id);
    }
    Ok(etiqu)
}

#[tauri::command]
pub fn delete_etiquette(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_etiquette(id)
        .map_err(|e| format!("Failed to delete etiquette: {}", e))
}

#[tauri::command]
pub fn get_etiquettes_by_contact(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<ContactEtiquetteDetails>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_etiquettes_by_contact(contact_id)
        .map_err(|e| format!("Failed to get contact etiquettes: {}", e))
}

#[tauri::command]
pub fn get_all_contact_etiquettes_details(
    db: State<'_, DbState>,
) -> Result<Vec<ContactEtiquetteDetails>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_contact_etiquettes_details()
        .map_err(|e| format!("Failed to get all contact etiquettes: {}", e))
}

#[tauri::command]
pub fn attribuer_etiquette(
    db: State<'_, DbState>,
    contact_id: i64,
    etiquette_id: i64,
    attribue_par: Option<String>,
) -> Result<ContactEtiquette, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .attribuer_etiquette(contact_id, etiquette_id, attribue_par, None)
        .map_err(|e| format!("Failed to assign etiquette: {}", e))
}

#[tauri::command]
pub fn retirer_etiquette(
    db: State<'_, DbState>,
    contact_id: i64,
    etiquette_id: i64,
    exclude_from_auto: Option<bool>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .retirer_etiquette(contact_id, etiquette_id, exclude_from_auto.unwrap_or(false))
        .map_err(|e| format!("Failed to remove etiquette: {}", e))
}

#[tauri::command]
pub fn exclude_contact_auto_etiquette(
    db: State<'_, DbState>,
    contact_id: i64,
    etiquette_id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .exclude_contact_from_auto_etiquette(contact_id, etiquette_id)
        .map_err(|e| format!("Failed to exclude auto etiquette: {}", e))
}

#[tauri::command]
pub fn clear_auto_etiquette_exclusion(
    db: State<'_, DbState>,
    contact_id: i64,
    etiquette_id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .clear_auto_etiquette_exclusion(contact_id, etiquette_id)
        .map_err(|e| format!("Failed to clear auto exclusion: {}", e))
}

#[tauri::command]
pub fn get_auto_etiquette_exclusion_ids(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<i64>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_auto_etiquette_exclusion_ids_for_contact(contact_id)
        .map_err(|e| format!("Failed to list auto exclusions: {}", e))
}

#[tauri::command]
pub fn get_contacts_by_etiquette(
    db: State<'_, DbState>,
    etiquette_id: i64,
) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_contacts_by_etiquette(etiquette_id)
        .map_err(|e| format!("Failed to get contacts by etiquette: {}", e))
}

#[tauri::command]
pub fn seed_default_etiquettes(db: State<'_, DbState>) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .seed_default_etiquettes()
        .map_err(|e| format!("Failed to seed default etiquettes: {}", e))
}

#[tauri::command]
pub fn check_and_apply_auto_etiquettes(db: State<'_, DbState>) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .check_and_apply_auto_etiquettes()
        .map_err(|e| format!("Failed to apply auto etiquettes: {}", e))
}

#[tauri::command]
pub fn get_all_segments(db: State<'_, DbState>) -> Result<Vec<Segment>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_all_segments()
        .map_err(|e| format!("Failed to get segments: {}", e))
}

#[tauri::command]
pub fn get_all_segments_with_count(db: State<'_, DbState>) -> Result<Vec<SegmentWithCount>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_all_segments_with_count()
        .map_err(|e| format!("Failed to get segments: {}", e))
}

#[tauri::command]
pub fn create_segment(db: State<'_, DbState>, segment: NewSegment) -> Result<Segment, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_segment(segment)
        .map_err(|e| format!("Failed to create segment: {}", e))
}

#[tauri::command]
pub fn update_segment(
    db: State<'_, DbState>,
    id: i64,
    segment: NewSegment,
) -> Result<Segment, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let updated = database
        .update_segment(id, &segment)
        .map_err(|e| format!("Failed to update segment: {}", e))?;
    let _ = database.sync_auto_etiquettes_after_segment_update(id);
    Ok(updated)
}

#[tauri::command]
pub fn delete_segment(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .delete_segment(id)
        .map_err(|e| format!("Failed to delete segment: {}", e))
}

#[tauri::command]
pub fn evaluate_segment_for_contact(
    db: State<'_, DbState>,
    segment_id: i64,
    contact_id: i64,
) -> Result<bool, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let contact = database
        .get_contact_by_id(contact_id)
        .map_err(|e| format!("Contact: {}", e))?;
    database
        .contact_matches_segment(&contact, segment_id)
        .map_err(|e| format!("Evaluate segment: {}", e))
}

#[tauri::command]
pub fn get_contacts_matching_segment(
    db: State<'_, DbState>,
    segment_id: i64,
) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let contacts = database
        .get_all_contacts()
        .map_err(|e| format!("Contacts: {}", e))?;
    let mut out = Vec::new();
    for c in contacts {
        if database
            .contact_matches_segment(&c, segment_id)
            .map_err(|e| format!("Segment: {}", e))?
        {
            out.push(c);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn preview_segment_rule_count(
    db: State<'_, DbState>,
    rule_json: String,
) -> Result<i64, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .count_contacts_for_rule_json(&rule_json)
        .map_err(|e| format!("Preview: {}", e))
}

#[tauri::command]
pub fn get_contact_auto_etiquette_log(
    db: State<'_, DbState>,
    contact_id: i64,
    limit: Option<i64>,
) -> Result<Vec<(i64, String, bool, String, i64)>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_auto_log_for_contact(contact_id, limit.unwrap_or(20))
        .map_err(|e| format!("Log: {}", e))
}

#[tauri::command]
pub fn get_pending_etiquette_emails(
    db: State<'_, DbState>,
) -> Result<Vec<(i64, i64, i64, String, String)>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_pending_etiquette_emails()
        .map_err(|e| format!("Failed to get pending emails: {}", e))
}

#[tauri::command]
pub fn get_etiquette_email_queue(
    db: State<'_, DbState>,
    queue_status: String,
) -> Result<Vec<crate::database::models::EtiquetteEmailQueueItem>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_etiquette_email_queue(&queue_status)
        .map_err(|e| format!("Failed to get etiquette email queue: {}", e))
}

#[tauri::command]
pub fn mark_etiquette_email_sent(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    gmail_message_id: Option<String>,
    gmail_thread_id: Option<String>,
    email_subject: Option<String>,
    email_body: Option<String>,
    queue_row_kind: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    if queue_row_kind.as_deref() == Some("template") {
        return database
            .mark_template_email_sent(
                contact_etiquette_id,
                gmail_message_id.as_deref(),
                gmail_thread_id.as_deref(),
                email_subject.as_deref(),
                email_body.as_deref(),
            )
            .map_err(|e| format!("Failed to mark email sent: {}", e));
    }

    database
        .mark_etiquette_email_sent(
            contact_etiquette_id,
            gmail_message_id.as_deref(),
            gmail_thread_id.as_deref(),
            email_subject.as_deref(),
            email_body.as_deref(),
        )
        .map_err(|e| format!("Failed to mark email sent: {}", e))
}

#[tauri::command]
pub fn sync_email_campaign_responses(
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
) -> Result<crate::email::response_sync::EmailCampaignSyncResult, String> {
    let pending = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .list_campaigns_pending_response_check()
            .map_err(|e| e.to_string())?
    };

    crate::email::response_sync::sync_email_campaign_responses(
        &app_handle,
        pending,
        |contact_etiquette_id, response_type, body, gmail_msg, subject| {
            let db_guard = db.lock().unwrap();
            let database = db_guard.as_ref().ok_or("Database not initialized")?;
            database
                .mark_email_campaign_response(
                    contact_etiquette_id,
                    response_type,
                    body,
                    gmail_msg,
                    subject,
                )
                .map_err(|e| e.to_string())
        },
    )
}

#[tauri::command]
pub fn mark_email_campaign_response(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    response_type: String,
    reponse_body: Option<String>,
    reponse_gmail_message_id: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .mark_email_campaign_response(
            contact_etiquette_id,
            &response_type,
            reponse_body.as_deref(),
            reponse_gmail_message_id.as_deref(),
            None,
        )
        .map_err(|e| format!("Failed to mark response: {}", e))
}

#[tauri::command]
pub fn import_campaign_reply_from_gmail(
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
) -> Result<String, String> {
    let item = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database.campaign_response_check_item(contact_etiquette_id)?
    };

    let store = crate::email::oauth_store::EmailOAuthStore::load(&app_handle)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Email.")?;
    if conn.provider != "google" {
        return Err("L'import de réponse nécessite un compte Google.".into());
    }
    crate::email::oauth_send::refresh_connection_if_needed(&app_handle, &mut conn)?;
    let client = reqwest::blocking::Client::new();
    let reply = crate::email::response_sync::gmail_find_contact_reply(
        &client,
        &conn.access_token,
        &item,
    )?
    .ok_or("Aucune réponse Gmail trouvée pour ce contact après l'envoi.")?;

    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .mark_email_campaign_response(
            contact_etiquette_id,
            "mail",
            Some(reply.body_text.as_str()),
            Some(reply.message_id.as_str()),
            reply.subject.as_deref(),
        )
        .map_err(|e| format!("Failed to mark response: {}", e))?;

    Ok(reply.body_text)
}

#[tauri::command]
pub fn dismiss_email_campaign_followup(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .dismiss_email_campaign_followup(contact_etiquette_id)
        .map_err(|e| format!("Failed to dismiss followup: {}", e))
}

#[tauri::command]
pub fn cancel_pending_email_campaign(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .cancel_pending_email_campaign(contact_etiquette_id)
        .map_err(|e| format!("Failed to cancel pending email: {}", e))
}

#[tauri::command]
pub fn prepare_email_campaign_relance(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .prepare_email_campaign_relance(contact_etiquette_id)
        .map_err(|e| format!("Failed to prepare relance: {}", e))
}

#[tauri::command]
pub fn scan_stellium_exceltis_emails(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
) -> Result<crate::email::stellium_exceltis::StelliumExceltisScanResult, String> {
    crate::email::stellium_exceltis::scan_stellium_exceltis_emails(&app, &db)
}

#[tauri::command]
pub fn get_stellium_exceltis_signals(
    db: State<'_, DbState>,
) -> Result<Vec<crate::email::stellium_exceltis::StelliumExceltisSignal>, String> {
    crate::email::stellium_exceltis::get_stellium_exceltis_signals(&db)
}

#[tauri::command]
pub fn dismiss_stellium_exceltis_signal(
    db: State<'_, DbState>,
    gmail_message_id: String,
) -> Result<(), String> {
    crate::email::stellium_exceltis::dismiss_stellium_exceltis_signal(&db, &gmail_message_id)
}

// ========== SETTINGS ==========

#[tauri::command]
pub fn get_setting(db: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_setting(&key)
        .map_err(|e| format!("Failed to get setting: {}", e))
}

#[tauri::command]
pub fn set_setting(db: State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .set_setting(&key, &value)
        .map_err(|e| format!("Failed to set setting: {}", e))
}

#[tauri::command]
pub fn delete_setting(db: State<'_, DbState>, key: String) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_setting(&key)
        .map_err(|e| format!("Failed to delete setting: {}", e))
}

#[tauri::command]
pub fn get_all_settings(db: State<'_, DbState>) -> Result<Vec<Setting>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_settings()
        .map_err(|e| format!("Failed to get all settings: {}", e))
}

#[tauri::command]
pub fn get_cgp_config(db: State<'_, DbState>) -> Result<CgpConfig, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_cgp_config()
        .map_err(|e| format!("Failed to get CGP config: {}", e))
}

#[tauri::command]
pub fn save_cgp_config(db: State<'_, DbState>, config: CgpConfig) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .save_cgp_config(&config)
        .map_err(|e| format!("Failed to save CGP config: {}", e))
}

#[tauri::command]
pub fn is_wizard_completed(db: State<'_, DbState>) -> Result<bool, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .is_wizard_completed()
        .map_err(|e| format!("Failed to check wizard status: {}", e))
}

#[tauri::command]
pub fn complete_wizard(db: State<'_, DbState>) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .complete_wizard()
        .map_err(|e| format!("Failed to complete wizard: {}", e))
}

#[tauri::command]
pub fn update_wizard_step(db: State<'_, DbState>, step: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_wizard_step(step)
        .map_err(|e| format!("Failed to update wizard step: {}", e))
}

// ========== IMPORT TRANSACTION (atomique) ==========

#[tauri::command]
pub fn begin_import_transaction(db: State<'_, DbState>) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .begin_import_transaction()
        .map_err(|e| format!("Failed to begin import transaction: {}", e))
}

#[tauri::command]
pub fn commit_import_transaction(db: State<'_, DbState>) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .commit_import_transaction()
        .map_err(|e| format!("Failed to commit import transaction: {}", e))
}

#[tauri::command]
pub fn rollback_import_transaction(db: State<'_, DbState>) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .rollback_import_transaction()
        .map_err(|e| format!("Failed to rollback import transaction: {}", e))
}

// ========== INTERACTIONS ==========

#[tauri::command]
pub fn get_all_interactions_with_contacts(
    db: State<'_, DbState>,
) -> Result<Vec<InteractionWithContact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_all_interactions_with_contacts()
        .map_err(|e| format!("Failed to get interactions: {}", e))
}

#[tauri::command]
pub fn get_exchange_history_timeline(
    db: State<'_, DbState>,
) -> Result<Vec<ExchangeHistoryEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_exchange_history_timeline()
        .map_err(|e| format!("Failed to get exchange history: {}", e))
}

#[tauri::command]
pub fn get_exchange_history_timeline_for_contact(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<ExchangeHistoryEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_exchange_history_timeline_for_contact(contact_id)
        .map_err(|e| format!("Failed to get exchange history: {}", e))
}

#[tauri::command]
pub async fn open_contact_mail_attachment(
    app_handle: tauri::AppHandle,
    message_row_id: i64,
    attachment_id: String,
) -> Result<(), String> {
    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<DbState>();
        crate::email::contact_gmail_sync::open_contact_mail_attachment(
            &app,
            db.inner(),
            message_row_id,
            attachment_id,
        )
    })
    .await
    .map_err(|e| format!("Ouverture interrompue: {}", e))?
}

#[tauri::command]
pub fn get_interactions_by_contact(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<Interaction>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_interactions_by_contact(contact_id)
        .map_err(|e| format!("Failed to get interactions: {}", e))
}

#[tauri::command]
pub fn get_contact_relation_status(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<crate::database::models::ContactRelationStatus, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_contact_relation_status(contact_id)
        .map_err(|e| format!("Failed to get contact relation status: {}", e))
}

#[tauri::command]
pub fn create_interaction(
    db: State<'_, DbState>,
    new_interaction: NewInteraction,
) -> Result<Interaction, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_interaction(new_interaction)
        .map_err(|e| format!("Failed to create interaction: {}", e))
}

#[tauri::command]
pub fn update_interaction(
    db: State<'_, DbState>,
    id: i64,
    interaction: NewInteraction,
) -> Result<Interaction, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_interaction(id, interaction)
        .map_err(|e| format!("Failed to update interaction: {}", e))
}

#[tauri::command]
pub fn delete_interaction(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .delete_interaction(id)
        .map_err(|e| format!("Failed to delete interaction: {}", e))
}

#[tauri::command]
pub async fn sync_contact_gmail_messages(
    app_handle: tauri::AppHandle,
    contact_id: i64,
) -> Result<crate::email::contact_gmail_sync::ContactGmailSyncResult, String> {
    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<DbState>();
        crate::email::contact_gmail_sync::sync_contact_mail_history(&app, db.inner(), contact_id)
    })
    .await
    .map_err(|e| format!("Sync interrompu: {}", e))?
}

#[tauri::command]
pub fn get_contact_gmail_messages(
    db: State<'_, DbState>,
    contact_id: i64,
    exclude_campaign_duplicates: Option<bool>,
) -> Result<Vec<crate::database::models::ContactGmailMessage>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .list_contact_gmail_messages(contact_id, exclude_campaign_duplicates.unwrap_or(true))
        .map_err(|e| format!("Failed to list Gmail messages: {}", e))
}

#[tauri::command]
pub async fn fetch_contact_gmail_message_body(
    app_handle: tauri::AppHandle,
    message_row_id: i64,
) -> Result<crate::email::contact_gmail_sync::FetchedContactMailBody, String> {
    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<DbState>();
        crate::email::contact_gmail_sync::fetch_contact_gmail_message_body(
            &app,
            db.inner(),
            message_row_id,
        )
    })
    .await
    .map_err(|e| format!("Lecture interrompue: {}", e))?
}

#[tauri::command]
pub fn get_contact_mail_sync_state(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Option<crate::database::models::ContactMailSyncState>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_contact_mail_sync_state(contact_id)
        .map_err(|e| e.to_string())
}
