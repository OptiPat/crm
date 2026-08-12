use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::scpi_declaration_store::ScpiDeclarationRow;
use crate::AppState;

const SCPI_TYPES: [&str; 3] = ["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT"];

/// Dix millions d'euros par ligne. Ce n'est pas une protection — ce sont les
/// données du client — mais une faute de frappe passerait sinon sans
/// résistance et polluerait l'historique de valorisations du CRM.
const PLAFOND_CENTIMES: i64 = 1_000_000_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostScpiDeclarationBody {
    pub investissement_id: i64,
    /// Jour civil YYYY-MM-DD.
    pub date: String,
    pub valorisation_centimes: i64,
    pub revenu_percu_centimes: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScpiDeclarationLine {
    pub id: i64,
    pub investissement_id: i64,
    pub date_ts: i64,
    pub valorisation_centimes: i64,
    pub revenu_percu_centimes: Option<i64>,
    pub created_at: i64,
}

impl From<ScpiDeclarationRow> for ScpiDeclarationLine {
    fn from(row: ScpiDeclarationRow) -> Self {
        Self {
            id: row.id,
            investissement_id: row.investissement_id,
            date_ts: row.date_ts,
            valorisation_centimes: row.valorisation_centimes,
            revenu_percu_centimes: row.revenu_percu_centimes,
            created_at: row.created_at,
        }
    }
}

fn is_scpi_type(type_produit: &str) -> bool {
    SCPI_TYPES.contains(&type_produit)
}

fn parse_declaration_date(value: &str) -> Result<i64, String> {
    let trimmed = value.trim();
    let parts: Vec<&str> = trimmed.split('-').collect();
    if parts.len() != 3 {
        return Err("Date invalide".into());
    }
    let year: i32 = parts[0].parse().map_err(|_| "Date invalide".to_string())?;
    let month: u32 = parts[1].parse().map_err(|_| "Date invalide".to_string())?;
    let day: u32 = parts[2].parse().map_err(|_| "Date invalide".to_string())?;
    let date = NaiveDate::from_ymd_opt(year, month, day)
        .ok_or_else(|| "Date invalide".to_string())?;
    let naive = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Date invalide".to_string())?;
    // Minuit UTC, et non minuit du serveur : tout le reste de la chaîne
    // raisonne en jour UTC (unicité journalière du CRM, fusion de
    // l'historique). Sur un serveur réglé sur Paris, le 15 juin deviendrait le
    // 14 et pourrait écraser la valorisation que le cabinet a saisie ce
    // jour-là.
    Ok(Utc.from_utc_datetime(&naive).timestamp())
}

fn start_of_today_utc() -> i64 {
    let today = Utc::now().date_naive();
    Utc.from_utc_datetime(&today.and_hms_opt(0, 0, 0).unwrap())
        .timestamp()
}

fn find_investissement_line<'a>(
    payload: &'a Value,
    investissement_id: i64,
) -> Option<&'a Value> {
    payload
        .get("investissements")?
        .as_array()?
        .iter()
        .find(|line| line.get("id").and_then(|v| v.as_i64()) == Some(investissement_id))
}

fn investissement_eligible(line: &Value) -> bool {
    let type_produit = line
        .get("typeProduit")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let origine = line
        .get("origine")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    origine == "MON_CONSEIL" && is_scpi_type(type_produit)
}

