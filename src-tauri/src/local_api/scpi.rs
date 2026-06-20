use super::config::LocalApiConfig;
use crate::database::scpi_campaigns::{PrepareScpiCampaignInput, ScpiProductsListResponse};
use crate::database::Database;
use std::io::Result as IoResult;
use tiny_http::{Request, StatusCode};

pub fn handle_list_products(request: Request, config: &LocalApiConfig) -> IoResult<()> {
    let db = match Database::open_at_path(&config.db_path) {
        Ok(db) => db,
        Err(e) => {
            return super::json_response(
                request,
                StatusCode(500),
                &format!(r#"{{"error":"{e}"}}"#),
            );
        }
    };

    let products = match db.list_scpi_product_names() {
        Ok(list) => list,
        Err(e) => {
            return super::json_response(
                request,
                StatusCode(500),
                &format!(r#"{{"error":"{e}"}}"#),
            );
        }
    };
    let count = products.len();
    let payload = ScpiProductsListResponse { count, products };
    let body = match serde_json::to_string(&payload) {
        Ok(s) => s,
        Err(e) => {
            return super::json_response(
                request,
                StatusCode(500),
                &format!(r#"{{"error":"{e}"}}"#),
            );
        }
    };
    super::json_response(request, StatusCode(200), &body)
}

pub fn handle_prepare_campaign(
    mut request: Request,
    config: &LocalApiConfig,
) -> IoResult<()> {
    let mut body = String::new();
    if let Err(e) = std::io::Read::read_to_string(&mut request.as_reader(), &mut body) {
        return super::json_response(
            request,
            StatusCode(400),
            &format!(r#"{{"error":"Corps illisible: {e}"}}"#),
        );
    }

    let input: PrepareScpiCampaignInput = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            return super::json_response(
                request,
                StatusCode(400),
                &format!(r#"{{"error":"JSON invalide: {e}"}}"#),
            );
        }
    };

    let db = match Database::open_at_path(&config.db_path) {
        Ok(db) => db,
        Err(e) => {
            return super::json_response(
                request,
                StatusCode(500),
                &format!(r#"{{"error":"{e}"}}"#),
            );
        }
    };

    match db.prepare_scpi_bulletin_campaign(input) {
        Ok(result) => match serde_json::to_string(&result) {
            Ok(json) => super::json_response(request, StatusCode(200), &json),
            Err(e) => super::json_response(
                request,
                StatusCode(500),
                &format!(r#"{{"error":"{e}"}}"#),
            ),
        },
        Err(e) => super::json_response(
            request,
            StatusCode(400),
            &format!(r#"{{"error":"{e}"}}"#),
        ),
    }
}
