//! Lien extranet par placement — favori https du client, hors sync CRM.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::Value;

use crate::avoir_catalogue::{
    normaliser_nom_produit, panier_accepte_lien_extranet, type_autorise_pour_panier,
};
use crate::avoir_declaration_store::AvoirDeclarationRow;
use crate::extranet_bookmark_store::ExtranetBookmarkRow;
use crate::AppState;

const URL_MAX: usize = 500;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PutExtranetBody {
    pub url: Option<String>,
}

fn normalize_extranet_url(raw: &str) -> Result<Option<String>, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > URL_MAX || trimmed.chars().any(char::is_whitespace) {
        return Err("Adresse invalide".into());
    }
    let candidate = if looks_like_scheme(trimmed) {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let parsed = url::Url::parse(&candidate).map_err(|_| "Adresse invalide".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Seul https:// est accepté".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("N'indiquez pas d'identifiant dans l'adresse".into());
    }
    let host = parsed.host_str().unwrap_or("");
    if host.len() < 3 || !host.contains('.') {
        return Err("Adresse invalide".into());
    }
    let href = parsed.as_str().to_string();
    if href.len() > URL_MAX {
        return Err("Adresse trop longue".into());
    }
    Ok(Some(href))
}

fn looks_like_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    let mut chars = scheme.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-')
}

pub fn line_extranet_eligible(line: &Value) -> bool {
    if line.get("estScpi").and_then(|v| v.as_bool()) == Some(true) {
        return true;
    }
    let t = line
        .get("typeProduit")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    type_autorise_pour_panier("scpi", t)
        || type_autorise_pour_panier("placements", t)
        || type_autorise_pour_panier("epargne", t)
}

fn find_line<'a>(payload: &'a Value, investissement_id: i64) -> Option<&'a Value> {
    payload
        .get("investissements")?
        .as_array()?
        .iter()
        .find(|line| line.get("id").and_then(|v| v.as_i64()) == Some(investissement_id))
}

pub fn overlay_extranet_bookmarks(payload: &mut Value, bookmarks: &[ExtranetBookmarkRow]) {
    if bookmarks.is_empty() {
        return;
    }
    let Some(lines) = payload
        .get_mut("investissements")
        .and_then(|v| v.as_array_mut())
    else {
        return;
    };
    for row in bookmarks {
        if let Some(line) = lines
            .iter_mut()
            .find(|line| line.get("id").and_then(|v| v.as_i64()) == Some(row.investissement_id))
        {
            if let Some(obj) = line.as_object_mut() {
                obj.insert("extranetUrl".into(), Value::String(row.url.clone()));
            }
        }
    }
}

/// Si l'avoir pending a été importé, rattache le favori à l'id CRM.
pub fn rematch_pending_extranet_bookmarks(
    db: &crate::db::PortalDb,
    contact_id: i64,
    payload: &Value,
    pending: &[AvoirDeclarationRow],
    bookmarks: &mut Vec<ExtranetBookmarkRow>,
) {
    let pending_ids: std::collections::HashSet<i64> =
        pending.iter().map(|row| -row.id).collect();
    let mut migrated = Vec::new();
    for row in bookmarks.iter() {
        if row.investissement_id >= 0 {
            continue;
        }
        if pending_ids.contains(&row.investissement_id) {
            continue;
        }
        let Some(new_id) = snapshot_matching_id(
            payload,
            &row.type_produit,
            &row.nom_produit_norm,
        ) else {
            continue;
        };
        if db
            .rematch_extranet_bookmark(contact_id, row.investissement_id, new_id)
            .is_ok()
        {
            migrated.push((row.investissement_id, new_id));
        }
    }
    for (from, to) in migrated {
        if let Some(row) = bookmarks
            .iter_mut()
            .find(|r| r.investissement_id == from)
        {
            row.investissement_id = to;
        }
    }
}

