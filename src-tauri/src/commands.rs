use crate::auth::session::{require_ui_session, UiSessionState};
use crate::database::{
    compta::{
        ComptaBilanData, ComptaConfig, ComptaDepense, ComptaDeplacement, ComptaEncaissement,
        NewComptaDepense, NewComptaDeplacement, NewComptaEncaissement,
    },
    contacts::UpdateContactFieldPresence,
    models::{
        ActivityPeriodSummary, Alerte, AlerteWithContact, CalendarEventEntry, CalendarSyncResult,
        CategoryStats, CgpConfig, CloseInvestissementPayload, Contact, ContactCustomField,
        ContactEtiquette, ContactEtiquetteDetails, ConversionClientStats, ConversionFilleulStats,
        CustomFieldDef, CustomFieldValueInput, CustomFieldValueRow, DashboardStatContact,
        DashboardStats, Document, EmailSendLogEntry, Etiquette, EtiquetteAction,
        EtiquettePipelineBoard, EtiquetteWithCount, ExchangeHistoryEntry, Famille, Foyer,
        Interaction, InteractionWithContact, Investissement, InvestissementValorisation,
        InvestissementVersement, InvestissementWithDetails, MonthlyStats, NewAlerte, NewContact,
        NewCustomFieldDef, NewDocument, NewEtiquette, NewFamille, NewFoyer, NewInteraction,
        NewInvestissement, NewInvestissementValorisation, NewInvestissementVersement,
        NewPartenaire, NewPipe, NewPipeTimelineEntry, NewSegment, NewTache, NewTemplateEmail,
        NomProduitSuggestion, Partenaire, Pipe, PipeContactTimelineEntry, PipeR1DocumentChecklist,
        PipeR1MissingDocsSummary, PipeR3DocumentChecklist, PipeR3ImmoDocumentChecklist,
        PipeR3MissingDocsSummary, PipeTimelineEntry, PipelineStats, ProductStats, Segment,
        SegmentWithCount, SetTacheStatutResult, Setting, Tache, TemplateEmail, TemplateEmailAction,
        UpdateCustomFieldDef, UpdatePipe, UpdatePipeR1DocumentChecklistInput,
        UpdatePipeR3DocumentChecklistInput, UpdatePipeR3ImmoDocumentChecklistInput,
        UpdatePipeTimelineEntry, YearlyActivityStats,
    },
    Database,
};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

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
pub fn get_contacts_by_foyer(
    db: State<'_, DbState>,
    foyer_id: i64,
) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_contacts_by_foyer(foyer_id)
        .map_err(|e| format!("Failed to get contacts by foyer: {}", e))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContactResult {
    pub contact: Contact,
    pub onedrive_message: Option<String>,
    pub onedrive_link_created: bool,
}

#[tauri::command]
pub fn create_contact(
    app: AppHandle,
    db: State<'_, DbState>,
    new_contact: NewContact,
    skip_post_save_hooks: Option<bool>,
) -> Result<CreateContactResult, String> {
    let (contact, contact_id, categorie, skip_hooks) = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;

        let contact = database
            .create_contact(new_contact)
            .map_err(|e| format!("Failed to create contact: {}", e))?;
        let contact_id = contact.id;
        let categorie = contact.categorie.clone();
        let skip_hooks = skip_post_save_hooks.unwrap_or(false);
        if let Some(id) = contact_id {
            if !skip_hooks {
                let _ = database.check_auto_etiquettes_for_contact(id);
            }
        }
        (contact, contact_id, categorie, skip_hooks)
    };

    let contact = if let Some(id) = contact_id {
        if crate::client_onedrive::hooks::is_client_category(&categorie) {
            crate::client_onedrive::background::spawn_onedrive_auto_create_background(
                app.clone(),
                id,
            );
        }
        if !skip_hooks {
            crate::email::google_contacts::sync_contact_after_save(&app, &db, id);
        }
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .get_contact_by_id(id)
            .map_err(|e| format!("Failed to get contact: {}", e))?
    } else {
        contact
    };

    Ok(CreateContactResult {
        contact,
        onedrive_message: None,
        onedrive_link_created: false,
    })
}

#[tauri::command]
pub fn create_contacts_bulk(
    app: AppHandle,
    db: State<'_, DbState>,
    new_contacts: Vec<NewContact>,
    skip_post_save_hooks: Option<bool>,
) -> Result<Vec<Contact>, String> {
    if !skip_post_save_hooks.unwrap_or(false) {
        return Err(
            "create_contacts_bulk requiert skip_post_save_hooks — recalcul unique en fin d'import"
                .into(),
        );
    }
    let contacts = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .create_contacts_bulk(new_contacts)
            .map_err(|e| format!("Failed to bulk create contacts: {}", e))?
    };

    let contact_ids: Vec<i64> = contacts
        .iter()
        .filter(|c| {
            c.id.is_some_and(|_| crate::client_onedrive::hooks::is_client_category(&c.categorie))
        })
        .filter_map(|c| c.id)
        .collect();
    crate::client_onedrive::background::spawn_onedrive_auto_create_batch_background(
        app,
        contact_ids,
    );

    Ok(contacts)
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
    app: AppHandle,
    db: State<'_, DbState>,
    id: i64,
    contact: serde_json::Value,
    skip_post_save_hooks: Option<bool>,
) -> Result<Contact, String> {
    let field_presence =
        contact
            .as_object()
            .map_or(UpdateContactFieldPresence::default(), |fields| {
                UpdateContactFieldPresence {
                    birthday: fields.contains_key("date_naissance"),
                    date_invitation_filleul: fields.contains_key("date_invitation_filleul"),
                    date_inscription_filleul: fields.contains_key("date_inscription_filleul"),
                    filleul_titre: fields.contains_key("filleul_titre"),
                    filleul_qualification: fields.contains_key("filleul_qualification"),
                    filleul_volume: fields.contains_key("filleul_volume"),
                    filleul_volume_manager: fields.contains_key("filleul_volume_manager"),
                }
            });
    let contact: NewContact =
        serde_json::from_value(contact).map_err(|e| format!("Payload contact invalide : {e}"))?;

    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_contact(id, &contact, field_presence)
        .map_err(|e| format!("Failed to update contact: {}", e))?;
    if !skip_post_save_hooks.unwrap_or(false) {
        let _ = database.check_auto_etiquettes_for_contact(id);
        drop(db_guard);
        crate::email::google_contacts::sync_contact_after_save(&app, &db, id);
    } else {
        drop(db_guard);
    }
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_contact_by_id(id)
        .map_err(|e| format!("Failed to update contact: {}", e))
}

/// Fiscalité éditable d'un contact (personne seule, ou copie synchronisée depuis le foyer).
#[derive(serde::Deserialize)]
pub struct ContactFiscalPayload {
    #[serde(default)]
    pub tranche_imposition: Option<String>,
    #[serde(default)]
    pub nombre_parts_fiscales: Option<f64>,
    #[serde(default)]
    pub revenu_fiscal_reference: Option<f64>,
    #[serde(default)]
    pub ir_net_a_payer: Option<f64>,
}

#[tauri::command]
pub fn update_contact_fiscal(
    db: State<'_, DbState>,
    id: i64,
    fiscal: ContactFiscalPayload,
) -> Result<Contact, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_contact_fiscal(
            id,
            fiscal.tranche_imposition,
            fiscal.nombre_parts_fiscales,
            fiscal.revenu_fiscal_reference,
            fiscal.ir_net_a_payer,
        )
        .map_err(|e| format!("Failed to update contact fiscal: {}", e))?;
    let _ = database.check_auto_etiquettes_for_contact(id);
    database
        .get_contact_by_id(id)
        .map_err(|e| format!("Failed to get contact after fiscal update: {}", e))
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
pub fn list_pipes(
    db: State<'_, DbState>,
    include_archived: Option<bool>,
) -> Result<Vec<Pipe>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .list_pipes(include_archived.unwrap_or(false))
        .map_err(|e| format!("Failed to list pipes: {}", e))
}

#[tauri::command]
pub fn archive_pipe(db: State<'_, DbState>, id: i64) -> Result<Pipe, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .archive_pipe(id)
        .map_err(|e| format!("Failed to archive pipe: {}", e))
}

#[tauri::command]
pub fn unarchive_pipe(db: State<'_, DbState>, id: i64) -> Result<Pipe, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .unarchive_pipe(id)
        .map_err(|e| format!("Failed to unarchive pipe: {}", e))
}

#[tauri::command]
pub fn list_pipe_timeline_for_contact(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<PipeContactTimelineEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .list_pipe_timeline_for_contact(contact_id)
        .map_err(|e| format!("Failed to list pipe timeline for contact: {}", e))
}

#[tauri::command]
pub fn get_pipe_r1_document_checklist(
    db: State<'_, DbState>,
    pipe_id: i64,
) -> Result<PipeR1DocumentChecklist, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_or_create_pipe_r1_document_checklist(pipe_id)
        .map_err(|e| format!("Failed to get pipe R1 checklist: {}", e))
}

