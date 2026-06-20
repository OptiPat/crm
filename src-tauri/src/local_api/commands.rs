use crate::commands::DbState;
use super::config::{
    get_local_api_settings, regenerate_local_api_token, save_local_api_settings,
    LocalApiSettingsPayload, SETTING_SCPI_N8N_WEBHOOK_URL,
};
use super::{restart_for_app, update_runtime_token};
use crate::database::scpi_campaigns::ScpiCampaignDashboard;
use std::time::Duration;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_local_api_settings_cmd(db: State<'_, DbState>) -> Result<LocalApiSettingsPayload, String> {
    let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
    let database = db_guard.as_ref().ok_or("Base non initialisée")?;
    get_local_api_settings(database)
}

#[tauri::command]
pub fn save_local_api_settings_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
    enabled: bool,
    port: u16,
    scpi_n8n_webhook_url: Option<String>,
) -> Result<LocalApiSettingsPayload, String> {
    let payload = {
        let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
        let database = db_guard.as_ref().ok_or("Base non initialisée")?;
        save_local_api_settings(
            database,
            enabled,
            port,
            scpi_n8n_webhook_url.as_deref(),
        )?
    };
    {
        let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
        let database = db_guard.as_ref().ok_or("Base non initialisée")?;
        restart_for_app(&app, database)?;
    }
    Ok(payload)
}

#[tauri::command]
pub fn regenerate_local_api_token_cmd(
    db: State<'_, DbState>,
) -> Result<LocalApiSettingsPayload, String> {
    let payload = {
        let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
        let database = db_guard.as_ref().ok_or("Base non initialisée")?;
        regenerate_local_api_token(database)?
    };
    // Pas de redémarrage serveur : évite le blocage UI (join thread + mutex DB).
    update_runtime_token(payload.token.clone());
    Ok(payload)
}

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
pub async fn trigger_scpi_n8n_workflow_cmd(
    db: State<'_, DbState>,
) -> Result<String, String> {
    let (url, api_settings) = {
        let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
        let database = db_guard.as_ref().ok_or("Base non initialisée")?;
        let settings = get_local_api_settings(database)?;
        let url = database
            .get_setting(SETTING_SCPI_N8N_WEBHOOK_URL)
            .map_err(|e| e.to_string())?
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                "URL webhook n8n non configurée — Paramètres → Intégrations.".to_string()
            })?;
        (url, settings)
    };

    if !api_settings.enabled {
        return Err(
            "API locale désactivée — Paramètres → Intégrations → activer l'API.".to_string(),
        );
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Client HTTP : {e}"))?;

    let health = client
        .get(&api_settings.health_url)
        .timeout(Duration::from_secs(3))
        .send()
        .await;
    if !matches!(health, Ok(ref r) if r.status().is_success()) {
        return Err(format!(
            "API locale injoignable (port {}) — gardez le CRM ouvert et déverrouillé. \
             n8n a besoin de cette API en fin de workflow pour remplir Suivi → Envois.",
            api_settings.port
        ));
    }

    let response = client
        .post(&url)
        .json(&serde_json::json!({ "source": "patrimoine-crm" }))
        .send()
        .await
        .map_err(|e| format!("Appel n8n impossible : {e}"))?;

    if response.status().is_success() {
        Ok(
            "Workflow n8n déclenché — la file Envois se remplit à la fin (plusieurs minutes)."
                .to_string(),
        )
    } else {
        Err(format!(
            "n8n a répondu {} — vérifiez l'URL webhook et que n8n est démarré.",
            response.status()
        ))
    }
}
