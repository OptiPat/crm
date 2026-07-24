use super::client::GraphEntityVersion;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreconditionFailedDetails {
    pub expected_etag: String,
    pub actual_etag: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GraphWriteConflict {
    PreconditionFailed(PreconditionFailedDetails),
    NotFound,
    VersionMismatch {
        local: GraphEntityVersion,
        remote: GraphEntityVersion,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GraphWriteOutcome {
    Applied { entity: GraphEntityVersion },
    Conflict(GraphWriteConflict),
}

#[cfg(test)]
pub fn etag_matches(left: &str, right: &str) -> bool {
    normalize_etag(left) == normalize_etag(right)
}

#[cfg(test)]
pub fn normalize_etag(raw: &str) -> String {
    raw.trim().trim_matches('"').to_string()
}

#[cfg(test)]
pub fn evaluate_update(
    expected_etag: &str,
    current_remote_etag: &str,
    entity_id: &str,
) -> GraphWriteOutcome {
    if etag_matches(expected_etag, current_remote_etag) {
        GraphWriteOutcome::Applied {
            entity: GraphEntityVersion {
                id: entity_id.to_string(),
                etag: current_remote_etag.to_string(),
            },
        }
    } else {
        GraphWriteOutcome::Conflict(GraphWriteConflict::VersionMismatch {
            local: GraphEntityVersion {
                id: entity_id.to_string(),
                etag: expected_etag.to_string(),
            },
            remote: GraphEntityVersion {
                id: entity_id.to_string(),
                etag: current_remote_etag.to_string(),
            },
        })
    }
}

pub fn parse_http_write_result(status: u16, body: &str, expected_etag: &str) -> GraphWriteOutcome {
    match status {
        200 | 201 | 204 => {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
                let id = value
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let etag = value
                    .get("eTag")
                    .or_else(|| value.get("@odata.etag"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(expected_etag)
                    .to_string();
                GraphWriteOutcome::Applied {
                    entity: GraphEntityVersion { id, etag },
                }
            } else {
                GraphWriteOutcome::Applied {
                    entity: GraphEntityVersion {
                        id: "unknown".into(),
                        etag: expected_etag.to_string(),
                    },
                }
            }
        }
        404 => GraphWriteOutcome::Conflict(GraphWriteConflict::NotFound),
        412 => {
            let actual = serde_json::from_str::<serde_json::Value>(body)
                .ok()
                .and_then(|v| {
                    v.get("error")
                        .and_then(|err| err.get("innerError"))
                        .and_then(|inner| inner.get("etag"))
                        .and_then(|etag| etag.as_str())
                        .map(|s| s.to_string())
                });
            GraphWriteOutcome::Conflict(GraphWriteConflict::PreconditionFailed(
                PreconditionFailedDetails {
                    expected_etag: expected_etag.to_string(),
                    actual_etag: actual,
                },
            ))
        }
        _ if body.contains("resourceModified") || body.contains("nameAlreadyExists") => {
            GraphWriteOutcome::Conflict(GraphWriteConflict::PreconditionFailed(
                PreconditionFailedDetails {
                    expected_etag: expected_etag.to_string(),
                    actual_etag: None,
                },
            ))
        }
        _ => GraphWriteOutcome::Conflict(GraphWriteConflict::PreconditionFailed(
            PreconditionFailedDetails {
                expected_etag: expected_etag.to_string(),
                actual_etag: None,
            },
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluate_update_detects_version_mismatch() {
        let outcome = evaluate_update("\"1\"", "\"2\"", "item-7");
        match outcome {
            GraphWriteOutcome::Conflict(GraphWriteConflict::VersionMismatch { local, remote }) => {
                assert_eq!(local.etag, "\"1\"");
                assert_eq!(remote.etag, "\"2\"");
                assert_eq!(local.id, "item-7");
            }
            other => panic!("expected mismatch, got {other:?}"),
        }
    }

    #[test]
    fn evaluate_update_applies_when_etag_matches_with_or_without_quotes() {
        let outcome = evaluate_update("3", "\"3\"", "item-7");
        assert!(matches!(outcome, GraphWriteOutcome::Applied { .. }));
    }

    #[test]
    fn parse_http_write_result_maps_successful_patch_with_item_and_etag() {
        let body = r#"{ "id": "42", "eTag": "\"8\"" }"#;
        let outcome = parse_http_write_result(200, body, "\"7\"");
        match outcome {
            GraphWriteOutcome::Applied { entity } => {
                assert_eq!(entity.id, "42");
                assert_eq!(entity.etag, "\"8\"");
            }
            other => panic!("expected applied, got {other:?}"),
        }
    }

    #[test]
    fn parse_http_write_result_maps_precondition_failed() {
        let body = r#"{"error":{"code":"accessDenied","innerError":{"etag":"\"9\""}}}"#;
        let outcome = parse_http_write_result(412, body, "\"1\"");
        match outcome {
            GraphWriteOutcome::Conflict(GraphWriteConflict::PreconditionFailed(details)) => {
                assert_eq!(details.expected_etag, "\"1\"");
                assert_eq!(details.actual_etag.as_deref(), Some("\"9\""));
            }
            other => panic!("expected precondition failed, got {other:?}"),
        }
    }

    #[test]
    fn parse_http_write_result_maps_not_found() {
        let outcome = parse_http_write_result(404, "", "\"1\"");
        assert!(matches!(
            outcome,
            GraphWriteOutcome::Conflict(GraphWriteConflict::NotFound)
        ));
    }
}