#[tauri::command]
pub fn update_pipe_r1_document_checklist(
    db: State<'_, DbState>,
    pipe_id: i64,
    update: UpdatePipeR1DocumentChecklistInput,
) -> Result<PipeR1DocumentChecklist, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_pipe_r1_document_checklist(pipe_id, update)
        .map_err(|e| format!("Failed to update pipe R1 checklist: {}", e))
}

#[tauri::command]
pub fn list_pipe_r1_missing_docs_summaries(
    db: State<'_, DbState>,
) -> Result<Vec<PipeR1MissingDocsSummary>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .list_pipe_r1_missing_docs_summaries()
        .map_err(|e| format!("Failed to list pipe R1 missing docs: {}", e))
}

#[tauri::command]
pub fn get_pipe_r3_document_checklist(
    db: State<'_, DbState>,
    pipe_id: i64,
) -> Result<PipeR3DocumentChecklist, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_or_create_pipe_r3_document_checklist(pipe_id)
        .map_err(|e| format!("Failed to get pipe R3 checklist: {}", e))
}

#[tauri::command]
pub fn update_pipe_r3_document_checklist(
    db: State<'_, DbState>,
    pipe_id: i64,
    update: UpdatePipeR3DocumentChecklistInput,
) -> Result<PipeR3DocumentChecklist, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_pipe_r3_document_checklist(pipe_id, update)
        .map_err(|e| format!("Failed to update pipe R3 checklist: {}", e))
}

#[tauri::command]
pub fn list_pipe_r3_missing_docs_summaries(
    db: State<'_, DbState>,
) -> Result<Vec<PipeR3MissingDocsSummary>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .list_pipe_r3_missing_docs_summaries()
        .map_err(|e| format!("Failed to list pipe R3 missing docs: {}", e))
}

#[tauri::command]
pub fn get_pipe_r3_immo_document_checklist(
    db: State<'_, DbState>,
    pipe_id: i64,
) -> Result<PipeR3ImmoDocumentChecklist, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_or_create_pipe_r3_immo_document_checklist(pipe_id)
        .map_err(|e| format!("Failed to get pipe R3 immo checklist: {}", e))
}

#[tauri::command]
pub fn update_pipe_r3_immo_document_checklist(
    db: State<'_, DbState>,
    pipe_id: i64,
    update: UpdatePipeR3ImmoDocumentChecklistInput,
) -> Result<PipeR3ImmoDocumentChecklist, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_pipe_r3_immo_document_checklist(pipe_id, update)
        .map_err(|e| format!("Failed to update pipe R3 immo checklist: {}", e))
}

#[tauri::command]
pub fn get_pipe_by_id(db: State<'_, DbState>, id: i64) -> Result<Pipe, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_pipe_by_id(id)
        .map_err(|e| format!("Failed to get pipe: {}", e))
}

#[tauri::command]
pub fn create_pipe(db: State<'_, DbState>, new_pipe: NewPipe) -> Result<Pipe, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_pipe(new_pipe)
        .map_err(|e| format!("Failed to create pipe: {}", e))
}

#[tauri::command]
pub fn update_pipe(db: State<'_, DbState>, id: i64, update: UpdatePipe) -> Result<Pipe, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_pipe(id, update)
        .map_err(|e| format!("Failed to update pipe: {}", e))
}

#[tauri::command]
pub fn delete_pipe(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_pipe(id)
        .map_err(|e| format!("Failed to delete pipe: {}", e))
}

#[tauri::command]
pub fn list_pipe_timeline_entries(
    db: State<'_, DbState>,
    pipe_id: i64,
) -> Result<Vec<PipeTimelineEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .list_pipe_timeline_entries(pipe_id)
        .map_err(|e| format!("Failed to list pipe timeline: {}", e))
}

#[tauri::command]
pub fn create_pipe_timeline_entry(
    db: State<'_, DbState>,
    entry: NewPipeTimelineEntry,
) -> Result<PipeTimelineEntry, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_pipe_timeline_entry(entry)
        .map_err(|e| format!("Failed to create pipe timeline entry: {}", e))
}

#[tauri::command]
pub fn delete_pipe_timeline_entry(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_pipe_timeline_entry(id)
        .map_err(|e| format!("Failed to delete pipe timeline entry: {}", e))
}

#[tauri::command]
pub fn update_pipe_timeline_milestone_notes(
    db: State<'_, DbState>,
    id: i64,
    contenu: Option<String>,
) -> Result<PipeTimelineEntry, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_pipe_timeline_milestone_notes(id, contenu.as_deref())
        .map_err(|e| format!("Failed to update pipe timeline milestone notes: {}", e))
}

#[tauri::command]
pub fn update_pipe_timeline_entry(
    db: State<'_, DbState>,
    id: i64,
    entry: UpdatePipeTimelineEntry,
) -> Result<PipeTimelineEntry, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_pipe_timeline_entry(id, entry)
        .map_err(|e| format!("Failed to update pipe timeline entry: {}", e))
}

#[tauri::command]
pub fn set_pipe_stage(
    db: State<'_, DbState>,
    id: i64,
    stage: String,
    notes: Option<String>,
    milestone_occurred_at: Option<i64>,
) -> Result<Pipe, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .set_pipe_stage(id, &stage, notes.as_deref(), milestone_occurred_at)
        .map_err(|e| format!("Failed to set pipe stage: {}", e))
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

// ========== TACHES ==========

#[tauri::command]
pub fn get_all_taches(db: State<'_, DbState>) -> Result<Vec<Tache>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_all_taches_with_contact()
        .map_err(|e| format!("Failed to get taches: {}", e))
}

#[tauri::command]
pub fn get_taches_by_contact(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<Tache>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_taches_by_contact(contact_id)
        .map_err(|e| format!("Failed to get taches by contact: {}", e))
}

#[tauri::command]
pub fn create_tache(db: State<'_, DbState>, new_tache: NewTache) -> Result<Tache, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .create_tache(new_tache)
        .map_err(|e| format!("Failed to create tache: {}", e))
}

#[tauri::command]
pub fn update_tache(db: State<'_, DbState>, id: i64, tache: NewTache) -> Result<Tache, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .update_tache(id, &tache)
        .map_err(|e| format!("Failed to update tache: {}", e))
}

#[tauri::command]
pub fn set_tache_statut(
    db: State<'_, DbState>,
    id: i64,
    statut: String,
) -> Result<SetTacheStatutResult, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .set_tache_statut(id, &statut)
        .map_err(|e| format!("Failed to update tache statut: {}", e))
}

#[tauri::command]
pub fn delete_tache(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_tache(id)
        .map_err(|e| format!("Failed to delete tache: {}", e))
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
pub fn get_documents_by_contact(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<Document>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_documents_by_contact(contact_id)
        .map_err(|e| format!("Failed to get documents: {}", e))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentResult {
    pub document: Document,
    pub onedrive_message: Option<String>,
}

#[tauri::command]
pub fn create_document(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    mut new_document: NewDocument,
) -> Result<CreateDocumentResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data introuvable : {e}"))?;
    let team_mode = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .get_workspace_config()
            .map_err(|e| format!("Failed to get workspace config: {e}"))?
            .mode
            .is_team()
    };
    let source = std::path::Path::new(&new_document.chemin_fichier);
    let (stored_path, size) = if team_mode {
        crate::documents_storage::ensure_team_document_stored(&app_data_dir, source)
    } else {
        crate::documents_storage::ensure_document_stored(
            &app_data_dir,
            source,
            new_document.contact_id,
            true,
        )
    }
    .map_err(|e| format!("Impossible de stocker le document : {e}"))?;
    new_document.chemin_fichier = stored_path.to_string_lossy().into_owned();
    new_document.taille_fichier = size as i64;

    let document = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .create_document(new_document)
            .map_err(|e| format!("Failed to create document: {}", e))?
    };

    crate::client_onedrive::background::spawn_onedrive_document_copy_background(
        app.clone(),
        document.id,
    );

    Ok(CreateDocumentResult {
        document,
        onedrive_message: None,
    })
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
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    id: i64,
    document: NewDocument,
) -> Result<Document, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data introuvable : {e}"))?;

    let (existing, contact_changed, team_mode) = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        let existing = database
            .get_document_by_id(id)
            .map_err(|e| format!("Failed to get document: {}", e))?;
        let contact_changed = existing.contact_id != document.contact_id;
        let team_mode = database
            .get_workspace_config()
            .map_err(|e| format!("Failed to get workspace config: {e}"))?
            .mode
            .is_team();
        (existing, contact_changed, team_mode)
    };

    let mut file_relocation: Option<(std::path::PathBuf, u64)> = None;
    let mut previous_managed_path: Option<String> = None;

    if contact_changed && !team_mode {
        let source = std::path::Path::new(&existing.chemin_fichier);
        if !source.is_file() {
            return Err(format!(
                "Impossible de déplacer le document : fichier introuvable ({})",
                existing.chemin_fichier
            ));
        }
        let (stored_path, size) = crate::documents_storage::ensure_document_stored(
            &app_data_dir,
            source,
            document.contact_id,
            false,
        )
        .map_err(|e| format!("Impossible de déplacer le document : {e}"))?;
        if stored_path != source {
            previous_managed_path = Some(existing.chemin_fichier.clone());
        }
        file_relocation = Some((stored_path, size));
    }

    let relocation_for_db = file_relocation
        .as_ref()
        .map(|(path, size)| (path.to_string_lossy().into_owned(), *size as i64));

    let updated = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .update_document(
                id,
                &document,
                relocation_for_db
                    .as_ref()
                    .map(|(path, size)| (path.as_str(), *size)),
            )
            .map_err(|e| format!("Failed to update document: {}", e))?
    };

    if let Some(old_path) = previous_managed_path {
        let old = std::path::Path::new(&old_path);
        if old.is_file() {
            let _ = crate::documents_storage::delete_managed_document_file(&app_data_dir, old);
        }
    }

    Ok(updated)
}