fn snapshot_matching_id(payload: &Value, type_produit: &str, nom_norm: &str) -> Option<i64> {
    let lines = payload.get("investissements").and_then(|v| v.as_array())?;
    lines.iter().find_map(|line| {
        // L'import CRM pose EXISTANT_CLIENT (jamais DECLARE_CLIENT).
        let origine = line.get("origine").and_then(|v| v.as_str()).unwrap_or("");
        if origine != "DECLARE_CLIENT" && origine != "EXISTANT_CLIENT" {
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

pub fn save_extranet_for_declaration(
    db: &crate::db::PortalDb,
    contact_id: i64,
    declaration_id: i64,
    panier: &str,
    type_produit: &str,
    nom_produit: &str,
    raw_url: Option<&str>,
) -> Result<(), String> {
    let Some(url) = validated_extranet_url(panier, raw_url)? else {
        return Ok(());
    };
    db.upsert_extranet_bookmark(
        contact_id,
        -declaration_id,
        &url,
        type_produit,
        &normaliser_nom_produit(nom_produit),
    )
    .map_err(|e| e.to_string())
}

pub fn validated_extranet_url(
    panier: &str,
    raw_url: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(raw) = raw_url.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    if !panier_accepte_lien_extranet(panier) {
        return Err("Pas de lien extranet pour cette catégorie".into());
    }
    normalize_extranet_url(raw)
}

pub async fn put_extranet_bookmark(
    State(state): State<AppState>,
    Path(investissement_id): Path<i64>,
    headers: HeaderMap,
    Json(body): Json<PutExtranetBody>,
) -> impl IntoResponse {
    let contact_id = match crate::client_auth::resolve_session(&state, &headers) {
        Ok(id) => id,
        Err(response) => return response,
    };
    match handle_put(&state, contact_id, investissement_id, body.url.as_deref()) {
        Ok(url) => (
            StatusCode::OK,
            Json(serde_json::json!({ "url": url })),
        )
            .into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_put(
    state: &AppState,
    contact_id: i64,
    investissement_id: i64,
    raw_url: Option<&str>,
) -> Result<Option<String>, String> {
    if investissement_id == 0 {
        return Err("Placement introuvable".into());
    }
    let url = normalize_extranet_url(raw_url.unwrap_or(""))?;

    let snapshot = state
        .db
        .get_contact_snapshot(contact_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Patrimoine non synchronisé".to_string())?;
    let mut payload = snapshot.payload;
    let avoirs = state
        .db
        .list_avoir_declarations_for_contact(contact_id)
        .unwrap_or_default();
    crate::avoir_declarations::overlay_avoir_declarations(&mut payload, &avoirs);
    let retraits = state
        .db
        .list_avoir_retraits_for_contact(contact_id)
        .unwrap_or_default();
    crate::avoir_declarations::overlay_avoir_retraits(&mut payload, &retraits);

    let line = find_line(&payload, investissement_id).ok_or("Placement introuvable")?;
    if !line_extranet_eligible(line) {
        return Err("Pas de lien extranet pour ce type de placement".into());
    }
    let type_produit = line
        .get("typeProduit")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let nom = line
        .get("nomProduit")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    match url {
        None => {
            state
                .db
                .delete_extranet_bookmark(contact_id, investissement_id)
                .map_err(|e| e.to_string())?;
            Ok(None)
        }
        Some(href) => {
            state
                .db
                .upsert_extranet_bookmark(
                    contact_id,
                    investissement_id,
                    &href,
                    &type_produit,
                    &normaliser_nom_produit(&nom),
                )
                .map_err(|e| e.to_string())?;
            Ok(Some(href))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::PortalDb;
    use serde_json::json;

    #[test]
    fn https_only_no_credentials() {
        assert_eq!(
            normalize_extranet_url("extranet.swisslife.fr").unwrap().as_deref(),
            Some("https://extranet.swisslife.fr/")
        );
        assert!(normalize_extranet_url("http://extranet.swisslife.fr").is_err());
        assert!(normalize_extranet_url("https://u:p@extranet.swisslife.fr").is_err());
        assert!(normalize_extranet_url("javascript:alert(1)").is_err());
        assert!(normalize_extranet_url("").unwrap().is_none());
    }

    #[test]
    fn overlay_injects_url_on_matching_line() {
        let mut payload = json!({
            "investissements": [
                { "id": 7, "typeProduit": "PER", "nomProduit": "Swisslife" }
            ]
        });
        overlay_extranet_bookmarks(
            &mut payload,
            &[ExtranetBookmarkRow {
                contact_id: 1,
                investissement_id: 7,
                url: "https://espace.example.com/".into(),
                type_produit: "PER".into(),
                nom_produit_norm: "swisslife".into(),
            }],
        );
        assert_eq!(
            payload["investissements"][0]["extranetUrl"],
            "https://espace.example.com/"
        );
    }

    #[test]
    fn rematch_moves_pending_id_to_crm_id() {
        let db = PortalDb::open(":memory:").unwrap();
        db.upsert_extranet_bookmark(
            1,
            -4,
            "https://espace.example.com/",
            "PER",
            "swisslife",
        )
        .unwrap();
        let payload = json!({
            "investissements": [{
                "id": 88,
                "origine": "EXISTANT_CLIENT",
                "typeProduit": "PER",
                "nomProduit": "Swisslife"
            }]
        });
        let mut bookmarks = db.list_extranet_bookmarks(1).unwrap();
        rematch_pending_extranet_bookmarks(&db, 1, &payload, &[], &mut bookmarks);
        assert_eq!(bookmarks[0].investissement_id, 88);
        let stored = db.list_extranet_bookmarks(1).unwrap();
        assert_eq!(stored[0].investissement_id, 88);
    }

    #[test]
    fn rematch_ignores_cabinet_lines() {
        let db = PortalDb::open(":memory:").unwrap();
        db.upsert_extranet_bookmark(
            1,
            -4,
            "https://espace.example.com/",
            "PER",
            "swisslife",
        )
        .unwrap();
        let payload = json!({
            "investissements": [{
                "id": 3,
                "origine": "MON_CONSEIL",
                "typeProduit": "PER",
                "nomProduit": "Swisslife"
            }]
        });
        let mut bookmarks = db.list_extranet_bookmarks(1).unwrap();
        rematch_pending_extranet_bookmarks(&db, 1, &payload, &[], &mut bookmarks);
        assert_eq!(bookmarks[0].investissement_id, -4);
    }

    #[test]
    fn eligibility_covers_paniers_financiers() {
        assert!(line_extranet_eligible(&json!({
            "typeProduit": "ASSURANCE_VIE", "estScpi": false
        })));
        assert!(line_extranet_eligible(&json!({
            "typeProduit": "LIVRET_A", "estScpi": false
        })));
        assert!(line_extranet_eligible(&json!({
            "typeProduit": "AUTRE", "estScpi": true
        })));
        assert!(!line_extranet_eligible(&json!({
            "typeProduit": "PINEL", "estScpi": false
        })));
        assert!(!line_extranet_eligible(&json!({
            "typeProduit": "BIJOUX", "estScpi": false
        })));
    }
}
