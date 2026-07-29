use super::mistral::{generate_parrainage_script_json, refine_parrainage_script_json};
use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::parrainage_pipe::{
    STAGE_A_CONTACTER, STAGE_CONFIRME, STAGE_INSCRIT, STAGE_PRESENT, STAGE_PRISE_DE_CONTACT,
    STAGE_REFUSE,
};
use crate::newsletter::store::{NewsletterStore, DEFAULT_MISTRAL_MODEL};
use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParrainageScriptContent {
    pub accroche: String,
    pub corps: String,
    pub question_closing: String,
    #[serde(default)]
    pub variante_sms: Option<String>,
    #[serde(default)]
    pub si_objection: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParrainageCoachChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateParrainageScriptInput {
    pub parrainage_pipe_id: i64,
    /// "APPEL" ou "SMS"
    pub canal: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineParrainageScriptInput {
    pub current: ParrainageScriptContent,
    pub message: String,
    #[serde(default)]
    pub history: Vec<ParrainageCoachChatTurn>,
}

fn mistral_api_key(store: &NewsletterStore) -> Result<&str, String> {
    store
        .api_key
        .as_deref()
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| {
            if store.encrypted_api_key_present {
                "Clé API illisible — fermez et rouvrez le CRM avec votre mot de passe maître."
                    .to_string()
            } else {
                "Configurez votre clé API Mistral dans Paramètres → Newsletter.".to_string()
            }
        })
}

/// Filet de sécurité déterministe, indépendant du respect du prompt par le modèle : un script
/// de parrainage MLM ne doit jamais mentionner un produit/vocabulaire patrimonial. On ne bride
/// pas la formulation créative — on bloque juste l'affichage si ça dérape, pour relancer.
const FORBIDDEN_PATRIMOINE_TERMS: &[&str] = &[
    "scpi",
    "placement financier",
    "produit financier",
    "assurance-vie",
    "assurance vie",
    "gestion de patrimoine",
    "conseiller en gestion",
    "patrimonial",
    "patrimoine",
    "portefeuille",
    "défiscalisation",
    "investissement locatif",
    "rendement locatif",
    "épargne",
];

fn find_forbidden_patrimoine_term(content: &ParrainageScriptContent) -> Option<&'static str> {
    let haystack = [
        content.accroche.as_str(),
        content.corps.as_str(),
        content.question_closing.as_str(),
        content.variante_sms.as_deref().unwrap_or(""),
        content.si_objection.as_deref().unwrap_or(""),
    ]
    .join(" ")
    .to_lowercase();

    FORBIDDEN_PATRIMOINE_TERMS
        .iter()
        .find(|term| haystack.contains(*term))
        .copied()
}

fn parse_parrainage_script(raw: &str) -> Result<ParrainageScriptContent, String> {
    let trimmed = raw.trim();
    let json_str = trimmed
        .strip_prefix("```json")
        .and_then(|s| s.strip_suffix("```"))
        .map(str::trim)
        .unwrap_or(trimmed);

    let mut content: ParrainageScriptContent = serde_json::from_str(json_str)
        .map_err(|e| format!("Réponse Mistral illisible : {e}"))?;

    content.accroche = content.accroche.trim().to_string();
    content.corps = content.corps.trim().to_string();
    content.question_closing = content.question_closing.trim().to_string();
    content.variante_sms = content
        .variante_sms
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    content.si_objection = content
        .si_objection
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    if content.accroche.is_empty() || content.corps.is_empty() || content.question_closing.is_empty()
    {
        return Err("Script incomplet renvoyé par Mistral.".into());
    }

    if let Some(term) = find_forbidden_patrimoine_term(&content) {
        return Err(format!(
            "Script rejeté : mention de « {term} » (produit/vocabulaire patrimonial). Ce coach sert au recrutement MLM, pas à la vente — réessayez de générer."
        ));
    }

    Ok(content)
}

fn stage_objectif(stage: &str) -> Result<&'static str, String> {
    match stage {
        STAGE_A_CONTACTER => Ok(
            "SMS de prise de nouvelles pur teasing — ne rien révéler sur le sujet, obtenir un appel (jamais expliquer par SMS)",
        ),
        STAGE_PRISE_DE_CONTACT => Ok(
            "appel : identifier 2-3 frustrations du prospect, partager brièvement son propre déclic sans détailler le métier, proposer la JD, obtenir 2 confirmations séparées (date, puis logistique), terminer en demandant des recommandations autour de lui",
        ),
        STAGE_CONFIRME => Ok("confirmer la présence à la JD/PO et lever les freins pratiques"),
        STAGE_PRESENT => Ok("suite après la JD/PO — ouvrir vers une inscription sans pression"),
        STAGE_REFUSE => Ok("sortie élégante — respecter le refus et laisser la porte ouverte"),
        STAGE_INSCRIT => Err(
            "Ce contact est déjà inscrit — pas de script de prospection à générer.".into(),
        ),
        _ => Err(format!("Étape pipe inconnue : {stage}")),
    }
}

fn format_contact_date(ts: Option<i64>) -> Option<String> {
    let ts = ts?;
    Utc.timestamp_opt(ts, 0)
        .single()
        .map(|dt| dt.format("%d/%m/%Y").to_string())
}

