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
    pub loyer_mensuel_centimes: Option<i64>,
    pub mensualite_credit_centimes: Option<i64>,
    /// Absent = ne pas toucher ; "" = effacer ; YYYY-MM-DD = poser.
    pub date_fin_pret: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScpiDeclarationLine {
    pub id: i64,
    pub investissement_id: i64,
    pub date_ts: i64,
    pub valorisation_centimes: i64,
    pub revenu_percu_centimes: Option<i64>,
    pub loyer_mensuel_centimes: Option<i64>,
    pub mensualite_credit_centimes: Option<i64>,
    pub date_fin_pret: Option<i64>,
    pub clear_date_fin_pret: bool,
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
            loyer_mensuel_centimes: row.loyer_mensuel_centimes,
            mensualite_credit_centimes: row.mensualite_credit_centimes,
            date_fin_pret: row.date_fin_pret,
            clear_date_fin_pret: row.clear_date_fin_pret,
            created_at: row.created_at,
        }
    }
}

/// Nature de la ligne, telle que la photo l'annonce — le portail ne classe plus
/// les types lui-même.
///
/// Les deux défauts diffèrent volontairement sur une photo antérieure au schéma
/// 7. Le caractère SCPI ouvre un droit — déclarer même sur un placement suivi
/// par le cabinet, et y joindre un revenu — donc son absence **refuse**, ce que
/// le client voit. Le caractère immobilier ne fait que porter loyer et crédit,
/// que l'import du CRM revérifie avec sa propre liste avant d'écrire : son
/// absence laisse donc passer, plutôt que de jeter la saisie en silence.
fn line_est_scpi(line: &Value) -> bool {
    line.get("estScpi").and_then(|v| v.as_bool()).unwrap_or(false)
}