#[tauri::command]
pub fn delete_document(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    id: i64,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data introuvable : {e}"))?;

    let chemin_fichier = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .get_document_by_id(id)
            .map_err(|e| format!("Failed to get document: {}", e))?
            .chemin_fichier
    };

    {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .delete_document(id)
            .map_err(|e| format!("Failed to delete document: {}", e))?;
    }

    if let Err(e) = crate::documents_storage::delete_managed_document_file(
        &app_data_dir,
        std::path::Path::new(&chemin_fichier),
    ) {
        eprintln!("⚠️ Suppression fichier document : {e}");
    }

    Ok(())
}

#[tauri::command]
pub fn discard_staged_document(
    app: tauri::AppHandle,
    session: State<'_, UiSessionState>,
    file_path: String,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data introuvable : {e}"))?;
    crate::documents_storage::discard_staged_document_file(
        &app_data_dir,
        std::path::Path::new(&file_path),
    )
    .map_err(|e| format!("Impossible de supprimer le fichier temporaire : {e}"))
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

#[tauri::command]
pub fn get_template_email_action(
    db: State<'_, DbState>,
    template_id: i64,
) -> Result<Option<TemplateEmailAction>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_template_email_action(template_id)
        .map_err(|e| format!("Failed to get template email action: {}", e))
}

#[tauri::command]
pub fn set_template_email_action(
    db: State<'_, DbState>,
    action: TemplateEmailAction,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .set_template_email_action(&action)
        .map_err(|e| format!("Failed to save template email action: {}", e))
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
pub fn delete_template_email(
    app: AppHandle,
    db: State<'_, DbState>,
    id: i64,
) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Répertoire applicatif introuvable : {e}"))?;
    crate::template_email_attachments::delete_all_template_attachments(&app_data, id)
        .map_err(|e| format!("Nettoyage pièces jointes : {e}"))?;

    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .delete_template_email(id)
        .map_err(|e| format!("Failed to delete template: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn import_template_email_attachment_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    template_id: i64,
    source_path: String,
) -> Result<crate::template_email_attachments::TemplateEmailAttachmentRecord, String> {
    require_ui_session(&session)?;
    let source = crate::secure_files::require_scoped_file(&app, &source_path)?;
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let tpl = database
        .get_template_email_by_id(template_id)
        .map_err(|_| format!("Modèle email {template_id} introuvable."))?;
    let existing_count = crate::template_email_attachments::parse_attachments_from_variables(
        tpl.variables.as_deref(),
    )
    .len();

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Répertoire applicatif introuvable : {e}"))?;
    crate::template_email_attachments::import_template_attachment(
        &app_data,
        template_id,
        &source,
        existing_count,
    )
}

#[tauri::command]
pub fn remove_template_email_attachment_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
    template_id: i64,
    stored_name: String,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let _database = db_guard.as_ref().ok_or("Database not initialized")?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Répertoire applicatif introuvable : {e}"))?;
    crate::template_email_attachments::remove_template_attachment(
        &app_data,
        template_id,
        &stored_name,
    )
}

#[tauri::command]
pub fn copy_template_email_attachments_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
    from_template_id: i64,
    to_template_id: i64,
) -> Result<Vec<crate::template_email_attachments::TemplateEmailAttachmentRecord>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let tpl = database
        .get_template_email_by_id(from_template_id)
        .map_err(|_| format!("Modèle source {from_template_id} introuvable."))?;
    let source_records = crate::template_email_attachments::parse_attachments_from_variables(
        tpl.variables.as_deref(),
    );

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Répertoire applicatif introuvable : {e}"))?;
    crate::template_email_attachments::copy_template_attachments(
        &app_data,
        from_template_id,
        to_template_id,
        &source_records,
    )
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

#[tauri::command]
pub fn preview_ephemeral_campaign_audience(
    db: State<'_, DbState>,
    template_id: i64,
) -> Result<crate::database::ephemeral_email_campaigns::EphemeralCampaignAudiencePreview, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .preview_ephemeral_campaign_audience(template_id)
        .map_err(|e| format!("Failed to preview ephemeral campaign audience: {}", e))
}

#[tauri::command]
pub fn sync_ephemeral_campaign_queue(
    db: State<'_, DbState>,
    template_id: i64,
) -> Result<crate::database::ephemeral_email_campaigns::SyncEphemeralCampaignResult, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .sync_ephemeral_campaign_queue(template_id)
        .map_err(|e| format!("Failed to sync ephemeral campaign queue: {}", e))
}

#[tauri::command]
pub fn archive_ephemeral_campaign(db: State<'_, DbState>, template_id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .archive_ephemeral_campaign(template_id)
        .map_err(|e| format!("Failed to archive ephemeral campaign: {}", e))
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
pub fn get_app_notifications_summary(
    db: State<'_, DbState>,
) -> Result<crate::database::notifications_summary::AppNotificationsSummaryDto, String> {
    let stellium =
        crate::email::stellium_exceltis::get_stellium_exceltis_signals(&db).unwrap_or_default();
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_app_notifications_summary(stellium)
        .map_err(|e| format!("Failed to get notifications summary: {}", e))
}

#[tauri::command]
pub fn get_tray_digest_snapshot(
    db: State<'_, DbState>,
) -> Result<crate::database::notifications_summary::TrayDigestSnapshotDto, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_tray_digest_snapshot()
        .map_err(|e| format!("Failed to get tray digest: {}", e))
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
pub fn snooze_alerte(db: State<'_, DbState>, id: i64, days: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    if days <= 0 || days > 365 {
        return Err("Durée de snooze invalide".to_string());
    }
    database
        .snooze_alerte(id, days)
        .map_err(|e| format!("Failed to snooze alerte: {}", e))
}

#[tauri::command]
pub fn count_alertes_traitees_depuis(db: State<'_, DbState>, since_ts: i64) -> Result<i64, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .count_alertes_traitees_depuis(since_ts)
        .map_err(|e| format!("Failed to count treated alertes: {}", e))
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
    period_start: Option<i64>,
    period_end: Option<i64>,
    bucket: Option<String>,
) -> Result<Vec<YearlyActivityStats>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_yearly_activity_stats(period_start, period_end, bucket.as_deref())
        .map_err(|e| format!("Failed to get yearly activity stats: {}", e))
}

#[tauri::command]
pub fn get_activity_period_summary(
    db: State<'_, DbState>,
    period_start: i64,
    period_end: i64,
) -> Result<ActivityPeriodSummary, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_activity_period_summary(period_start, period_end)
        .map_err(|e| format!("Failed to get activity period summary: {}", e))
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
pub fn get_conversion_client_stats(
    db: State<'_, DbState>,
    period_start: Option<i64>,
    period_end: Option<i64>,
) -> Result<ConversionClientStats, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_conversion_client_stats(period_start, period_end)
        .map_err(|e| format!("Failed to get conversion client stats: {}", e))
}

#[tauri::command]
pub fn get_conversion_filleul_stats(
    db: State<'_, DbState>,
    period_start: Option<i64>,
    period_end: Option<i64>,
) -> Result<ConversionFilleulStats, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_conversion_filleul_stats(period_start, period_end)
        .map_err(|e| format!("Failed to get conversion filleul stats: {}", e))
}

fn validate_conversion_client_segment(segment: &str) -> Result<(), String> {
    if matches!(segment, "r1" | "signatures" | "portfolio") {
        Ok(())
    } else {
        Err(format!("Segment conversion client invalide: {segment}"))
    }
}

fn validate_conversion_filleul_segment(segment: &str) -> Result<(), String> {
    if matches!(segment, "invites" | "presents" | "convertis") {
        Ok(())
    } else {
        Err(format!("Segment conversion filleul invalide: {segment}"))
    }
}