pub fn overlay_scpi_declarations(payload: &mut Value, declarations: &[ScpiDeclarationRow]) {
    if declarations.is_empty() {
        return;
    }

    let mut lines = declarations
        .iter()
        .map(|row| ScpiDeclarationLine::from(row.clone()))
        .collect::<Vec<_>>();
    lines.sort_by(|a, b| b.date_ts.cmp(&a.date_ts));

    if let Some(obj) = payload.as_object_mut() {
        obj.insert(
            "scpiClientDeclarations".to_string(),
            serde_json::to_value(&lines).unwrap_or(Value::Null),
        );
    }

    let Some(investissements) = payload.get_mut("investissements").and_then(|v| v.as_array_mut())
    else {
        return;
    };

    for inv in investissements.iter_mut() {
        let Some(id) = inv.get("id").and_then(|v| v.as_i64()) else {
            continue;
        };
        let mut latest: Option<&ScpiDeclarationRow> = None;
        for decl in declarations {
            if decl.investissement_id != id {
                continue;
            }
            if latest.map(|l| decl.date_ts > l.date_ts).unwrap_or(true) {
                latest = Some(decl);
            }
        }
        let Some(latest) = latest else { continue };
        let existing_encours_date = inv
            .get("encoursDate")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if latest.date_ts < existing_encours_date {
            continue;
        }
        if let Some(obj) = inv.as_object_mut() {
            obj.insert(
                "encoursActuel".to_string(),
                serde_json::json!(latest.valorisation_centimes),
            );
            obj.insert("encoursDate".to_string(), serde_json::json!(latest.date_ts));
            obj.insert(
                "derniereMajClient".to_string(),
                serde_json::json!(latest.created_at),
            );
        }
    }
}