fn jours_depuis(ts: Option<i64>) -> Option<i64> {
    let ts = ts?;
    let now = Utc::now().timestamp();
    let days = (now - ts) / 86_400;
    if days >= 0 {
        Some(days)
    } else {
        None
    }
}

fn build_script_context(
    db: &crate::database::Database,
    parrainage_pipe_id: i64,
    canal: &str,
) -> Result<String, String> {
    let pipe = db
        .get_parrainage_pipe_by_id(parrainage_pipe_id)
        .map_err(|e| format!("Pipe introuvable : {e}"))?;

    let objectif = stage_objectif(&pipe.stage)?;

    let contact = db
        .get_contact_by_id(pipe.contact_id)
        .map_err(|e| format!("Contact introuvable : {e}"))?;

    let registre = contact
        .registre
        .as_deref()
        .filter(|r| !r.is_empty())
        .unwrap_or("VOUS");

    let timeline = db
        .list_parrainage_pipe_timeline_entries(parrainage_pipe_id)
        .unwrap_or_default();

    let historique: Vec<serde_json::Value> = timeline
        .iter()
        .filter(|e| e.entry_type == "AVANCEMENT" || e.entry_type == "CREATION")
        .take(8)
        .map(|e| {
            serde_json::json!({
                "type": e.entry_type,
                "titre": e.titre,
                "date": format_contact_date(Some(e.occurred_at)),
            })
        })
        .collect();

    let dernier_contact = contact.date_dernier_contact_filleul;

    let payload = serde_json::json!({
        "etape": pipe.stage,
        "etapeLibelle": crate::database::parrainage_pipe::parrainage_stage_label(&pipe.stage),
        "objectif": objectif,
        "canal": canal,
        "typeInvitation": pipe.invitation_type,
        "contact": {
            "prenom": contact.prenom,
            "nom": contact.nom,
            "registre": registre,
        },
        "notes": pipe.notes,
        "dernierContactFilleul": format_contact_date(dernier_contact),
        "joursDepuisDernierContact": jours_depuis(dernier_contact),
        "historiquePipe": historique,
    });

    serde_json::to_string_pretty(&payload).map_err(|e| format!("Contexte script : {e}"))
}

#[tauri::command]
pub fn generate_parrainage_script(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    db: State<'_, DbState>,
    input: GenerateParrainageScriptInput,
) -> Result<ParrainageScriptContent, String> {
    require_ui_session(&session)?;
    let store = NewsletterStore::load(&app)?;
    let api_key = mistral_api_key(&store)?;

    let canal = input.canal.trim().to_uppercase();
    if canal != "APPEL" && canal != "SMS" {
        return Err("Canal invalide — utilisez APPEL ou SMS.".into());
    }

    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;
    let context_json = build_script_context(database, input.parrainage_pipe_id, &canal)?;

    let model = if store.model.trim().is_empty() {
        DEFAULT_MISTRAL_MODEL
    } else {
        store.model.as_str()
    };

    let raw = generate_parrainage_script_json(api_key, model, &context_json)?;
    parse_parrainage_script(&raw)
}

#[tauri::command]
pub fn refine_parrainage_script(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    input: RefineParrainageScriptInput,
) -> Result<ParrainageScriptContent, String> {
    require_ui_session(&session)?;
    let store = NewsletterStore::load(&app)?;
    let api_key = mistral_api_key(&store)?;

    let message = input.message.trim();
    if message.is_empty() {
        return Err("Décrivez la modification souhaitée.".into());
    }

    let current_json = serde_json::to_string(&input.current)
        .map_err(|e| format!("Sérialisation script : {e}"))?;

    let history: Vec<(String, String)> = input
        .history
        .iter()
        .map(|t| (t.role.clone(), t.content.clone()))
        .collect();

    let model = if store.model.trim().is_empty() {
        DEFAULT_MISTRAL_MODEL
    } else {
        store.model.as_str()
    };

    let raw = refine_parrainage_script_json(api_key, model, &current_json, message, &history)?;
    parse_parrainage_script(&raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_parrainage_script_accepts_minimal_json() {
        let raw = r#"{"accroche":"Bonjour","corps":"Corps du script","questionClosing":"Êtes-vous disponible ?"}"#;
        let parsed = parse_parrainage_script(raw).unwrap();
        assert_eq!(parsed.accroche, "Bonjour");
        assert_eq!(parsed.corps, "Corps du script");
    }

    #[test]
    fn inscrit_stage_rejects_generation() {
        assert!(stage_objectif(STAGE_INSCRIT).is_err());
    }

    #[test]
    fn parse_parrainage_script_rejects_patrimoine_vocabulary() {
        let raw = r#"{"accroche":"Bonjour","corps":"Je vous propose de découvrir une solution de gestion de patrimoine.","questionClosing":"Ça vous dit ?"}"#;
        let err = parse_parrainage_script(raw).unwrap_err();
        assert!(err.contains("patrimoine"), "message obtenu: {err}");
    }

    #[test]
    fn parse_parrainage_script_accepts_clean_recruitment_script() {
        let raw = r#"{"accroche":"Salut !","corps":"J'anime une soirée découverte sur un projet perso, ça te dit de venir voir ?","questionClosing":"Tu serais dispo jeudi ?"}"#;
        assert!(parse_parrainage_script(raw).is_ok());
    }
}
