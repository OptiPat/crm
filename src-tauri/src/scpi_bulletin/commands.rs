use super::pipeline::{prepare_processed_scpi_bulletin_batch, process_scpi_bulletin_pdfs};
use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::scpi_campaigns::{PrepareScpiCampaignResult, ScpiCampaignDashboard};
use crate::newsletter::store::NewsletterStore;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn get_scpi_campaign_dashboard_cmd(
    db: State<'_, DbState>,
) -> Result<ScpiCampaignDashboard, String> {
    let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
    let database = db_guard.as_ref().ok_or("Base non initialisée")?;
    database
        .get_scpi_campaign_dashboard()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prepare_scpi_bulletins_from_pdfs_cmd(
    app: AppHandle,
    _db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    pdf_paths: Vec<String>,
) -> Result<PrepareScpiCampaignResult, String> {
    require_ui_session(&session)?;
    let store = NewsletterStore::load(&app)?;
    let api_key = store
        .api_key
        .clone()
        .filter(|k| !k.trim().is_empty())
        .ok_or(
            "Clé API Mistral absente — Newsletter → Paramètres → clé Mistral (OCR + résumés SCPI).",
        )?;
    let paths: Vec<String> = pdf_paths
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .map(|path| {
            let canonical = crate::secure_files::require_scoped_file(&app, &path)?;
            let is_pdf = canonical
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("pdf"))
                .unwrap_or(false);
            if !is_pdf {
                return Err("Seuls les bulletins PDF sont autorisés.".to_string());
            }
            crate::secure_files::ensure_file_size(
                &canonical,
                crate::secure_files::MAX_DOCUMENT_BYTES,
            )?;
            Ok(canonical.to_string_lossy().into_owned())
        })
        .collect::<Result<_, String>>()?;

    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Verrou SQLite court : liste des SCPI portefeuille uniquement.
        let portfolio = {
            let db = app_handle.state::<DbState>();
            let db_guard = db.inner().lock().map_err(|_| "Base non accessible.")?;
            let database = db_guard.as_ref().ok_or("Base non initialisée")?;
            database
                .list_scpi_product_names()
                .map_err(|e| format!("Lecture portefeuille SCPI : {e}"))?
        };

        // OCR + Mistral sans mutex — le CRM reste utilisable pendant ce traitement.
        let batch = process_scpi_bulletin_pdfs(&app_handle, &api_key, &paths, &portfolio)?;

        // Verrou SQLite court : écriture file Envois.
        let result = {
            let db = app_handle.state::<DbState>();
            let db_guard = db.inner().lock().map_err(|_| "Base non accessible.")?;
            let database = db_guard.as_ref().ok_or("Base non initialisée")?;
            prepare_processed_scpi_bulletin_batch(&app_handle, database, batch)?
        };

        Ok(result)
    })
    .await
    .map_err(|e| format!("Traitement interrompu : {e}"))?
}