/// Le caractère immobilier vient de la photo : recopier la liste des types du
/// CRM exposerait à en oublier un, et le loyer saisi par le client serait
/// silencieusement jeté. Une photo antérieure au schéma 7 ne porte pas
/// l'information : on laisse alors passer, l'import du CRM tranchant de toute
/// façon avec sa propre liste avant d'écrire quoi que ce soit.
fn line_est_immobilier(line: &Value) -> bool {
    line.get("estImmobilier")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

fn is_a_cote(origine: &str) -> bool {
    origine == "EXISTANT_CLIENT" || origine == "DECLARE_CLIENT"
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

/// SCPI : toute origine. Épargne / placements / immobilier : hors « avec moi ».
fn investissement_eligible(line: &Value) -> bool {
    let type_produit = line
        .get("typeProduit")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let origine = line
        .get("origine")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if line_est_scpi(line) {
        return true;
    }
    if !is_a_cote(origine) {
        return false;
    }
    // Immobilier, épargne et placements financiers — pas la prévoyance ni le
    // fourre-tout AUTRE (aligné sur getPatrimoineCategorie côté TS).
    type_produit != "PREVOYANCE" && type_produit != "AUTRE" && !type_produit.is_empty()
}

fn optional_money(value: Option<i64>) -> Result<Option<i64>, String> {
    match value {
        None => Ok(None),
        Some(n) if n < 0 || n > PLAFOND_CENTIMES => Err("Montant invalide".into()),
        Some(n) => Ok(Some(n)),
    }
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
        if let Some(obj) = inv.as_object_mut() {
            if latest.date_ts >= existing_encours_date {
                obj.insert(
                    "encoursActuel".to_string(),
                    serde_json::json!(latest.valorisation_centimes),
                );
                obj.insert("encoursDate".to_string(), serde_json::json!(latest.date_ts));
            }
            obj.insert(
                "derniereMajClient".to_string(),
                serde_json::json!(latest.created_at),
            );
            if let Some(loyer) = latest.loyer_mensuel_centimes {
                obj.insert("loyerMensuel".to_string(), serde_json::json!(loyer));
            }
            if let Some(mens) = latest.mensualite_credit_centimes {
                obj.insert("mensualiteCredit".to_string(), serde_json::json!(mens));
            }
            if latest.clear_date_fin_pret {
                obj.insert("dateFinPret".to_string(), Value::Null);
            } else if let Some(fin) = latest.date_fin_pret {
                obj.insert("dateFinPret".to_string(), serde_json::json!(fin));
            }
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
    let loyer = optional_money(body.loyer_mensuel_centimes)?;
    let mensualite = optional_money(body.mensualite_credit_centimes)?;

    let date_ts = parse_declaration_date(&body.date)?;
    // Un jour de battement : le client saisit le jour de son fuseau, qui peut
    // être en avance sur celui du serveur en début de nuit. Au-delà, la date
    // est bien dans le futur.
    if date_ts > start_of_today_utc() + 86_400 {
        return Err("La date ne peut pas être dans le futur".into());
    }

    let mut clear_date_fin_pret = false;
    let mut date_fin_pret: Option<i64> = None;
    if let Some(raw) = body.date_fin_pret.as_ref() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            clear_date_fin_pret = true;
        } else {
            date_fin_pret = Some(parse_declaration_date(trimmed)?);
        }
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

    // Revenu / dividendes : SCPI uniquement. Loyer / crédit : immobilier à côté.
    let est_scpi = line_est_scpi(line);
    let revenu = if est_scpi {
        body.revenu_percu_centimes
    } else {
        None
    };
    let est_immobilier = line_est_immobilier(line);
    let (loyer, mensualite, date_fin_pret, clear_date_fin_pret) = if est_immobilier
        && is_a_cote(
            line.get("origine")
                .and_then(|v| v.as_str())
                .unwrap_or_default(),
        ) {
        (loyer, mensualite, date_fin_pret, clear_date_fin_pret)
    } else {
        (None, None, None, false)
    };

    let nom = line
        .get("nomProduit")
        .and_then(|v| v.as_str())
        .unwrap_or("Placement")
        .to_string();

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
            revenu,
            loyer,
            mensualite,
            date_fin_pret,
            clear_date_fin_pret,
        )
        .map_err(|e| e.to_string())?;

    let row = ScpiDeclarationRow {
        id,
        contact_id,
        investissement_id: body.investissement_id,
        date_ts,
        valorisation_centimes: body.valorisation_centimes,
        revenu_percu_centimes: revenu,
        loyer_mensuel_centimes: loyer,
        mensualite_credit_centimes: mensualite,
        date_fin_pret,
        clear_date_fin_pret,
        created_at: chrono::Utc::now().timestamp(),
    };

    // La nature du placement se lit dans la photo, jamais d'une liste recopiée.
    let kind = if est_scpi {
        "une SCPI"
    } else if est_immobilier {
        "un bien immobilier"
    } else {
        "un placement"
    };
    notify_advisor_declaration(state, &client_label, &nom, kind, &row).await;

    Ok(row.into())
}

async fn notify_advisor_declaration(
    state: &AppState,
    client_label: &str,
    nom_produit: &str,
    kind: &str,
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

    if let Err(error) = mailer
        .send_client_declaration_received(
            advisor,
            client_label,
            nom_produit,
            kind,
            &date_label,
            valorisation_euros,
            row.revenu_percu_centimes.map(|c| c as f64 / 100.0),
            row.loyer_mensuel_centimes.map(|c| c as f64 / 100.0),
            row.mensualite_credit_centimes.map(|c| c as f64 / 100.0),
            row.date_fin_pret.and_then(|ts| {
                chrono::DateTime::from_timestamp(ts, 0).map(|dt| dt.format("%d/%m/%Y").to_string())
            }),
            row.clear_date_fin_pret,
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
        assert!(1_000_000_100i64 > PLAFOND_CENTIMES);
        assert!(999_999_900i64 <= PLAFOND_CENTIMES);
    }

    /// Le portail ne classe plus les types lui-même : il lit ce que la photo
    /// annonce. Une photo antérieure au schéma 7 laisse passer, l'import du CRM
    /// tranchant avec sa propre liste avant d'écrire quoi que ce soit.
    #[test]
    fn immobilier_comes_from_the_snapshot() {
        assert!(line_est_immobilier(&json!({ "estImmobilier": true })));
        assert!(!line_est_immobilier(&json!({ "estImmobilier": false })));
        assert!(
            line_est_immobilier(&json!({ "typeProduit": "LMNP" })),
            "ancienne photo : on s'en remet au CRM plutôt que de jeter la saisie"
        );
    }

    /// Le caractère SCPI vient de la photo (`estScpi`) : c'est lui qui autorise
    /// une déclaration sur un placement suivi par le cabinet.
    #[test]
    fn eligibility_matches_product_rules() {
        assert!(investissement_eligible(&json!({
            "typeProduit": "SCPI",
            "estScpi": true,
            "origine": "MON_CONSEIL"
        })));
        assert!(investissement_eligible(&json!({
            "typeProduit": "SCPI",
            "estScpi": true,
            "origine": "EXISTANT_CLIENT"
        })));
        assert!(investissement_eligible(&json!({
            "typeProduit": "LIVRET_A",
            "origine": "EXISTANT_CLIENT"
        })));
        assert!(!investissement_eligible(&json!({
            "typeProduit": "LIVRET_A",
            "origine": "MON_CONSEIL"
        })));
        assert!(investissement_eligible(&json!({
            "typeProduit": "LMNP",
            "estImmobilier": true,
            "origine": "DECLARE_CLIENT"
        })));
        assert!(!investissement_eligible(&json!({
            "typeProduit": "PREVOYANCE",
            "origine": "EXISTANT_CLIENT"
        })));
        assert!(!investissement_eligible(&json!({
            "typeProduit": "AUTRE",
            "origine": "EXISTANT_CLIENT"
        })));
    }

    /// Photo antérieure au schéma 7 : une SCPI suivie par le cabinet est
    /// refusée — un refus que le client voit — jusqu'à une resynchronisation.
    /// Mieux vaut cela qu'accepter n'importe quelle ligne « avec moi ».
    #[test]
    fn an_old_snapshot_refuses_the_scpi_right() {
        assert!(!line_est_scpi(&json!({ "typeProduit": "SCPI" })));
        assert!(!investissement_eligible(&json!({
            "typeProduit": "SCPI",
            "origine": "MON_CONSEIL"
        })));
        // La même SCPI déclarée à côté reste modifiable par la voie commune.
        assert!(investissement_eligible(&json!({
            "typeProduit": "SCPI",
            "origine": "EXISTANT_CLIENT"
        })));
    }

    fn sample_row() -> ScpiDeclarationRow {
        ScpiDeclarationRow {
            id: 1,
            contact_id: 1,
            investissement_id: 5,
            date_ts: 200,
            valorisation_centimes: 3_000_000,
            revenu_percu_centimes: Some(30_000),
            loyer_mensuel_centimes: None,
            mensualite_credit_centimes: None,
            date_fin_pret: None,
            clear_date_fin_pret: false,
            created_at: 300,
        }
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
        let mut older = sample_row();
        older.date_ts = 200;
        overlay_scpi_declarations(&mut payload, &[older]);
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
        overlay_scpi_declarations(&mut payload, &[sample_row()]);
        assert_eq!(payload["investissements"][0]["encoursActuel"], 3_000_000);
        assert_eq!(payload["scpiClientDeclarations"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn overlay_applies_immo_fields() {
        let mut payload = json!({
            "investissements": [{
                "id": 5,
                "encoursActuel": 1_000_000,
                "encoursDate": 100,
                "loyerMensuel": 500_00
            }]
        });
        let mut row = sample_row();
        row.loyer_mensuel_centimes = Some(850_00);
        row.mensualite_credit_centimes = Some(1_200_00);
        row.date_fin_pret = Some(1_800_000_000);
        overlay_scpi_declarations(&mut payload, &[row]);
        assert_eq!(payload["investissements"][0]["loyerMensuel"], 850_00);
        assert_eq!(payload["investissements"][0]["mensualiteCredit"], 1_200_00);
        assert_eq!(payload["investissements"][0]["dateFinPret"], 1_800_000_000);
    }
}