fn validate_activity_bucket(bucket: Option<&str>) -> Result<(), String> {
    match bucket {
        None | Some("year") | Some("month") | Some("day") => Ok(()),
        Some(value) => Err(format!("Granularité activité invalide: {value}")),
    }
}

#[tauri::command]
pub fn get_activity_bucket_contacts(
    db: State<'_, DbState>,
    period_start: i64,
    period_end: i64,
    bucket_key: String,
    bucket: Option<String>,
) -> Result<Vec<DashboardStatContact>, String> {
    validate_activity_bucket(bucket.as_deref())?;
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_activity_bucket_contacts(period_start, period_end, &bucket_key, bucket.as_deref())
        .map_err(|e| format!("Failed to get activity bucket contacts: {}", e))
}

#[tauri::command]
pub fn get_conversion_client_contacts(
    db: State<'_, DbState>,
    period_start: i64,
    period_end: i64,
    segment: String,
) -> Result<Vec<DashboardStatContact>, String> {
    validate_conversion_client_segment(&segment)?;
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_conversion_client_contacts(period_start, period_end, &segment)
        .map_err(|e| format!("Failed to get conversion client contacts: {}", e))
}

#[tauri::command]
pub fn get_conversion_filleul_contacts(
    db: State<'_, DbState>,
    period_start: i64,
    period_end: i64,
    segment: String,
) -> Result<Vec<DashboardStatContact>, String> {
    validate_conversion_filleul_segment(&segment)?;
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_conversion_filleul_contacts(period_start, period_end, &segment)
        .map_err(|e| format!("Failed to get conversion filleul contacts: {}", e))
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
pub fn get_nom_produit_suggestions(
    db: State<'_, DbState>,
    type_produit: String,
    partenaire_id: Option<i64>,
) -> Result<Vec<NomProduitSuggestion>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_nom_produit_suggestions(&type_produit, partenaire_id)
        .map_err(|e| format!("Failed to get nom produit suggestions: {}", e))
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
pub fn get_investissements_by_foyer_contacts(
    db: State<'_, DbState>,
    foyer_id: i64,
) -> Result<Vec<Investissement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_investissements_by_foyer_contacts(foyer_id)
        .map_err(|e| format!("Failed to get investissements by foyer contacts: {}", e))
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
    skip_post_save_hooks: Option<bool>,
) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let inv = database
        .create_investissement(new_investissement)
        .map_err(|e| format!("Failed to create investissement: {}", e))?;
    if !skip_post_save_hooks.unwrap_or(false) {
        let _ = database.sync_auto_etiquettes_after_investissement(
            inv.contact_id,
            inv.foyer_id,
            Some(inv.id),
        );
    }
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
    skip_post_save_hooks: Option<bool>,
) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let inv = database
        .update_investissement(id, &investissement)
        .map_err(|e| format!("Failed to update investissement: {}", e))?;
    if !skip_post_save_hooks.unwrap_or(false) {
        let _ =
            database.sync_auto_etiquettes_after_investissement(inv.contact_id, inv.foyer_id, None);
    }
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
        let _ =
            database.sync_auto_etiquettes_after_investissement(inv.contact_id, inv.foyer_id, None);
    }
    Ok(())
}

#[tauri::command]
pub fn close_investissement(
    db: State<'_, DbState>,
    id: i64,
    payload: CloseInvestissementPayload,
) -> Result<Investissement, String> {
    use chrono::DateTime;

    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let date_cloture = payload.date_cloture.and_then(|date_str| {
        DateTime::parse_from_rfc3339(&date_str)
            .ok()
            .map(|dt| dt.timestamp())
    });

    let inv = database
        .close_investissement(id, date_cloture)
        .map_err(|e| format!("Failed to close investissement: {}", e))?;
    let _ = database.sync_auto_etiquettes_after_investissement(inv.contact_id, inv.foyer_id, None);
    Ok(inv)
}

#[tauri::command]
pub fn reopen_investissement(db: State<'_, DbState>, id: i64) -> Result<Investissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let inv = database
        .reopen_investissement(id)
        .map_err(|e| format!("Failed to reopen investissement: {}", e))?;
    let _ = database.sync_auto_etiquettes_after_investissement(inv.contact_id, inv.foyer_id, None);
    Ok(inv)
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
pub fn ensure_stellium_perf_email_templates(db: State<'_, DbState>) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .ensure_stellium_perf_email_templates()
        .map_err(|e| format!("Failed to ensure Stellium perf templates: {}", e))
}

#[tauri::command]
pub fn discover_stellium_perf_campaign_prepare_input(
    db: State<'_, DbState>,
) -> Result<
    Option<crate::database::stellium_perf_campaigns::DiscoverStelliumPerfCampaignPrepareResponse>,
    String,
> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .discover_stellium_perf_campaign_prepare_input()
        .map_err(|e| format!("Failed to discover Stellium perf campaign input: {}", e))
}

#[tauri::command]
pub fn get_stellium_perf_campaign_dashboard_cmd(
    db: State<'_, DbState>,
) -> Result<crate::database::stellium_perf_dashboard::StelliumPerfCampaignDashboard, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_stellium_perf_campaign_dashboard()
        .map_err(|e| format!("Failed to get Stellium perf campaign dashboard: {}", e))
}

#[tauri::command]
pub fn prepare_stellium_perf_campaign(
    db: State<'_, DbState>,
    input: crate::database::stellium_perf_campaigns::PrepareStelliumPerfCampaignInput,
) -> Result<crate::database::stellium_perf_campaigns::PrepareStelliumPerfCampaignResult, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .prepare_stellium_perf_campaign(input)
        .map_err(|e| format!("Failed to prepare Stellium perf campaign: {}", e))
}

#[tauri::command]
pub fn delete_investissement_valorisation(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_investissement_valorisation(id)
        .map_err(|e| format!("Failed to delete valorisation: {}", e))
}

fn versement_complementaire_type_ok(type_produit: &str) -> bool {
    matches!(
        type_produit,
        "ASSURANCE_VIE" | "PER" | "CONTRAT_CAPITALISATION"
    )
}

#[tauri::command]
pub fn get_versements_by_investissement(
    db: State<'_, DbState>,
    investissement_id: i64,
) -> Result<Vec<InvestissementVersement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_versements_by_investissement(investissement_id)
        .map_err(|e| format!("Failed to get versements: {}", e))
}

#[tauri::command]
pub fn create_investissement_versement(
    db: State<'_, DbState>,
    versement: NewInvestissementVersement,
) -> Result<InvestissementVersement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let inv = database
        .get_investissement_by_id(versement.investissement_id)
        .map_err(|e| format!("Investissement introuvable: {}", e))?;
    if !versement_complementaire_type_ok(&inv.type_produit) {
        return Err(
            "Les versements complémentaires sont réservés à l'assurance vie, au PER et au contrat de capitalisation.".into(),
        );
    }
    if versement.montant <= 0 {
        return Err("Le montant du versement doit être strictement positif.".into());
    }

    database
        .create_investissement_versement(versement)
        .map_err(|e| format!("Failed to create versement: {}", e))
}

