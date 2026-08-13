use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::avoir_catalogue::{
    normaliser_nom_produit, panier_est_immobilier, panier_est_scpi, type_autorise_pour_panier,
};
use crate::avoir_declaration_store::AvoirDeclarationRow;
use crate::avoir_retrait_store::AvoirRetraitRow;
use crate::AppState;

const PLAFOND_CENTIMES: i64 = 1_000_000_000;
const NOM_MIN: usize = 2;
const NOM_MAX: usize = 80;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostAvoirDeclarationBody {
    pub panier: String,
    pub type_produit: String,
    pub nom_produit: String,
    pub valorisation_centimes: i64,
    pub date_souscription: Option<String>,
    pub loyer_mensuel_centimes: Option<i64>,
    pub mensualite_credit_centimes: Option<i64>,
    pub date_fin_pret: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AvoirDeclarationLine {
    pub id: i64,
    pub panier: String,
    pub type_produit: String,
    pub nom_produit: String,
    pub valorisation_centimes: i64,
    pub date_souscription: Option<i64>,
    pub loyer_mensuel_centimes: Option<i64>,
    pub mensualite_credit_centimes: Option<i64>,
    pub date_fin_pret: Option<i64>,
    pub created_at: i64,
}

impl From<AvoirDeclarationRow> for AvoirDeclarationLine {
    fn from(row: AvoirDeclarationRow) -> Self {
        Self {
            id: row.id,
            panier: row.panier,
            type_produit: row.type_produit,
            nom_produit: row.nom_produit,
            valorisation_centimes: row.valorisation_centimes,
            date_souscription: row.date_souscription,
            loyer_mensuel_centimes: row.loyer_mensuel_centimes,
            mensualite_credit_centimes: row.mensualite_credit_centimes,
            date_fin_pret: row.date_fin_pret,
            created_at: row.created_at,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AvoirRetraitLine {
    pub id: i64,
    pub investissement_id: i64,
    pub type_produit: String,
    pub nom_produit: String,
    pub created_at: i64,
}

impl From<AvoirRetraitRow> for AvoirRetraitLine {
    fn from(row: AvoirRetraitRow) -> Self {
        Self {
            id: row.id,
            investissement_id: row.investissement_id,
            type_produit: row.type_produit,
            nom_produit: row.nom_produit,
            created_at: row.created_at,
        }
    }
}

fn parse_civil_date(value: &str) -> Result<i64, String> {
    let trimmed = value.trim();
    let parts: Vec<&str> = trimmed.split('-').collect();
    if parts.len() != 3 {
        return Err("Date invalide".into());
    }
    let year: i32 = parts[0].parse().map_err(|_| "Date invalide".to_string())?;
    let month: u32 = parts[1].parse().map_err(|_| "Date invalide".to_string())?;
    let day: u32 = parts[2].parse().map_err(|_| "Date invalide".to_string())?;
    let date =
        NaiveDate::from_ymd_opt(year, month, day).ok_or_else(|| "Date invalide".to_string())?;
    let naive = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Date invalide".to_string())?;
    Ok(Utc.from_utc_datetime(&naive).timestamp())
}

fn optional_money(value: Option<i64>) -> Result<Option<i64>, String> {
    match value {
        None => Ok(None),
        Some(n) if n < 0 || n > PLAFOND_CENTIMES => Err("Montant invalide".into()),
        Some(n) => Ok(Some(n)),
    }
}

fn start_of_today_utc() -> i64 {
    let today = Utc::now().date_naive();
    Utc.from_utc_datetime(&today.and_hms_opt(0, 0, 0).unwrap())
        .timestamp()
}

fn snapshot_has_same_line(payload: &Value, type_produit: &str, nom_norm: &str) -> bool {
    let Some(lines) = payload.get("investissements").and_then(|v| v.as_array()) else {
        return false;
    };
    lines.iter().any(|line| {
        let ty = line
            .get("typeProduit")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let nom = line
            .get("nomProduit")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        ty == type_produit && normaliser_nom_produit(nom) == nom_norm
    })
}

pub fn overlay_avoir_declarations(payload: &mut Value, declarations: &[AvoirDeclarationRow]) {
    if declarations.is_empty() {
        return;
    }

    let investissements = match payload.get_mut("investissements").and_then(|v| v.as_array_mut())
    {
        Some(arr) => arr,
        None => {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("investissements".into(), json!([]));
            } else {
                return;
            }
            payload
                .get_mut("investissements")
                .and_then(|v| v.as_array_mut())
                .expect("just inserted")
        }
    };

    for row in declarations {
        let overlay_id = -row.id;
        if investissements
            .iter()
            .any(|line| line.get("id").and_then(|v| v.as_i64()) == Some(overlay_id))
        {
            continue;
        }
        investissements.push(json!({
            "id": overlay_id,
            "typeProduit": row.type_produit,
            "nomProduit": row.nom_produit,
            "montantInitial": row.valorisation_centimes,
            "encoursActuel": row.valorisation_centimes,
            "encoursDate": row.created_at,
            "origine": "DECLARE_CLIENT",
            "estImmobilier": panier_est_immobilier(&row.panier),
            "estScpi": panier_est_scpi(&row.panier),
            "statut": "ACTIF",
            "dateSouscription": row.date_souscription,
            "loyerMensuel": row.loyer_mensuel_centimes,
            "mensualiteCredit": row.mensualite_credit_centimes,
            "dateFinPret": row.date_fin_pret,
            "derniereMajClient": row.created_at,
        }));
    }
}

fn timeline_event_belongs_to(inv_id: i64, event_id: &str) -> bool {
    let prefix = format!("inv-{inv_id}");
    event_id == prefix || event_id.starts_with(&format!("{prefix}-"))
}

fn line_hidden_by_retrait(
    line: &Value,
    hide_ids: &std::collections::HashSet<i64>,
    hide_keys: &std::collections::HashSet<(String, String)>,
) -> bool {
    if let Some(id) = line.get("id").and_then(|v| v.as_i64()) {
        if hide_ids.contains(&id) {
            return true;
        }
        // Overlay client (id < 0) : une redéclaration ne doit pas disparaître
        // derrière le retrait encore en attente d'import.
        if id < 0 {
            return false;
        }
    }
    if line.get("origine").and_then(|v| v.as_str()) != Some("DECLARE_CLIENT") {
        return false;
    }
    let ty = line
        .get("typeProduit")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let nom = line
        .get("nomProduit")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    hide_keys.contains(&(ty.to_string(), normaliser_nom_produit(nom)))
}

pub fn overlay_avoir_retraits(payload: &mut Value, retraits: &[AvoirRetraitRow]) {
    if retraits.is_empty() {
        return;
    }
    let hide_ids: std::collections::HashSet<i64> = retraits
        .iter()
        .map(|row| row.investissement_id)
        .collect();
    let hide_keys: std::collections::HashSet<(String, String)> = retraits
        .iter()
        .map(|row| {
            (
                row.type_produit.clone(),
                normaliser_nom_produit(&row.nom_produit),
            )
        })
        .collect();
    if let Some(lines) = payload.get_mut("investissements").and_then(|v| v.as_array_mut()) {
        lines.retain(|line| !line_hidden_by_retrait(line, &hide_ids, &hide_keys));
    }
    if let Some(timeline) = payload.get_mut("timeline").and_then(|v| v.as_array_mut()) {
        timeline.retain(|event| {
            let Some(id) = event.get("id").and_then(|v| v.as_str()) else {
                return true;
            };
            !hide_ids
                .iter()
                .any(|inv_id| timeline_event_belongs_to(*inv_id, id))
        });
    }
}

fn message_si_declaration_en_conflit(
    payload: &Value,
    retraits: &[AvoirRetraitRow],
    type_produit: &str,
    nom_norm: &str,
) -> Option<&'static str> {
    let mut visible = payload.clone();
    overlay_avoir_retraits(&mut visible, retraits);
    if snapshot_has_same_line(&visible, type_produit, nom_norm) {
        return Some(
            "Ce placement figure déjà dans votre espace — mettez-le à jour depuis sa fiche.",
        );
    }
    None
}

fn snapshot_declare_client_line<'a>(
    payload: &'a Value,
    investissement_id: i64,
) -> Option<&'a Value> {
    let lines = payload.get("investissements").and_then(|v| v.as_array())?;
    lines.iter().find(|line| {
        line.get("id").and_then(|v| v.as_i64()) == Some(investissement_id)
            && line.get("origine").and_then(|v| v.as_str()) == Some("DECLARE_CLIENT")
    })
}