pub async fn post_scpi_declaration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<PostScpiDeclarationBody>,
) -> impl IntoResponse {
    let contact_id = match crate::client_auth::resolve_session(&state, &headers) {
        Ok(id) => id,
        Err(response) => return response,
    };

    match handle_post_scpi_declaration(&state, contact_id, body).await {
        Ok(line) => (StatusCode::OK, Json(line)).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

async fn handle_post_scpi_declaration(
    state: &AppState,
    contact_id: i64,
    body: PostScpiDeclarationBody,
) -> Result<ScpiDeclarationLine, String> {
    if body.valorisation_centimes <= 0 || body.valorisation_centimes > PLAFOND_CENTIMES {
        return Err("Valorisation invalide".into());
    }
    if let Some(revenu) = body.revenu_percu_centimes {
        if revenu < 0 || revenu > PLAFOND_CENTIMES {
            return Err("Revenu perçu invalide".into());
        }
    }

    let date_ts = parse_declaration_date(&body.date)?;
    // Un jour de battement : le client saisit le jour de son fuseau, qui peut
    // être en avance sur celui du serveur en début de nuit. Au-delà, la date
    // est bien dans le futur.
    if date_ts > start_of_today_utc() + 86_400 {
        return Err("La date ne peut pas être dans le futur".into());
    }

    let snapshot = state
        .db
        .get_contact_snapshot(contact_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Patrimoine non synchronisé".to_string())?;

    let line = find_investissement_line(&snapshot.payload, body.investissement_id)
        .ok_or_else(|| "Investissement introuvable".to_string())?;
    if !investissement_eligible(line) {
        return Err("Cet investissement n'est pas modifiable depuis l'espace client".into());
    }

    let nom = line
        .get("nomProduit")
        .and_then(|v| v.as_str())
        .unwrap_or("SCPI")
        .to_string();

    // La photo est déjà chargée : inutile de la relire pour le libellé client.
    let client_label = {
        let prenom = snapshot.payload["contact"]["prenom"].as_str().unwrap_or("");
        let nom_client = snapshot.payload["contact"]["nom"].as_str().unwrap_or("");
        let label = format!("{prenom} {nom_client}").trim().to_string();
        if label.is_empty() {
            format!("Contact {contact_id}")
        } else {
            label
        }
    };

    let id = state
        .db
        .insert_scpi_declaration(
            contact_id,
            body.investissement_id,
            date_ts,
            body.valorisation_centimes,
            body.revenu_percu_centimes,
        )
        .map_err(|e| e.to_string())?;

    let row = ScpiDeclarationRow {
        id,
        contact_id,
        investissement_id: body.investissement_id,
        date_ts,
        valorisation_centimes: body.valorisation_centimes,
        revenu_percu_centimes: body.revenu_percu_centimes,
        created_at: chrono::Utc::now().timestamp(),
    };

    notify_advisor_scpi_declaration(state, &client_label, &nom, &row).await;

    Ok(row.into())
}

async fn notify_advisor_scpi_declaration(
    state: &AppState,
    client_label: &str,
    nom_produit: &str,
    row: &ScpiDeclarationRow,
) {
    let advisor = state.advisor_email.trim();
    if advisor.is_empty() {
        tracing::warn!("Aucune adresse conseiller : déclaration {} non notifiée", row.id);
        return;
    }

    let date_label = chrono::DateTime::from_timestamp(row.date_ts, 0)
        .map(|dt| dt.format("%d/%m/%Y").to_string())
        .unwrap_or_else(|| row.date_ts.to_string());
    let valorisation_euros = row.valorisation_centimes as f64 / 100.0;

    let Some(mailer) = state.mailer.as_ref() else {
        tracing::warn!("Mailer absent — notification conseiller ignorée");
        return;
    };

    // Sans journalisation, une panne d'envoi laisserait le conseiller ignorer
    // qu'un client a déclaré quelque chose, sans la moindre trace.
    if let Err(error) = mailer
        .send_scpi_declaration_received(
            advisor,
            client_label,
            nom_produit,
            &date_label,
            valorisation_euros,
            row.revenu_percu_centimes.map(|c| c as f64 / 100.0),
        )
        .await
    {
        tracing::error!(
            "Notification conseiller impossible (déclaration {}) : {error}",
            row.id
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Une faute de frappe — dix millions au lieu de dix mille — ne doit pas
    /// remonter jusqu'à l'historique de valorisations du CRM.
    /// Le CRM classe ses valorisations par jour UTC. Une date interprétée dans
    /// le fuseau du serveur tomberait la veille et pourrait écraser une
    /// valorisation du cabinet.
    #[test]
    fn declaration_dates_are_utc_midnight() {
        let ts = parse_declaration_date("2026-06-15").unwrap();
        assert_eq!(ts, 1_781_481_600, "15 juin 2026, minuit UTC");
        assert_eq!(
            chrono::DateTime::from_timestamp(ts, 0)
                .unwrap()
                .format("%Y-%m-%d %H:%M")
                .to_string(),
            "2026-06-15 00:00"
        );
        assert!(parse_declaration_date("2026-02-30").is_err());
        assert!(parse_declaration_date("15/06/2026").is_err());
    }

    #[test]
    fn absurd_amounts_are_refused() {
        assert!(PLAFOND_CENTIMES == 1_000_000_000);
        // 10 000 001 € : au-dessus du plafond.
        assert!(1_000_000_100i64 > PLAFOND_CENTIMES);
        // 9 999 999 € : accepté.
        assert!(999_999_900i64 <= PLAFOND_CENTIMES);
    }

    #[test]
    fn overlay_skips_older_declaration_for_encours() {
        let mut payload = json!({
            "investissements": [{
                "id": 5,
                "encoursActuel": 1_000_000,
                "encoursDate": 500
            }]
        });
        let declarations = vec![ScpiDeclarationRow {
            id: 1,
            contact_id: 1,
            investissement_id: 5,
            date_ts: 200,
            valorisation_centimes: 3_000_000,
            revenu_percu_centimes: Some(30_000),
            created_at: 300,
        }];
        overlay_scpi_declarations(&mut payload, &declarations);
        assert_eq!(payload["investissements"][0]["encoursActuel"], 1_000_000);
        assert_eq!(payload["scpiClientDeclarations"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn overlay_updates_encours_from_latest_declaration() {
        let mut payload = json!({
            "investissements": [{
                "id": 5,
                "encoursActuel": 1_000_000,
                "encoursDate": 100
            }]
        });
        let declarations = vec![
            ScpiDeclarationRow {
                id: 1,
                contact_id: 1,
                investissement_id: 5,
                date_ts: 200,
                valorisation_centimes: 3_000_000,
                revenu_percu_centimes: Some(30_000),
                created_at: 300,
            },
        ];
        overlay_scpi_declarations(&mut payload, &declarations);
        assert_eq!(payload["investissements"][0]["encoursActuel"], 3_000_000);
        assert_eq!(payload["scpiClientDeclarations"].as_array().unwrap().len(), 1);
    }
}