#[tauri::command]
pub fn delete_investissement_versement(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_investissement_versement(id)
        .map_err(|e| format!("Failed to delete versement: {}", e))
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
pub fn read_pdf_file(
    app: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    file_path: String,
) -> Result<Vec<u8>, String> {
    use std::fs;

    require_ui_session(&session)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let requested_path = std::path::Path::new(&file_path);
    let managed = crate::documents_storage::validate_document_or_compta_cache_file(
        &app_data_dir,
        &app_cache_dir,
        requested_path,
    )
    .or_else(|initial_error| {
        let document_id =
            crate::workspace::documents::logical_document_id(&file_path).or_else(|| {
                db.lock().ok().and_then(|guard| {
                    guard
                        .as_ref()?
                        .get_document_id_by_path(&file_path)
                        .ok()
                        .flatten()
                })
            });
        document_id
            .ok_or(initial_error)
            .and_then(|id| crate::workspace::documents::ensure_local_document(&app, &db, id))
    })?;
    crate::secure_files::ensure_file_size(&managed, crate::secure_files::MAX_DOCUMENT_BYTES)?;
    fs::read(managed).map_err(|e| format!("Lecture du document impossible : {e}"))
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
pub fn get_etiquette_action(
    db: State<'_, DbState>,
    etiquette_id: i64,
) -> Result<Option<EtiquetteAction>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_etiquette_action(etiquette_id)
        .map_err(|e| format!("Failed to get etiquette action: {}", e))
}

#[tauri::command]
pub fn set_etiquette_action(db: State<'_, DbState>, action: EtiquetteAction) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .set_etiquette_action(&action)
        .map_err(|e| format!("Failed to save etiquette action: {}", e))
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

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkEtiquetteAssignResult {
    pub assigned: u32,
    pub skipped: u32,
    pub taches_created: u32,
}

#[tauri::command]
pub fn attribuer_etiquette_bulk(
    db: State<'_, DbState>,
    contact_ids: Vec<i64>,
    etiquette_id: i64,
) -> Result<BulkEtiquetteAssignResult, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let (assigned, skipped, taches_created) = database
        .attribuer_etiquette_bulk(etiquette_id, contact_ids)
        .map_err(|e| format!("Failed bulk etiquette assign: {e}"))?;

    Ok(BulkEtiquetteAssignResult {
        assigned,
        skipped,
        taches_created,
    })
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
pub async fn check_and_apply_auto_etiquettes(
    app_handle: tauri::AppHandle,
) -> Result<usize, String> {
    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<DbState>();
        let db_guard = db.inner().lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .check_and_apply_auto_etiquettes()
            .map_err(|e| format!("Failed to apply auto etiquettes: {}", e))
    })
    .await
    .map_err(|e| format!("Recalcul interrompu: {}", e))?
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
pub fn get_all_segments_with_count(
    db: State<'_, DbState>,
) -> Result<Vec<SegmentWithCount>, String> {
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
        .contact_matches_segment(&contact, segment_id, None)
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
    let org_self_id = database
        .resolve_organisation_self_contact_id()
        .map_err(|e| format!("Organisation self: {}", e))?;
    let mut out = Vec::new();
    for c in contacts {
        if database
            .contact_matches_segment(&c, segment_id, Some(&org_self_id))
            .map_err(|e| format!("Segment: {}", e))?
        {
            out.push(c);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn get_contacts_matching_rule_json(
    db: State<'_, DbState>,
    rule_json: String,
) -> Result<Vec<Contact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .list_contacts_for_rule_json(&rule_json)
        .map_err(|e| format!("Preview contacts: {}", e))
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
pub fn get_envois_snapshot(
    db: State<'_, DbState>,
    active_status: Option<String>,
) -> Result<crate::database::models::EnvoisSnapshot, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_envois_snapshot(active_status.as_deref())
        .map_err(|e| format!("Failed to get envois snapshot: {}", e))
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
    batch_id: Option<String>,
    send_mode: Option<String>,
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
                batch_id.as_deref(),
                send_mode.as_deref(),
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
            batch_id.as_deref(),
            send_mode.as_deref(),
        )
        .map_err(|e| format!("Failed to mark email sent: {}", e))
}

#[tauri::command]
pub fn log_email_send_error(
    db: State<'_, DbState>,
    contact_id: i64,
    contact_etiquette_id: Option<i64>,
    etiquette_nom: Option<String>,
    template_nom: Option<String>,
    subject: Option<String>,
    error_message: String,
    batch_id: Option<String>,
    send_mode: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let etiquette_id =
        contact_etiquette_id.and_then(|ce_id| database.etiquette_id_for_contact_etiquette(ce_id));
    database
        .insert_email_send_log(
            contact_id,
            contact_etiquette_id,
            etiquette_id,
            etiquette_nom.as_deref(),
            template_nom.as_deref(),
            subject.as_deref(),
            "error",
            Some(error_message.as_str()),
            None,
            batch_id.as_deref(),
            send_mode.as_deref().unwrap_or("individual"),
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_email_send_log(
    db: State<'_, DbState>,
    limit: Option<u32>,
) -> Result<Vec<EmailSendLogEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_email_send_log(limit.unwrap_or(200))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_etiquette_pipeline_actif(
    db: State<'_, DbState>,
    etiquette_id: i64,
    actif: bool,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .set_etiquette_pipeline_actif(etiquette_id, actif)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_etiquette_pipeline_board(
    db: State<'_, DbState>,
    etiquette_id: i64,
) -> Result<EtiquettePipelineBoard, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_etiquette_pipeline_board(etiquette_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_contact_pipeline_status(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    status: String,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .set_contact_pipeline_status(contact_etiquette_id, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_calendar_rdv(
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
    contact_id: i64,
    alerte_id: Option<i64>,
    tache_id: Option<i64>,
    pipe_timeline_entry_id: Option<i64>,
    title: String,
    start_at: i64,
    end_at: i64,
    add_google_meet: Option<bool>,
    visio_link: Option<String>,
    event_location: Option<String>,
    additional_attendee_contact_ids: Option<Vec<i64>>,
) -> Result<CalendarEventEntry, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let extra = additional_attendee_contact_ids.unwrap_or_default();
    crate::email::calendar_ops::create_google_calendar_rdv(
        &app_handle,
        database,
        contact_id,
        alerte_id,
        tache_id,
        pipe_timeline_entry_id,
        &title,
        start_at,
        end_at,
        add_google_meet.unwrap_or(false),
        visio_link.as_deref(),
        event_location.as_deref(),
        &extra,
    )
}

#[tauri::command]
pub fn update_calendar_rdv(
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
    google_event_id: String,
    title: String,
    start_at: i64,
    end_at: i64,
    add_google_meet: Option<bool>,
    visio_link: Option<String>,
    event_location: Option<String>,
    preserve_visio: Option<bool>,
    clear_visio: Option<bool>,
    additional_attendee_contact_ids: Option<Vec<i64>>,
) -> Result<crate::database::models::CalendarRdvSyncDetails, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let extra = additional_attendee_contact_ids.unwrap_or_default();
    crate::email::calendar_ops::update_google_calendar_rdv(
        &app_handle,
        database,
        &google_event_id,
        &title,
        start_at,
        end_at,
        add_google_meet.unwrap_or(false),
        visio_link.as_deref(),
        event_location.as_deref(),
        preserve_visio.unwrap_or(false),
        clear_visio.unwrap_or(false),
        &extra,
    )
}

#[tauri::command]
pub fn cancel_calendar_rdv(
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
    google_event_id: String,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    crate::email::calendar_ops::cancel_google_calendar_rdv(&app_handle, database, &google_event_id)
}

#[tauri::command]
pub async fn sync_calendar_rdv(app_handle: tauri::AppHandle) -> Result<CalendarSyncResult, String> {
    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<DbState>();
        let db_guard = db.inner().lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        crate::email::calendar_ops::sync_calendar_rdv_status(&app, database)
    })
    .await
    .map_err(|e| format!("Sync calendrier interrompu: {}", e))?
}

#[tauri::command]
pub fn get_calendar_events_today(
    db: State<'_, DbState>,
) -> Result<Vec<CalendarEventEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_calendar_events_today()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_google_calendar_week(
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
    week_start_at: i64,
    sync_pipe: Option<bool>,
) -> Result<crate::database::models::AgendaWeekListResult, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    crate::email::calendar_ops::list_google_calendar_week_with_pipe_sync(
        &app_handle,
        database,
        week_start_at,
        sync_pipe.unwrap_or(true),
    )
}

#[tauri::command]
pub fn sync_pipe_google_rdvs(
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
) -> Result<crate::database::models::AgendaGooglePipeSyncResult, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    crate::email::calendar_ops::sync_all_pipe_linked_google_rdvs(&app_handle, database)
}

#[tauri::command]
pub fn mark_pipe_rdv_calendar_cancelled(
    db: State<'_, DbState>,
    timeline_entry_id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .cancel_pipe_rdv_reminder_schedules(timeline_entry_id, None)
        .map_err(|e| e.to_string())?;
    database
        .mark_pipe_rdv_calendar_cancelled(timeline_entry_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn replace_pipe_rdv_reminder_schedules(
    db: State<'_, DbState>,
    input: crate::database::models::ReplacePipeRdvReminderSchedulesInput,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let rows: Vec<crate::database::models::PipeRdvReminderSchedule> = input
        .rows
        .into_iter()
        .map(|r| crate::database::models::PipeRdvReminderSchedule {
            id: 0,
            pipe_timeline_entry_id: input.pipe_timeline_entry_id,
            pipe_id: r.pipe_id,
            contact_id: r.contact_id,
            template_id: r.template_id,
            send_at: r.send_at,
            rdv_at: r.rdv_at,
            rdv_end_at: r.rdv_end_at,
            schedule_kind: r.schedule_kind,
            visio_link: r.visio_link,
            event_location: r.event_location,
        })
        .collect();
    database
        .replace_pipe_rdv_reminder_schedules(input.pipe_timeline_entry_id, &rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_pipe_rdv_reminder_schedules(
    db: State<'_, DbState>,
    pipe_timeline_entry_id: i64,
    schedule_kind: Option<String>,
) -> Result<u32, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .cancel_pipe_rdv_reminder_schedules(pipe_timeline_entry_id, schedule_kind.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_due_pipe_rdv_reminder_schedules(
    db: State<'_, DbState>,
    limit: Option<u32>,
) -> Result<Vec<crate::database::models::PipeRdvReminderSchedule>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let now = chrono::Utc::now().timestamp();
    database
        .list_due_pipe_rdv_reminder_schedules(now, limit.unwrap_or(20))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_pipe_rdv_reminder_schedule_sent(
    db: State<'_, DbState>,
    schedule_id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .mark_pipe_rdv_reminder_schedule_sent(schedule_id)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resolve_pipe_rdv_google_event_id(
    db: State<'_, DbState>,
    timeline_entry_id: i64,
) -> Result<Option<String>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .google_event_id_for_pipe_timeline_entry(timeline_entry_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_pipe_rdv_calendar_event_for_timeline(
    db: State<'_, DbState>,
    timeline_entry_id: i64,
) -> Result<Option<crate::database::models::CalendarEventEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_active_calendar_event_for_pipe_timeline(timeline_entry_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_pipe_timeline_entry(
    db: State<'_, DbState>,
    id: i64,
) -> Result<crate::database::models::PipeTimelineEntry, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_pipe_timeline_entry(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_calendar_rdv_effectue(
    db: State<'_, DbState>,
    event_id: i64,
    contact_id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .mark_calendar_rdv_effectue(event_id, contact_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_email_campaign_responses(
    app_handle: tauri::AppHandle,
) -> Result<crate::email::response_sync::EmailCampaignSyncResult, String> {
    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db_state = app.state::<DbState>();
        let pending = {
            let db_guard = db_state.inner().lock().unwrap();
            let database = db_guard.as_ref().ok_or("Database not initialized")?;
            database
                .list_campaigns_pending_response_check()
                .map_err(|e| e.to_string())?
        };

        crate::email::response_sync::sync_email_campaign_responses(
            &app,
            pending,
            |contact_etiquette_id,
             response_type,
             body,
             gmail_msg,
             subject,
             rdv_at,
             queue_row_kind| {
                let db_guard = db_state.inner().lock().unwrap();
                let database = db_guard.as_ref().ok_or("Database not initialized")?;
                database
                    .mark_email_campaign_response(
                        contact_etiquette_id,
                        response_type,
                        body,
                        gmail_msg,
                        subject,
                        rdv_at,
                        Some(queue_row_kind),
                    )
                    .map_err(|e| e.to_string())
            },
        )
    })
    .await
    .map_err(|e| format!("Sync interrompu: {}", e))?
}

#[tauri::command]
pub fn mark_email_campaign_response(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    response_type: String,
    reponse_body: Option<String>,
    reponse_gmail_message_id: Option<String>,
    rdv_event_at: Option<i64>,
    queue_row_kind: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let kind = queue_row_kind.as_deref();
    let mut rdv_at = rdv_event_at;
    if response_type == "rdv" && rdv_at.is_none() {
        if let Some((email, sent_at)) = database
            .campaign_calendar_lookup(contact_etiquette_id, kind)
            .map_err(|e| e.to_string())?
        {
            rdv_at = crate::email::response_sync::resolve_campaign_rdv_start(
                &app_handle,
                &email,
                sent_at,
            )?;
        }
    }
    database
        .mark_email_campaign_response(
            contact_etiquette_id,
            &response_type,
            reponse_body.as_deref(),
            reponse_gmail_message_id.as_deref(),
            None,
            rdv_at,
            kind,
        )
        .map_err(|e| format!("Failed to mark response: {}", e))
}

#[tauri::command]
pub fn mark_email_campaign_messaging_relance(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    canal: String,
    message: Option<String>,
    queue_row_kind: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .mark_email_campaign_messaging_relance(
            contact_etiquette_id,
            &canal,
            message.as_deref(),
            queue_row_kind.as_deref(),
        )
        .map_err(|e| format!("Failed to mark messaging relance: {}", e))
}

#[tauri::command]
pub fn dismiss_email_campaign_followup(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    queue_row_kind: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .dismiss_email_campaign_followup(contact_etiquette_id, queue_row_kind.as_deref())
        .map_err(|e| format!("Failed to dismiss followup: {}", e))
}

#[tauri::command]
pub fn cancel_pending_email_campaign(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    queue_row_kind: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .cancel_pending_email_campaign(contact_etiquette_id, queue_row_kind.as_deref())
        .map_err(|e| format!("Failed to cancel pending email: {}", e))
}

#[tauri::command]
pub fn restore_pending_email_campaign(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    queue_row_kind: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .restore_pending_email_campaign(contact_etiquette_id, queue_row_kind.as_deref())
        .map_err(|e| format!("Failed to restore pending email: {}", e))
}

#[tauri::command]
pub fn dismiss_cancelled_pending_email_campaign(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    queue_row_kind: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .dismiss_cancelled_pending_email_campaign(contact_etiquette_id, queue_row_kind.as_deref())
        .map_err(|e| format!("Failed to dismiss cancelled pending email: {}", e))
}

#[tauri::command]
pub fn prepare_email_campaign_relance(
    db: State<'_, DbState>,
    contact_etiquette_id: i64,
    queue_row_kind: Option<String>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .prepare_email_campaign_relance(contact_etiquette_id, queue_row_kind.as_deref())
        .map_err(|e| format!("Failed to prepare relance: {}", e))
}

#[tauri::command]
pub fn count_misplaced_sent_campaigns(db: State<'_, DbState>) -> Result<u32, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .count_misplaced_sent_campaigns()
        .map_err(|e| format!("Failed to count misplaced sent campaigns: {}", e))
}

#[tauri::command]
pub fn repair_misplaced_sent_campaigns(db: State<'_, DbState>) -> Result<u32, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .repair_misplaced_sent_campaigns()
        .map_err(|e| format!("Failed to repair misplaced sent campaigns: {}", e))
}

#[tauri::command]
pub async fn scan_stellium_exceltis_emails(
    app_handle: tauri::AppHandle,
) -> Result<crate::email::stellium_exceltis::StelliumExceltisScanResult, String> {
    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<DbState>();
        crate::email::stellium_exceltis::scan_stellium_exceltis_emails(&app, db.inner())
    })
    .await
    .map_err(|e| format!("Scan Stellium interrompu: {}", e))?
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

#[tauri::command]
pub fn reset_stellium_exceltis_dismissed(db: State<'_, DbState>) -> Result<(), String> {
    crate::email::stellium_exceltis::reset_stellium_exceltis_dismissed(&db)
}

// ========== BOX PLACEMENT (opérations partenaire) ==========

#[tauri::command]
pub async fn scan_box_placement_emails(
    app_handle: tauri::AppHandle,
) -> Result<crate::email::box_placement::BoxPlacementScanResult, String> {
    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<DbState>();
        crate::email::box_placement::scan_box_placement_emails(&app, db.inner())
    })
    .await
    .map_err(|e| format!("Scan Box Placement interrompu: {}", e))?
}

#[tauri::command]
pub fn create_placement_operation(
    db: State<'_, DbState>,
    input: crate::database::models::NewPlacementOperation,
) -> Result<crate::database::models::PlacementOperation, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_placement_operation(input)
        .map_err(|e| format!("Échec création opération partenaire: {}", e))
}

#[tauri::command]
pub fn list_placement_operations(
    db: State<'_, DbState>,
    include_archived: Option<bool>,
) -> Result<Vec<crate::database::models::PlacementOperationWithContact>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .list_placement_operations_with_contacts(include_archived.unwrap_or(false))
        .map_err(|e| format!("Échec liste opérations partenaire: {}", e))
}

#[tauri::command]
pub fn list_placement_operations_for_pipe(
    db: State<'_, DbState>,
    pipe_id: i64,
) -> Result<Vec<crate::database::models::PlacementOperation>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .list_placement_operations_for_pipe(pipe_id)
        .map_err(|e| format!("Échec liste opérations pipe: {}", e))
}

#[tauri::command]
pub fn update_placement_operation_status(
    db: State<'_, DbState>,
    id: i64,
    status: String,
) -> Result<crate::database::models::PlacementOperation, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_placement_operation_status(id, &status)
        .map_err(|e| format!("Échec mise à jour statut opération: {}", e))
}

#[tauri::command]
pub fn get_placement_operation(
    db: State<'_, DbState>,
    id: i64,
) -> Result<crate::database::models::PlacementOperation, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_placement_operation_by_id(id)
        .map_err(|e| format!("Opération partenaire introuvable: {}", e))
}

#[tauri::command]
pub fn list_pipe_remuneration_rows(
    db: State<'_, DbState>,
) -> Result<Vec<crate::database::models::PipeRemunerationRow>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .list_pipe_remuneration_rows()
        .map_err(|e| format!("Échec liste rémunération pipe: {}", e))
}

#[tauri::command]
pub fn update_placement_operation_pv_manual(
    db: State<'_, DbState>,
    id: i64,
    pv_manual: Option<f64>,
) -> Result<crate::database::models::PlacementOperation, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_placement_operation_pv_manual(id, pv_manual)
        .map_err(|e| format!("Échec mise à jour PV: {}", e))
}

#[tauri::command]
pub fn mark_placement_partner_resent(
    db: State<'_, DbState>,
    id: i64,
) -> Result<crate::database::models::PlacementOperation, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .mark_placement_partner_resent(id)
        .map_err(|e| format!("Échec marquage renvoi partenaire: {}", e))
}