fn snapshot_matching_declare_client_id(
    payload: &Value,
    type_produit: &str,
    nom_norm: &str,
) -> Option<i64> {
    let lines = payload.get("investissements").and_then(|v| v.as_array())?;
    lines.iter().find_map(|line| {
        if line.get("origine").and_then(|v| v.as_str()) != Some("DECLARE_CLIENT") {
            return None;
        }
        let id = line.get("id").and_then(|v| v.as_i64()).filter(|id| *id > 0)?;
        let ty = line
            .get("typeProduit")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let nom = line
            .get("nomProduit")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if ty == type_produit && normaliser_nom_produit(nom) == nom_norm {
            Some(id)
        } else {
            None
        }
    })
}

pub async fn post_avoir_declaration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<PostAvoirDeclarationBody>,
) -> impl IntoResponse {
    let contact_id = match crate::client_auth::resolve_session(&state, &headers) {
        Ok(id) => id,
        Err(response) => return response,
    };

    match handle_post_avoir_declaration(&state, contact_id, body).await {
        Ok(line) => (StatusCode::OK, Json(line)).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

async fn handle_post_avoir_declaration(
    state: &AppState,
    contact_id: i64,
    body: PostAvoirDeclarationBody,
) -> Result<AvoirDeclarationLine, String> {
    let panier = body.panier.trim().to_string();
    let type_produit = body.type_produit.trim().to_string();
    if !type_autorise_pour_panier(&panier, &type_produit) {
        return Err("Type de produit invalide".into());
    }
    if body.valorisation_centimes <= 0 || body.valorisation_centimes > PLAFOND_CENTIMES {
        return Err("Valorisation invalide".into());
    }
    let nom = body.nom_produit.trim().split_whitespace().collect::<Vec<_>>().join(" ");
    if nom.chars().count() < NOM_MIN || nom.chars().count() > NOM_MAX {
        return Err("Nom du produit invalide".into());
    }
    let nom_norm = normaliser_nom_produit(&nom);

    let mut date_souscription = None;
    if let Some(raw) = body.date_souscription.as_ref() {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let ts = parse_civil_date(trimmed)?;
            if ts > start_of_today_utc() + 86_400 {
                return Err("La date ne peut pas être dans le futur".into());
            }
            date_souscription = Some(ts);
        }
    }

    let (loyer, mensualite, date_fin_pret) = if panier_est_immobilier(&panier) {
        let loyer = optional_money(body.loyer_mensuel_centimes)?;
        let mensualite = optional_money(body.mensualite_credit_centimes)?;
        let mut date_fin_pret = None;
        if let Some(raw) = body.date_fin_pret.as_ref() {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                date_fin_pret = Some(parse_civil_date(trimmed)?);
            }
        }
        (loyer, mensualite, date_fin_pret)
    } else {
        (None, None, None)
    };

    let snapshot = state
        .db
        .get_contact_snapshot(contact_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Patrimoine non synchronisé".to_string())?;

    let snapshot_payload = snapshot.payload;
    let retraits = state
        .db
        .list_avoir_retraits_for_contact(contact_id)
        .unwrap_or_default();
    if let Some(message) =
        message_si_declaration_en_conflit(&snapshot_payload, &retraits, &type_produit, &nom_norm)
    {
        return Err(message.into());
    }

    let id = state
        .db
        .insert_avoir_declaration(
            contact_id,
            &panier,
            &type_produit,
            &nom,
            &nom_norm,
            body.valorisation_centimes,
            date_souscription,
            loyer,
            mensualite,
            date_fin_pret,
        )
        .map_err(|e| e.to_string())?;

    let created_at = chrono::Utc::now().timestamp();
    let row = AvoirDeclarationRow {
        id,
        contact_id,
        panier: panier.clone(),
        type_produit: type_produit.clone(),
        nom_produit: nom.clone(),
        valorisation_centimes: body.valorisation_centimes,
        date_souscription,
        loyer_mensuel_centimes: loyer,
        mensualite_credit_centimes: mensualite,
        date_fin_pret,
        created_at,
    };

    let kind = if panier_est_scpi(&panier) {
        "une SCPI"
    } else if panier_est_immobilier(&panier) {
        "un bien immobilier"
    } else {
        "un placement"
    };
    notify_advisor_avoir(state, contact_id, &snapshot_payload, &nom, kind, &row).await;

    Ok(row.into())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostAvoirRetraitBody {
    pub investissement_id: i64,
}

pub async fn post_avoir_retrait(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<PostAvoirRetraitBody>,
) -> impl IntoResponse {
    let contact_id = match crate::client_auth::resolve_session(&state, &headers) {
        Ok(id) => id,
        Err(response) => return response,
    };

    match handle_post_avoir_retrait(&state, contact_id, body.investissement_id).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

#[derive(Debug)]
struct AvoirRetraitApplied {
    nom_produit: String,
    type_produit: String,
    notify: bool,
}

fn apply_avoir_retrait(
    db: &crate::db::PortalDb,
    contact_id: i64,
    payload: &Value,
    investissement_id: i64,
) -> Result<AvoirRetraitApplied, String> {
    if investissement_id < 0 {
        let declaration_id = -investissement_id;
        let row = db
            .get_pending_avoir_declaration(contact_id, declaration_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Cette déclaration n'est plus en attente".to_string())?;
        let mut notify = true;
        if let Some(crm_id) = snapshot_matching_declare_client_id(
            payload,
            &row.type_produit,
            &normaliser_nom_produit(&row.nom_produit),
        ) {
            let (_id, created) = db
                .insert_avoir_retrait(contact_id, crm_id, &row.type_produit, &row.nom_produit)
                .map_err(|e| e.to_string())?;
            notify = created;
        }
        let _ = db
            .cancel_pending_avoir_declaration(contact_id, declaration_id)
            .map_err(|e| e.to_string())?;
        return Ok(AvoirRetraitApplied {
            nom_produit: row.nom_produit,
            type_produit: row.type_produit,
            notify,
        });
    }

    let line = snapshot_declare_client_line(payload, investissement_id).ok_or_else(|| {
        "Seul un avoir que vous avez déclaré peut être retiré".to_string()
    })?;
    let nom = line
        .get("nomProduit")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let ty = line
        .get("typeProduit")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let (_id, created) = db
        .insert_avoir_retrait(contact_id, investissement_id, &ty, &nom)
        .map_err(|e| e.to_string())?;
    let _ = db
        .cancel_pending_avoir_declaration_matching(
            contact_id,
            &ty,
            &normaliser_nom_produit(&nom),
        )
        .map_err(|e| e.to_string())?;
    Ok(AvoirRetraitApplied {
        nom_produit: nom,
        type_produit: ty,
        notify: created,
    })
}

async fn handle_post_avoir_retrait(
    state: &AppState,
    contact_id: i64,
    investissement_id: i64,
) -> Result<(), String> {
    let snapshot = state
        .db
        .get_contact_snapshot(contact_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Patrimoine non synchronisé".to_string())?;

    let applied = apply_avoir_retrait(
        &state.db,
        contact_id,
        &snapshot.payload,
        investissement_id,
    )?;
    if applied.notify {
        notify_advisor_avoir_retire(
            state,
            contact_id,
            &snapshot.payload,
            &applied.nom_produit,
            &applied.type_produit,
        )
        .await;
    }
    Ok(())
}

async fn notify_advisor_avoir_retire(
    state: &AppState,
    contact_id: i64,
    payload: &Value,
    nom_produit: &str,
    type_produit: &str,
) {
    let advisor = state.advisor_email.trim();
    if advisor.is_empty() {
        tracing::warn!("Aucune adresse conseiller : retrait non notifié");
        return;
    }
    let prenom = payload["contact"]["prenom"].as_str().unwrap_or("");
    let nom_client = payload["contact"]["nom"].as_str().unwrap_or("");
    let client_label = {
        let label = format!("{prenom} {nom_client}").trim().to_string();
        if label.is_empty() {
            format!("Contact {contact_id}")
        } else {
            label
        }
    };
    let Some(mailer) = state.mailer.as_ref() else {
        tracing::warn!("Mailer absent — notification conseiller ignorée");
        return;
    };
    if let Err(error) = mailer
        .send_avoir_retire(advisor, &client_label, nom_produit, type_produit)
        .await
    {
        tracing::error!("Notification retrait : {error}");
    }
}

async fn notify_advisor_avoir(
    state: &AppState,
    contact_id: i64,
    payload: &Value,
    nom_produit: &str,
    kind: &str,
    row: &AvoirDeclarationRow,
) {
    let advisor = state.advisor_email.trim();
    if advisor.is_empty() {
        tracing::warn!("Aucune adresse conseiller : avoir {} non notifié", row.id);
        return;
    }
    let prenom = payload["contact"]["prenom"].as_str().unwrap_or("");
    let nom_client = payload["contact"]["nom"].as_str().unwrap_or("");
    let client_label = {
        let label = format!("{prenom} {nom_client}").trim().to_string();
        if label.is_empty() {
            format!("Contact {contact_id}")
        } else {
            label
        }
    };
    let Some(mailer) = state.mailer.as_ref() else {
        tracing::warn!("Mailer absent — notification conseiller ignorée");
        return;
    };
    let valorisation_euros = row.valorisation_centimes as f64 / 100.0;
    if let Err(error) = mailer
        .send_avoir_declared(
            advisor,
            &client_label,
            nom_produit,
            kind,
            valorisation_euros,
            row.loyer_mensuel_centimes.map(|c| c as f64 / 100.0),
            row.mensualite_credit_centimes.map(|c| c as f64 / 100.0),
            row.date_fin_pret.and_then(|ts| {
                chrono::DateTime::from_timestamp(ts, 0).map(|dt| dt.format("%d/%m/%Y").to_string())
            }),
        )
        .await
    {
        tracing::error!("Notification avoir {id} : {error}", id = row.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn overlay_injects_a_pending_line() {
        let mut payload = json!({ "investissements": [] });
        overlay_avoir_declarations(
            &mut payload,
            &[AvoirDeclarationRow {
                id: 4,
                contact_id: 1,
                panier: "placements".into(),
                type_produit: "PER".into(),
                nom_produit: "Swisslife".into(),
                valorisation_centimes: 12_000_00,
                date_souscription: None,
                loyer_mensuel_centimes: None,
                mensualite_credit_centimes: None,
                date_fin_pret: None,
                created_at: 1_700_000_000,
            }],
        );
        let lines = payload["investissements"].as_array().unwrap();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0]["id"], -4);
        assert_eq!(lines[0]["origine"], "DECLARE_CLIENT");
        assert_eq!(lines[0]["estScpi"], false);
        assert_eq!(lines[0]["nomProduit"], "Swisslife");
    }

    #[test]
    fn overlay_copies_immobilier_credit_fields() {
        let mut payload = json!({ "investissements": [] });
        overlay_avoir_declarations(
            &mut payload,
            &[AvoirDeclarationRow {
                id: 9,
                contact_id: 1,
                panier: "immobilier".into(),
                type_produit: "LMNP".into(),
                nom_produit: "Studio Lyon".into(),
                valorisation_centimes: 180_000_00,
                date_souscription: None,
                loyer_mensuel_centimes: Some(850_00),
                mensualite_credit_centimes: Some(1_200_00),
                date_fin_pret: Some(2_072_736_000),
                created_at: 1_700_000_000,
            }],
        );
        let line = &payload["investissements"][0];
        assert_eq!(line["estImmobilier"], true);
        assert_eq!(line["loyerMensuel"], 850_00);
        assert_eq!(line["mensualiteCredit"], 1_200_00);
        assert_eq!(line["dateFinPret"], 2_072_736_000);
    }

    #[test]
    fn duplicate_name_on_the_snapshot_is_detected() {
        let payload = json!({
            "investissements": [{ "typeProduit": "PER", "nomProduit": "Swisslife" }]
        });
        assert!(snapshot_has_same_line(
            &payload,
            "PER",
            &normaliser_nom_produit("swisslife")
        ));
        assert!(!snapshot_has_same_line(
            &payload,
            "PER",
            &normaliser_nom_produit("Corum")
        ));
    }

    #[test]
    fn timeline_ids_do_not_collide_across_investments() {
        assert!(timeline_event_belongs_to(1, "inv-1"));
        assert!(timeline_event_belongs_to(1, "inv-1-fin_pret"));
        assert!(!timeline_event_belongs_to(1, "inv-10-fin_pret"));
        assert!(!timeline_event_belongs_to(11, "inv-1-fin_pret"));
    }

    #[test]
    fn overlay_hides_a_withdrawn_declared_line() {
        let mut payload = json!({
            "investissements": [
                { "id": 11, "origine": "DECLARE_CLIENT", "nomProduit": "CTO" },
                { "id": 12, "origine": "MON_CONSEIL", "nomProduit": "PER" }
            ]
        });
        overlay_avoir_retraits(
            &mut payload,
            &[AvoirRetraitRow {
                id: 1,
                contact_id: 1,
                investissement_id: 11,
                type_produit: "COMPTE_TITRE".into(),
                nom_produit: "CTO".into(),
                created_at: 1,
            }],
        );
        let lines = payload["investissements"].as_array().unwrap();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0]["id"], 12);
    }

    #[test]
    fn overlay_keeps_a_new_declaration_and_hides_timeline() {
        let mut payload = json!({
            "investissements": [
                { "id": 11, "origine": "DECLARE_CLIENT", "typeProduit": "PER", "nomProduit": "Swisslife" },
                { "id": -4, "origine": "DECLARE_CLIENT", "typeProduit": "PER", "nomProduit": "Swisslife" },
                { "id": 12, "origine": "MON_CONSEIL", "typeProduit": "PER", "nomProduit": "Swisslife" }
            ],
            "timeline": [
                { "id": "inv-11-fin_pret", "kind": "fin_pret" },
                { "id": "inv-12-fin_pret", "kind": "fin_pret" },
                { "id": "echeance-1", "kind": "conseiller" }
            ]
        });
        overlay_avoir_retraits(
            &mut payload,
            &[AvoirRetraitRow {
                id: 1,
                contact_id: 1,
                investissement_id: 11,
                type_produit: "PER".into(),
                nom_produit: "Swisslife".into(),
                created_at: 1,
            }],
        );
        let ids: Vec<i64> = payload["investissements"]
            .as_array()
            .unwrap()
            .iter()
            .map(|line| line["id"].as_i64().unwrap())
            .collect();
        assert_eq!(ids, vec![-4, 12]);
        let timeline: Vec<&str> = payload["timeline"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["id"].as_str().unwrap())
            .collect();
        assert_eq!(timeline, vec!["inv-12-fin_pret", "echeance-1"]);
    }

    #[test]
    fn pending_retrait_does_not_block_a_new_declaration() {
        let payload = json!({
            "investissements": [{
                "id": 11,
                "origine": "DECLARE_CLIENT",
                "typeProduit": "PER",
                "nomProduit": "Swisslife"
            }]
        });
        let retraits = [AvoirRetraitRow {
            id: 1,
            contact_id: 1,
            investissement_id: 11,
            type_produit: "PER".into(),
            nom_produit: "Swisslife".into(),
            created_at: 1,
        }];
        assert!(message_si_declaration_en_conflit(
            &payload,
            &retraits,
            "PER",
            &normaliser_nom_produit("Swisslife"),
        )
        .is_none());
        assert!(message_si_declaration_en_conflit(
            &payload,
            &[],
            "PER",
            &normaliser_nom_produit("Swisslife"),
        )
        .unwrap()
        .contains("déjà"));
        assert!(message_si_declaration_en_conflit(
            &json!({ "investissements": [] }),
            &[],
            "PER",
            &normaliser_nom_produit("Swisslife"),
        )
        .is_none());
    }

    fn sample_payload() -> Value {
        json!({
            "investissements": [{
                "id": 11,
                "origine": "DECLARE_CLIENT",
                "typeProduit": "PER",
                "nomProduit": "Swisslife"
            }]
        })
    }

    #[test]
    fn positive_id_cancels_pending_twin_and_skips_second_notify() {
        let db = crate::db::PortalDb::open(":memory:").unwrap();
        let payload = sample_payload();
        db.insert_avoir_declaration(
            1,
            "placements",
            "PER",
            "Swisslife",
            &normaliser_nom_produit("Swisslife"),
            100,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let first = apply_avoir_retrait(&db, 1, &payload, 11).unwrap();
        assert!(first.notify);
        assert!(db.list_avoir_declarations_for_contact(1).unwrap().is_empty());
        assert_eq!(
            db.list_avoir_retraits_for_contact(1).unwrap()[0].investissement_id,
            11
        );
        let second = apply_avoir_retrait(&db, 1, &payload, 11).unwrap();
        assert!(!second.notify);
        assert_eq!(db.list_avoir_retraits_for_contact(1).unwrap().len(), 1);
    }

    #[test]
    fn cabinet_line_cannot_be_withdrawn() {
        let db = crate::db::PortalDb::open(":memory:").unwrap();
        let payload = json!({
            "investissements": [{
                "id": 11,
                "origine": "MON_CONSEIL",
                "typeProduit": "PER",
                "nomProduit": "Swisslife"
            }]
        });
        let err = apply_avoir_retrait(&db, 1, &payload, 11).unwrap_err();
        assert!(err.contains("déclaré"));
        assert!(db.list_avoir_retraits_for_contact(1).unwrap().is_empty());
    }

    #[test]
    fn negative_id_inserts_retrait_then_cancels_when_crm_twin_exists() {
        let db = crate::db::PortalDb::open(":memory:").unwrap();
        let payload = sample_payload();
        let decl_id = db
            .insert_avoir_declaration(
                1,
                "placements",
                "PER",
                "Swisslife",
                &normaliser_nom_produit("Swisslife"),
                100,
                None,
                None,
                None,
                None,
            )
            .unwrap();
        let applied = apply_avoir_retrait(&db, 1, &payload, -decl_id).unwrap();
        assert!(applied.notify);
        assert!(db.list_avoir_declarations_for_contact(1).unwrap().is_empty());
        assert_eq!(
            db.list_avoir_retraits_for_contact(1).unwrap()[0].investissement_id,
            11
        );
        let err = apply_avoir_retrait(&db, 1, &payload, -decl_id).unwrap_err();
        assert!(err.contains("plus en attente"));
    }

    #[test]
    fn negative_id_without_crm_twin_only_cancels() {
        let db = crate::db::PortalDb::open(":memory:").unwrap();
        let payload = json!({ "investissements": [] });
        let decl_id = db
            .insert_avoir_declaration(
                1,
                "placements",
                "PER",
                "Swisslife",
                &normaliser_nom_produit("Swisslife"),
                100,
                None,
                None,
                None,
                None,
            )
            .unwrap();
        apply_avoir_retrait(&db, 1, &payload, -decl_id).unwrap();
        assert!(db.list_avoir_declarations_for_contact(1).unwrap().is_empty());
        assert!(db.list_avoir_retraits_for_contact(1).unwrap().is_empty());
    }
}
