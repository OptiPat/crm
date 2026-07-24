use crate::workspace::sharepoint::{
    GraphWriteOutcome, ParsedSharePointListItem, SharePointGraphClient,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MAX_SEQUENCE_RESERVATION_ATTEMPTS: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReservedIdBlock {
    pub sequence_key: String,
    pub start_id: i64,
    pub end_id: i64,
    pub remote_item_id: String,
    pub remote_etag: String,
}

fn next_value(item: &ParsedSharePointListItem) -> Result<i64, String> {
    match item.fields.get("NextValue") {
        Some(Value::Number(value)) => value
            .as_i64()
            .or_else(|| {
                value
                    .as_f64()
                    .filter(|number| number.fract() == 0.0)
                    .map(|number| number as i64)
            })
            .ok_or_else(|| "CRM_Sequences.NextValue doit être un entier.".to_string()),
        Some(Value::String(value)) => value
            .trim()
            .parse()
            .map_err(|_| "CRM_Sequences.NextValue invalide.".to_string()),
        _ => Err("Élément CRM_Sequences sans NextValue.".into()),
    }
}

fn block_bounds(minimum_next: i64, current_next: i64, block_size: i64) -> Result<(i64, i64, i64), String> {
    if minimum_next <= 0 || current_next < 0 || block_size <= 0 {
        return Err("Paramètres de réservation d'identifiants invalides.".into());
    }
    let start_id = current_next.max(minimum_next);
    let next_remote_value = start_id
        .checked_add(block_size)
        .ok_or_else(|| "Plage d'identifiants SQLite épuisée.".to_string())?;
    Ok((start_id, next_remote_value - 1, next_remote_value))
}

pub fn reserve_remote_id_block(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
    sequence_list_id: &str,
    sequence_key: &str,
    minimum_next: i64,
    block_size: i64,
) -> Result<ReservedIdBlock, String> {
    if sequence_key.trim().is_empty() {
        return Err("SequenceKey vide.".into());
    }
    let escaped_key = sequence_key.replace('\'', "''");
    for _ in 0..MAX_SEQUENCE_RESERVATION_ATTEMPTS {
        let filter = format!("fields/SequenceKey eq '{escaped_key}'");
        let matches = client.list_items_all_blocking(
            access_token,
            site_id,
            sequence_list_id,
            Some(&filter),
        )?;
        match matches.as_slice() {
            [] => {
                let (start_id, end_id, next_remote_value) =
                    block_bounds(minimum_next, minimum_next, block_size)?;
                match client.create_list_item_blocking(
                    access_token,
                    site_id,
                    sequence_list_id,
                    json!({
                        "SequenceKey": sequence_key,
                        "NextValue": next_remote_value,
                    }),
                ) {
                    Ok(created) => {
                        return Ok(ReservedIdBlock {
                            sequence_key: sequence_key.to_string(),
                            start_id,
                            end_id,
                            remote_item_id: created.id,
                            remote_etag: created.etag,
                        });
                    }
                    Err(_) => continue,
                }
            }
            [item] => {
                let (start_id, end_id, next_remote_value) =
                    block_bounds(minimum_next, next_value(item)?, block_size)?;
                match client.patch_list_item_fields_blocking(
                    access_token,
                    site_id,
                    sequence_list_id,
                    &item.id,
                    &item.etag,
                    json!({ "NextValue": next_remote_value }),
                )? {
                    GraphWriteOutcome::Applied { entity } => {
                        return Ok(ReservedIdBlock {
                            sequence_key: sequence_key.to_string(),
                            start_id,
                            end_id,
                            remote_item_id: entity.id,
                            remote_etag: entity.etag,
                        });
                    }
                    GraphWriteOutcome::Conflict(_) => continue,
                }
            }
            _ => {
                return Err(format!(
                    "Plusieurs séquences distantes existent pour {sequence_key}."
                ));
            }
        }
    }
    Err(format!(
        "Réservation concurrente impossible pour {sequence_key} après plusieurs tentatives."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::sharepoint::test_server::{ScriptedGraphServer, ScriptedResponse};
    use crate::workspace::sharepoint::SharePointSiteRef;

    #[test]
    fn sequence_block_starts_after_existing_ids() {
        assert_eq!(block_bounds(43, 1, 100).unwrap(), (43, 142, 143));
        assert_eq!(block_bounds(43, 500, 100).unwrap(), (500, 599, 600));
    }

    #[test]
    fn next_value_rejects_fractional_numbers() {
        let item = ParsedSharePointListItem {
            id: "1".into(),
            etag: "\"1\"".into(),
            fields: json!({ "NextValue": 12.5 }),
        };
        assert!(next_value(&item).is_err());
    }

    #[test]
    fn remote_sequence_retries_412_and_reserves_the_refreshed_range() {
        let server = ScriptedGraphServer::spawn(vec![
            ScriptedResponse::json(
                200,
                r#"{"value":[{"id":"seq-1","@odata.etag":"\"1\"","fields":{"SequenceKey":"contacts","NextValue":100}}]}"#,
            ),
            ScriptedResponse::json(
                412,
                r#"{"error":{"code":"preconditionFailed","message":"concurrent reservation"}}"#,
            ),
            ScriptedResponse::json(
                200,
                r#"{"value":[{"id":"seq-1","@odata.etag":"\"2\"","fields":{"SequenceKey":"contacts","NextValue":200}}]}"#,
            ),
            ScriptedResponse::json(204, ""),
            ScriptedResponse::json(
                200,
                r#"{"id":"seq-1","@odata.etag":"\"3\"","fields":{"SequenceKey":"contacts","NextValue":300}}"#,
            ),
        ]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "example.sharepoint.com".into(),
            site_path: "/sites/crm".into(),
        })
        .with_graph_host(&server.base_url);

        let block =
            reserve_remote_id_block(&client, "token", "site-1", "sequences", "contacts", 1, 100)
                .unwrap();

        assert_eq!((block.start_id, block.end_id), (200, 299));
        assert_eq!(block.remote_etag, "\"3\"");
        let requests = server.finish();
        assert_eq!(requests.len(), 5);
        assert!(requests[0].starts_with("GET /v1.0/sites/site-1/lists/sequences/items?"));
        assert!(requests[1].starts_with(
            "PATCH /v1.0/sites/site-1/lists/sequences/items/seq-1/fields "
        ));
        assert!(requests[2].starts_with("GET /v1.0/sites/site-1/lists/sequences/items?"));
    }
}