#[tauri::command]
pub fn dismiss_placement_operation(
    db: State<'_, DbState>,
    id: i64,
) -> Result<crate::database::models::PlacementOperation, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .dismiss_placement_operation(id)
        .map_err(|e| format!("Échec retrait opération partenaire: {}", e))
}

#[tauri::command]
pub fn mark_placement_client_notified(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .mark_placement_client_notified(id)
        .map_err(|e| format!("Échec marquage notification client placement: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn reserve_placement_client_notification(
    db: State<'_, DbState>,
    id: i64,
) -> Result<bool, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .reserve_placement_client_notification(id)
        .map_err(|e| format!("Échec réservation notification client placement: {}", e))
}

#[tauri::command]
pub fn release_placement_client_notification(
    db: State<'_, DbState>,
    id: i64,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .release_placement_client_notification(id)
        .map_err(|e| {
            format!(
                "Échec annulation réservation notification client placement: {}",
                e
            )
        })?;
    Ok(())
}

#[tauri::command]
pub fn get_placement_open_counts_by_pipe(
    db: State<'_, DbState>,
) -> Result<Vec<crate::database::models::PlacementPipeOpenCount>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let map = database
        .get_placement_open_counts_by_pipe()
        .map_err(|e| format!("Échec compteurs placement: {}", e))?;
    Ok(map
        .into_iter()
        .map(|(pipe_id, (unsent, pending, non_conforme))| {
            crate::database::models::PlacementPipeOpenCount {
                pipe_id,
                unsent,
                pending,
                non_conforme,
            }
        })
        .collect())
}

// ========== SETTINGS ==========

fn is_protected_generic_setting_key(key: &str) -> bool {
    matches!(
        key.trim(),
        crate::database::workspace::WORKSPACE_CONFIG_SETTING_KEY
            | crate::licensing::LICENSE_STATE_KEY
            | crate::licensing::LICENSE_LEGACY_MIGRATED_KEY
    )
}

#[cfg(test)]
mod generic_setting_guard_tests {
    use super::is_protected_generic_setting_key;

    #[test]
    fn protects_workspace_and_license_settings_from_generic_ipc() {
        assert!(is_protected_generic_setting_key("workspace_config"));
        assert!(is_protected_generic_setting_key(
            crate::licensing::LICENSE_STATE_KEY
        ));
        assert!(is_protected_generic_setting_key(
            crate::licensing::LICENSE_LEGACY_MIGRATED_KEY
        ));
        assert!(!is_protected_generic_setting_key(
            "pipe.r1_checklist_item_labels"
        ));
    }
}

#[tauri::command]
pub fn get_setting(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    key: String,
) -> Result<Option<String>, String> {
    require_ui_session(&session)?;
    if is_protected_generic_setting_key(&key) {
        return Err("Ce réglage interne n'est pas accessible par l'API générique.".into());
    }
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .get_setting(&key)
        .map_err(|e| format!("Failed to get setting: {}", e))
}

#[tauri::command]
pub fn set_setting(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    key: String,
    value: String,
) -> Result<(), String> {
    require_ui_session(&session)?;
    if is_protected_generic_setting_key(&key) {
        return Err("Ce réglage interne ne peut pas être modifié par l'API générique.".into());
    }
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .set_setting(&key, &value)
        .map_err(|e| format!("Failed to set setting: {}", e))
}

#[tauri::command]
pub fn delete_setting(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    key: String,
) -> Result<(), String> {
    require_ui_session(&session)?;
    if is_protected_generic_setting_key(&key) {
        return Err("Ce réglage interne ne peut pas être supprimé par l'API générique.".into());
    }
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    database
        .delete_setting(&key)
        .map_err(|e| format!("Failed to delete setting: {}", e))
}

#[tauri::command]
pub fn get_all_settings(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<Vec<Setting>, String> {
    require_ui_session(&session)?;
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let mut settings = database
        .get_all_settings()
        .map_err(|e| format!("Failed to get all settings: {}", e))?;
    settings.retain(|setting| !is_protected_generic_setting_key(&setting.key));
    Ok(settings)
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
pub fn save_cgp_config(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    config: CgpConfig,
) -> Result<(), String> {
    require_ui_session(&session)?;
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

fn acquire_team_import_lock(
    app: &AppHandle,
    config: &crate::database::workspace::WorkspaceConfig,
) -> Result<Option<crate::database::workspace::WorkspaceConfig>, String> {
    if !config.mode.is_team() {
        return Ok(None);
    }
    let response = crate::workspace::collaboration::team_acquire_lock_with_ttl(
        app,
        &config,
        "import",
        "contacts",
        900,
    )?;
    if !response.acquired {
        return Err(format!(
            "Un autre poste exécute déjà un import{}.",
            response
                .held_by
                .as_deref()
                .map(|holder| format!(" ({holder})"))
                .unwrap_or_default()
        ));
    }
    Ok(Some(config.clone()))
}

fn release_team_import_lock(
    app: &AppHandle,
    config: &crate::database::workspace::WorkspaceConfig,
) {
    if config.mode.is_team() {
        let _ = crate::workspace::collaboration::team_release_lock(
            app,
            &config,
            "import",
            "contacts",
        );
    }
}

#[tauri::command]
pub fn begin_import_transaction(app: AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    let config = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        database
            .get_workspace_config()
            .map_err(|error| format!("Configuration workspace inaccessible : {error}"))?
    };
    let team_config = acquire_team_import_lock(&app, &config)?;
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let result = database
        .begin_import_transaction()
        .map_err(|e| format!("Failed to begin import transaction: {}", e));
    if result.is_err() {
        drop(db_guard);
        if let Some(config) = team_config.as_ref() {
            release_team_import_lock(&app, config);
        }
    }
    result
}

#[tauri::command]
pub fn commit_import_transaction(app: AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let config = database.get_workspace_config().ok();
    let result = database
        .commit_import_transaction()
        .map_err(|e| format!("Failed to commit import transaction: {}", e));
    drop(db_guard);
    if result.is_ok() {
        if let Some(config) = config.as_ref() {
            release_team_import_lock(&app, config);
        }
    }
    result
}

#[tauri::command]
pub fn rollback_import_transaction(app: AppHandle, db: State<'_, DbState>) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let config = database.get_workspace_config().ok();
    let result = database
        .rollback_import_transaction()
        .map_err(|e| format!("Failed to rollback import transaction: {}", e));
    drop(db_guard);
    if result.is_ok() {
        if let Some(config) = config.as_ref() {
            release_team_import_lock(&app, config);
        }
    }
    result
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
    max_entries: Option<u32>,
) -> Result<Vec<ExchangeHistoryEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_exchange_history_timeline(max_entries.map(|n| n as usize))
        .map_err(|e| format!("Failed to get exchange history: {}", e))
}

#[tauri::command]
pub fn get_exchange_history_timeline_for_contact(
    db: State<'_, DbState>,
    contact_id: i64,
    max_entries: Option<u32>,
) -> Result<Vec<ExchangeHistoryEntry>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_exchange_history_timeline_for_contact(contact_id, max_entries.map(|n| n as usize))
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
    lightweight: Option<bool>,
) -> Result<crate::email::contact_gmail_sync::ContactGmailSyncResult, String> {
    let app = app_handle.clone();
    let lightweight = lightweight.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<DbState>();
        crate::email::contact_gmail_sync::sync_contact_mail_history(
            &app,
            db.inner(),
            contact_id,
            lightweight,
        )
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

// ==================== CHAMPS PERSONNALISÉS ====================

#[tauri::command]
pub fn get_custom_field_defs(
    db: State<'_, DbState>,
    entity: Option<String>,
) -> Result<Vec<CustomFieldDef>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let entity = entity.unwrap_or_else(|| "contact".to_string());
    database
        .get_custom_field_defs(&entity)
        .map_err(|e| format!("Failed to list custom fields: {}", e))
}

#[tauri::command]
pub fn create_custom_field_def(
    db: State<'_, DbState>,
    def: NewCustomFieldDef,
) -> Result<CustomFieldDef, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_custom_field_def(def)
        .map_err(|e| format!("Failed to create custom field: {}", e))
}

#[tauri::command]
pub fn update_custom_field_def(
    db: State<'_, DbState>,
    id: i64,
    def: UpdateCustomFieldDef,
) -> Result<CustomFieldDef, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_custom_field_def(id, &def)
        .map_err(|e| format!("Failed to update custom field: {}", e))
}

#[tauri::command]
pub fn delete_custom_field_def(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .delete_custom_field_def(id)
        .map_err(|e| format!("Failed to delete custom field: {}", e))
}

#[tauri::command]
pub fn get_contact_custom_fields(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<ContactCustomField>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_contact_custom_fields(contact_id)
        .map_err(|e| format!("Failed to get contact custom fields: {}", e))
}

#[tauri::command]
pub fn set_contact_custom_fields(
    db: State<'_, DbState>,
    contact_id: i64,
    values: Vec<CustomFieldValueInput>,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .set_contact_custom_fields(contact_id, values)
        .map_err(|e| format!("Failed to save contact custom fields: {}", e))?;
    // Recalcul incrémental des étiquettes auto (mêmes effets qu'une sauvegarde de fiche :
    // une condition « champ perso » peut poser/retirer une étiquette, donc créer une tâche).
    let _ = database.check_auto_etiquettes_for_contact(contact_id);
    Ok(())
}

#[tauri::command]
pub fn get_all_contact_custom_values(
    db: State<'_, DbState>,
    entity: Option<String>,
) -> Result<Vec<CustomFieldValueRow>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let entity = entity.unwrap_or_else(|| "contact".to_string());
    database
        .get_all_custom_values(&entity)
        .map_err(|e| format!("Failed to list custom values: {}", e))
}

// ========== COMPTABILITÉ ==========

#[tauri::command]
pub fn get_compta_config(db: State<'_, DbState>) -> Result<ComptaConfig, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_compta_config()
        .map_err(|e| format!("Failed to get compta config: {}", e))
}

#[tauri::command]
pub fn save_compta_config(db: State<'_, DbState>, config: ComptaConfig) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .save_compta_config(&config)
        .map_err(|e| format!("Failed to save compta config: {}", e))
}

#[tauri::command]
pub fn get_compta_depenses(
    db: State<'_, DbState>,
    year: i32,
    month: u32,
) -> Result<Vec<ComptaDepense>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_compta_depenses(year, month)
        .map_err(|e| format!("Failed to get compta depenses: {}", e))
}

#[tauri::command]
pub fn create_compta_depense(
    db: State<'_, DbState>,
    depense: NewComptaDepense,
) -> Result<ComptaDepense, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_compta_depense(depense)
        .map_err(|e| format!("Failed to create compta depense: {}", e))
}

#[tauri::command]
pub fn update_compta_depense(
    db: State<'_, DbState>,
    id: i64,
    depense: NewComptaDepense,
) -> Result<ComptaDepense, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_compta_depense(id, &depense)
        .map_err(|e| format!("Failed to update compta depense: {}", e))
}

#[tauri::command]
pub fn delete_compta_depense(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .delete_compta_depense(id)
        .map_err(|e| format!("Failed to delete compta depense: {}", e))
}

#[tauri::command]
pub fn get_compta_encaissements(
    db: State<'_, DbState>,
    year: i32,
    month: u32,
) -> Result<Vec<ComptaEncaissement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_compta_encaissements(year, month)
        .map_err(|e| format!("Failed to get compta encaissements: {}", e))
}

#[tauri::command]
pub fn create_compta_encaissement(
    db: State<'_, DbState>,
    encaissement: NewComptaEncaissement,
) -> Result<ComptaEncaissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_compta_encaissement(encaissement)
        .map_err(|e| format!("Failed to create compta encaissement: {}", e))
}

#[tauri::command]
pub fn update_compta_encaissement(
    db: State<'_, DbState>,
    id: i64,
    encaissement: NewComptaEncaissement,
) -> Result<ComptaEncaissement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_compta_encaissement(id, &encaissement)
        .map_err(|e| format!("Failed to update compta encaissement: {}", e))
}

#[tauri::command]
pub fn delete_compta_encaissement(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .delete_compta_encaissement(id)
        .map_err(|e| format!("Failed to delete compta encaissement: {}", e))
}

#[tauri::command]
pub fn get_compta_deplacements(
    db: State<'_, DbState>,
    year: i32,
    month: u32,
) -> Result<Vec<ComptaDeplacement>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_compta_deplacements(year, month)
        .map_err(|e| format!("Failed to get compta deplacements: {}", e))
}

#[tauri::command]
pub fn create_compta_deplacement(
    db: State<'_, DbState>,
    deplacement: NewComptaDeplacement,
) -> Result<ComptaDeplacement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .create_compta_deplacement(deplacement)
        .map_err(|e| format!("Failed to create compta deplacement: {}", e))
}

#[tauri::command]
pub fn update_compta_deplacement(
    db: State<'_, DbState>,
    id: i64,
    deplacement: NewComptaDeplacement,
) -> Result<ComptaDeplacement, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .update_compta_deplacement(id, &deplacement)
        .map_err(|e| format!("Failed to update compta deplacement: {}", e))
}

#[tauri::command]
pub fn delete_compta_deplacement(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .delete_compta_deplacement(id)
        .map_err(|e| format!("Failed to delete compta deplacement: {}", e))
}

#[tauri::command]
pub fn get_compta_bilan_data(
    db: State<'_, DbState>,
    year: i32,
    evolution_end_year: i32,
    evolution_end_month: u32,
) -> Result<ComptaBilanData, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_compta_bilan_data(year, evolution_end_year, evolution_end_month)
        .map_err(|e| format!("Failed to get compta bilan data: {}", e))
}

#[tauri::command]
pub fn get_compta_closed_months(db: State<'_, DbState>) -> Result<Vec<String>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_compta_closed_months()
        .map_err(|e| format!("Failed to get compta closed months: {}", e))
}

#[tauri::command]
pub fn set_compta_month_closed(
    db: State<'_, DbState>,
    year: i32,
    month: u32,
    closed: bool,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .set_compta_month_closed(year, month, closed)
        .map_err(|e| format!("Failed to set compta month closed: {}", e))
}

#[tauri::command]
pub fn is_compta_month_closed(
    db: State<'_, DbState>,
    year: i32,
    month: u32,
) -> Result<bool, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .is_compta_month_closed(year, month)
        .map_err(|e| format!("Failed to check compta month closed: {}", e))
}

#[tauri::command]
pub fn list_filleul_volume_exercice_labels(db: State<'_, DbState>) -> Result<Vec<String>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .list_filleul_volume_exercice_labels()
        .map_err(|e| format!("Failed to list filleul volume exercice labels: {}", e))
}

#[tauri::command]
pub fn get_filleul_volume_exercices_by_label(
    db: State<'_, DbState>,
    exercice_label: String,
) -> Result<Vec<crate::database::filleul_volumes::FilleulVolumeExercice>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_filleul_volume_exercices_by_label(&exercice_label)
        .map_err(|e| format!("Failed to get filleul volume exercices: {}", e))
}

#[tauri::command]
pub fn get_filleul_volume_exercices_by_contact(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<Vec<crate::database::filleul_volumes::FilleulVolumeExercice>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_filleul_volume_exercices_by_contact(contact_id)
        .map_err(|e| format!("Failed to get filleul volume exercices for contact: {}", e))
}

#[tauri::command]
pub fn exercice_is_closed(db: State<'_, DbState>, exercice_label: String) -> Result<bool, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .exercice_is_closed(&exercice_label)
        .map_err(|e| format!("Failed to check exercice closed: {}", e))
}

#[tauri::command]
pub fn close_filleul_exercice(
    db: State<'_, DbState>,
    input: crate::database::filleul_volumes::CloseFilleulExerciceInput,
) -> Result<(), String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .close_filleul_exercice(input)
        .map_err(|e| format!("Failed to close filleul exercice: {}", e))
}

#[tauri::command]
pub fn import_filleul_volume_exercices(
    db: State<'_, DbState>,
    input: crate::database::filleul_volumes::ImportFilleulVolumeExercicesInput,
) -> Result<usize, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .import_filleul_volume_exercices(input)
        .map_err(|e| format!("Failed to import filleul volume exercices: {}", e))
}

#[tauri::command]
pub fn get_filleul_dossier(
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<crate::database::filleul_dossier::FilleulDossier, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_filleul_dossier(contact_id)
        .map_err(|e| format!("Failed to get filleul dossier: {}", e))
}

#[tauri::command]
pub fn get_filleul_dossiers_by_contact_ids(
    db: State<'_, DbState>,
    contact_ids: Vec<i64>,
) -> Result<Vec<crate::database::filleul_dossier::FilleulDossier>, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .get_filleul_dossiers_by_contact_ids(&contact_ids)
        .map_err(|e| format!("Failed to get filleul dossiers: {}", e))
}

#[tauri::command]
pub fn upsert_filleul_dossier(
    db: State<'_, DbState>,
    input: crate::database::filleul_dossier::UpsertFilleulDossierInput,
) -> Result<crate::database::filleul_dossier::FilleulDossier, String> {
    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    database
        .upsert_filleul_dossier(input)
        .map_err(|e| format!("Failed to upsert filleul dossier: {}", e))
}
