//! Envoi groupé des modifications locales vers CRM_Data via `$batch` Graph.
//!
//! Un lot = 20 lignes au plus : une passe de recherche (SyncKey) pour les lignes
//! sans correspondance distante, une passe d'écriture (POST / PATCH), puis
//! l'audit en lot, best-effort. Chaque ligne appliquée est acquittée localement
//! **avant** l'audit : un quota Graph ne peut plus laisser une ligne « envoyée
//! mais pas acquittée » qui reviendrait en conflit contre elle-même.

use super::push::{
    build_crm_data_mutation_fields, complete_remote_push, ensure_remote_audit_entry,
    mutation_audit_fields, PendingPushPlan, RemotePushResult,
};
#[cfg(test)]
use super::push::next_pending_pushes;
use crate::commands::DbState;
use crate::database::Database;
use crate::workspace::migration::{compute_mutation_id, compute_sync_key};
use crate::workspace::sharepoint::{
    parse_http_write_result, GraphBatchRequest, GraphBatchResponse, GraphWriteOutcome,
    SharePointGraphClient, GRAPH_BATCH_MAX_REQUESTS,
};
use serde_json::{json, Value};

pub struct BatchPushContext<'a> {
    pub client: &'a SharePointGraphClient,
    pub access_token: &'a str,
    pub site_id: &'a str,
    pub data_list_id: &'a str,
    pub audit_list_id: &'a str,
    pub actor_id: &'a str,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct BatchPushOutcome {
    pub pushed: usize,
    pub conflicts: usize,
    /// Créations refusées par SharePoint (lignes toujours en attente, réessayées).
    pub failed: usize,
    pub last_error: Option<String>,
    /// Graph a répondu 429 sur au moins une sous-requête : le cycle s'arrête,
    /// les lignes non traitées restent en attente.
    pub throttled: bool,
}

struct WritePlan {
    plan: PendingPushPlan,
    fields: Value,
    mutation_id: String,
    /// (id élément, ETag) → PATCH ; None → POST.
    target: Option<(String, String)>,
    skipped: bool,
}

/// Marqueur : un import local (transaction ouverte) occupe la connexion. Le cycle
/// s'arrête sans erreur visible ; les lignes déjà envoyées seront acquittées par
/// l'écho du prochain pull.
pub const IMPORT_IN_PROGRESS_MESSAGE: &str =
    "Import local en cours : synchronisation reportée au prochain cycle.";

pub fn ensure_no_open_transaction(database: &Database) -> Result<(), String> {
    if database.connection().is_autocommit() {
        Ok(())
    } else {
        Err(IMPORT_IN_PROGRESS_MESSAGE.to_string())
    }
}

/// Verrouille la base pour une écriture de synchronisation. Refuse si un import
/// a ouvert une transaction entre-temps : rien ne doit s'y glisser.
pub fn with_db<T>(db: &DbState, f: impl FnOnce(&Database) -> Result<T, String>) -> Result<T, String> {
    let guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non initialisée")?;
    ensure_no_open_transaction(database)?;
    f(database)
}

fn response_index(response: &GraphBatchResponse) -> Option<usize> {
    response.id.parse().ok()
}

/// L'élément SharePoint a été écrit par cette identité Microsoft.
fn written_by_actor(fields: &Value, actor_id: &str) -> bool {
    fields
        .get("UpdatedBy")
        .and_then(Value::as_str)
        .is_some_and(|remote| !remote.trim().is_empty() && remote.eq_ignore_ascii_case(actor_id.trim()))
}

/// Relit jusqu'à `limit` conflits ouverts sur SharePoint. Ceux dont la version
/// distante est la nôtre (même identité) se ferment en « conserver ma version » :
/// la ligne locale, plus récente, repart au prochain cycle avec le bon ETag.
/// Retourne le nombre de conflits fermés.
pub fn resolve_own_conflicts(
    db: &DbState,
    ctx: &BatchPushContext<'_>,
    limit: usize,
) -> Result<usize, String> {
    let targets = with_db(db, |database| {
        database.workspace_sync_list_open_conflict_targets(limit)
    })?;
    let urls = ctx.client.urls();
    let mut resolved = 0;
    for chunk in targets.chunks(GRAPH_BATCH_MAX_REQUESTS) {
        let requests: Vec<GraphBatchRequest> = chunk
            .iter()
            .enumerate()
            .filter_map(|(index, target)| {
                target.remote_item_id.as_deref().map(|item_id| GraphBatchRequest {
                    id: index.to_string(),
                    method: "GET",
                    url: urls.relative_list_item(ctx.site_id, ctx.data_list_id, item_id),
                    if_match: None,
                    body: None,
                })
            })
            .collect();
        if requests.is_empty() {
            continue;
        }
        for response in ctx.client.batch_blocking(ctx.access_token, &requests)? {
            if response.status != 200 {
                continue;
            }
            let Some(target) = response_index(&response).and_then(|index| chunk.get(index)) else {
                continue;
            };
            let Ok(item) =
                SharePointGraphClient::parse_list_item_response(&response.body.to_string())
            else {
                continue;
            };
            if !written_by_actor(&item.fields, ctx.actor_id) {
                continue;
            }
            with_db(db, |database| {
                database.workspace_sync_resolve_own_conflict(
                    target.conflict_id,
                    &target.table_name,
                    &target.record_key,
                    &item.id,
                    &item.etag,
                )
            })?;
            resolved += 1;
        }
    }
    Ok(resolved)
}

/// 412 (If-Match), 409, 404 ou `resourceModified` : la version distante a bougé.
/// Tout autre refus est passager ou métier, pas un conflit à arbitrer.
fn is_version_conflict(response: &GraphBatchResponse) -> bool {
    matches!(response.status, 404 | 409 | 412)
        || response.body["error"]["code"]
            .as_str()
            .is_some_and(|code| code.eq_ignore_ascii_case("resourceModified"))
}

/// Sous-requête de recherche par SyncKey (lignes sans correspondance distante).
fn lookup_request(ctx: &BatchPushContext<'_>, index: usize, sync_key: &str) -> GraphBatchRequest {
    let escaped = sync_key.replace('\'', "''");
    GraphBatchRequest {
        id: index.to_string(),
        method: "GET",
        url: ctx.client.urls().relative_list_items_filtered(
            ctx.site_id,
            ctx.data_list_id,
            &format!("fields/SyncKey eq '{escaped}'"),
        ),
        if_match: None,
        body: None,
    }
}

fn write_request(ctx: &BatchPushContext<'_>, index: usize, plan: &WritePlan) -> GraphBatchRequest {
    let urls = ctx.client.urls();
    match plan.target.as_ref() {
        Some((item_id, etag)) => GraphBatchRequest {
            id: index.to_string(),
            method: "PATCH",
            url: urls.relative_list_item_fields(ctx.site_id, ctx.data_list_id, item_id),
            if_match: Some(etag.clone()),
            body: Some(plan.fields.clone()),
        },
        None => GraphBatchRequest {
            id: index.to_string(),
            method: "POST",
            url: urls.relative_list_items(ctx.site_id, ctx.data_list_id),
            if_match: None,
            body: Some(json!({ "fields": plan.fields })),
        },
    }
}

/// Acquitte localement une ligne écrite sur SharePoint et prépare son audit.
#[allow(clippy::too_many_arguments)]
fn acknowledge_applied(
    db: &DbState,
    ctx: &BatchPushContext<'_>,
    plan: &WritePlan,
    index: usize,
    remote_item_id: &str,
    remote_etag: &str,
    now_rfc3339: &str,
    outcome: &mut BatchPushOutcome,
    audits: &mut Vec<GraphBatchRequest>,
) -> Result<(), String> {
    let result = RemotePushResult::Applied {
        queue_id: plan.plan.queue_item.id,
        revision: plan.plan.queue_item.revision,
        remote_item_id: remote_item_id.to_string(),
        remote_etag: remote_etag.to_string(),
    };
    if with_db(db, |database| complete_remote_push(database, &plan.plan, &result))? {
        outcome.pushed += 1;
    }
    audits.push(GraphBatchRequest {
        id: index.to_string(),
        method: "POST",
        url: ctx
            .client
            .urls()
            .relative_list_items(ctx.site_id, ctx.audit_list_id),
        if_match: None,
        body: Some(json!({
            "fields": mutation_audit_fields(&plan.plan.queue_item, ctx.actor_id, now_rfc3339)
        })),
    });
    Ok(())
}

/// Pousse un lot (≤ 20 lignes) vers SharePoint. Les lignes appliquées sont
/// acquittées localement ; les autres restent en attente pour le cycle suivant.
/// L'audit des lignes acquittées part toujours, même si le lot s'interrompt.
pub fn push_pending_batch(
    db: &DbState,
    ctx: &BatchPushContext<'_>,
    plans: Vec<PendingPushPlan>,
    now_rfc3339: &str,
) -> Result<BatchPushOutcome, String> {
    let mut audits: Vec<GraphBatchRequest> = Vec::new();
    let result = push_pending_batch_inner(db, ctx, plans, now_rfc3339, &mut audits);
    flush_audits(ctx, &audits);
    result
}

/// Audit en lot, best-effort : la donnée est déjà sur SharePoint et acquittée.
fn flush_audits(ctx: &BatchPushContext<'_>, audits: &[GraphBatchRequest]) {
    if audits.is_empty() {
        return;
    }
    match ctx.client.batch_blocking(ctx.access_token, audits) {
        Ok(responses) => {
            let failed = responses
                .iter()
                .filter(|response| !(200..300).contains(&response.status))
                .count();
            if failed > 0 {
                eprintln!(
                    "⚠️ Audit SharePoint : {failed} entrée(s) non écrite(s) sur {}.",
                    audits.len()
                );
            }
        }
        Err(error) => eprintln!("⚠️ Audit SharePoint non écrit pour ce lot : {error}"),
    }
}

fn push_pending_batch_inner(
    db: &DbState,
    ctx: &BatchPushContext<'_>,
    plans: Vec<PendingPushPlan>,
    now_rfc3339: &str,
    audits: &mut Vec<GraphBatchRequest>,
) -> Result<BatchPushOutcome, String> {
    if plans.len() > GRAPH_BATCH_MAX_REQUESTS {
        return Err(format!(
            "Lot de synchronisation trop grand : {} lignes (max {GRAPH_BATCH_MAX_REQUESTS}).",
            plans.len()
        ));
    }
    let mut outcome = BatchPushOutcome::default();
    let mut write_plans = Vec::with_capacity(plans.len());
    for plan in plans {
        let fields = build_crm_data_mutation_fields(&plan.queue_item, ctx.actor_id, now_rfc3339)?;
        let mutation_id = fields
            .get("MutationId")
            .and_then(Value::as_str)
            .ok_or_else(|| "MutationId absente du payload de push.".to_string())?
            .to_string();
        let target = plan.remote_mapping.as_ref().and_then(|mapping| {
            Some((
                mapping.remote_item_id.clone()?,
                mapping.remote_etag.clone()?,
            ))
        });
        write_plans.push(WritePlan {
            plan,
            fields,
            mutation_id,
            target,
            skipped: false,
        });
    }

    // 1. Recherche par SyncKey pour les lignes sans correspondance distante.
    let lookups: Vec<GraphBatchRequest> = write_plans
        .iter()
        .enumerate()
        .filter(|(_, plan)| plan.target.is_none())
        .filter_map(|(index, plan)| {
            plan.fields
                .get("SyncKey")
                .and_then(Value::as_str)
                .map(|sync_key| lookup_request(ctx, index, sync_key))
        })
        .collect();
    if !lookups.is_empty() {
        for response in ctx.client.batch_blocking(ctx.access_token, &lookups)? {
            let Some(index) = response_index(&response) else {
                continue;
            };
            let Some(plan) = write_plans.get_mut(index) else {
                continue;
            };
            if response.status == 429 {
                outcome.throttled = true;
                plan.skipped = true;
                continue;
            }
            if response.status != 200 {
                eprintln!(
                    "⚠️ Recherche SharePoint {} / {} : HTTP {}",
                    plan.plan.queue_item.table_name, plan.plan.queue_item.record_key, response.status
                );
                plan.skipped = true;
                continue;
            }
            // Une réponse illisible ne concerne que cette ligne : elle attend le
            // prochain cycle, les autres lignes du lot continuent.
            let items = match SharePointGraphClient::parse_list_items_page(&response.body.to_string())
            {
                Ok(items) => items,
                Err(error) => {
                    eprintln!(
                        "⚠️ Recherche SharePoint illisible pour {} / {} : {error}",
                        plan.plan.queue_item.table_name, plan.plan.queue_item.record_key
                    );
                    plan.skipped = true;
                    continue;
                }
            };
            match items.as_slice() {
                [] => {}
                [item] => plan.target = Some((item.id.clone(), item.etag.clone())),
                _ => {
                    eprintln!(
                        "⚠️ Plusieurs éléments CRM_Data pour {} / {} : ligne laissée en attente.",
                        plan.plan.queue_item.table_name, plan.plan.queue_item.record_key
                    );
                    plan.skipped = true;
                }
            }
        }
    }

    // 2. Écritures : POST (création) ou PATCH (mise à jour avec If-Match).
    let writes: Vec<GraphBatchRequest> = write_plans
        .iter()
        .enumerate()
        .filter(|(_, plan)| !plan.skipped)
        .map(|(index, plan)| write_request(ctx, index, plan))
        .collect();
    if writes.is_empty() {
        return Ok(outcome);
    }
    let mut applied: Vec<(usize, String, String)> = Vec::new();
    let mut refresh: Vec<(usize, String)> = Vec::new();
    let mut conflicts: Vec<(usize, String)> = Vec::new();
    for response in ctx.client.batch_blocking(ctx.access_token, &writes)? {
        let Some(index) = response_index(&response) else {
            continue;
        };
        let Some(plan) = write_plans.get(index) else {
            continue;
        };
        if response.status == 429 {
            outcome.throttled = true;
            continue;
        }
        let expected_etag = plan
            .target
            .as_ref()
            .map(|(_, etag)| etag.as_str())
            .unwrap_or_default();
        match parse_http_write_result(response.status, &response.body.to_string(), expected_etag) {
            GraphWriteOutcome::Applied { entity } => match plan.target.as_ref() {
                // Création : la réponse contient l'élément (id + ETag).
                None if !entity.etag.is_empty() && entity.id != "unknown" => {
                    applied.push((index, entity.id, entity.etag));
                }
                None => refresh.push((index, entity.id)),
                // Mise à jour de /fields : l'ETag de l'élément se relit à part.
                Some((item_id, _)) => refresh.push((index, item_id.clone())),
            },
            GraphWriteOutcome::Conflict(_) => match plan.target.as_ref() {
                // Seul un vrai désaccord de version est un conflit à arbitrer.
                Some((item_id, _)) if is_version_conflict(&response) => {
                    conflicts.push((index, item_id.clone()));
                }
                // Refus passager ou métier (400, 403, 5xx…) : la ligne reste en
                // attente, passe derrière les fraîches, et le refus remonte à l'écran.
                _ => {
                    let code = response.body["error"]["code"]
                        .as_str()
                        .map(|code| format!(" {code}"))
                        .unwrap_or_default();
                    let verb = if plan.target.is_some() {
                        "la mise à jour"
                    } else {
                        "la création"
                    };
                    let message = format!(
                        "SharePoint a refusé {verb} de {} (HTTP {}{code}).",
                        plan.plan.queue_item.table_name, response.status
                    );
                    eprintln!(
                        "⚠️ {message} Ligne {} : nouvel essai au prochain cycle.",
                        plan.plan.queue_item.record_key
                    );
                    let item = &plan.plan.queue_item;
                    with_db(db, |database| {
                        database
                            .workspace_sync_record_push_error(item.id, item.revision, &message)
                            .map_err(|error| error.to_string())
                    })?;
                    outcome.failed += 1;
                    outcome.last_error = Some(message);
                }
            },
        }
    }

    // 3a. Acquitter tout de suite les créations (ETag déjà connu) : rien d'autre
    // ne doit pouvoir se mettre entre l'écriture distante et l'acquittement local.
    for (index, remote_item_id, remote_etag) in &applied {
        acknowledge_applied(
            db,
            ctx,
            &write_plans[*index],
            *index,
            remote_item_id,
            remote_etag,
            now_rfc3339,
            &mut outcome,
            audits,
        )?;
    }

    // 2b/3b. Relire l'ETag des éléments mis à jour, puis les acquitter. Un échec
    // ici ne remet pas en cause les écritures : les lignes restent en attente et
    // l'écho du prochain pull les acquittera.
    if !refresh.is_empty() {
        let urls = ctx.client.urls();
        let requests: Vec<GraphBatchRequest> = refresh
            .iter()
            .filter(|(_, item_id)| item_id != "unknown")
            .map(|(index, item_id)| GraphBatchRequest {
                id: index.to_string(),
                method: "GET",
                url: urls.relative_list_item(ctx.site_id, ctx.data_list_id, item_id),
                if_match: None,
                body: None,
            })
            .collect();
        match ctx.client.batch_blocking(ctx.access_token, &requests) {
            Ok(responses) => {
                for response in responses {
                    let Some(index) = response_index(&response) else {
                        continue;
                    };
                    if response.status != 200 {
                        eprintln!(
                            "⚠️ Relecture SharePoint après mise à jour : HTTP {} (ligne {index} laissée en attente).",
                            response.status
                        );
                        continue;
                    }
                    let item = match SharePointGraphClient::parse_list_item_response(
                        &response.body.to_string(),
                    ) {
                        Ok(item) => item,
                        Err(error) => {
                            eprintln!(
                                "⚠️ Relecture SharePoint illisible (ligne {index} laissée en attente) : {error}"
                            );
                            continue;
                        }
                    };
                    let Some(plan) = write_plans.get(index) else {
                        continue;
                    };
                    acknowledge_applied(
                        db,
                        ctx,
                        plan,
                        index,
                        &item.id,
                        &item.etag,
                        now_rfc3339,
                        &mut outcome,
                        audits,
                    )?;
                }
            }
            Err(error) => eprintln!(
                "⚠️ Relecture SharePoint impossible pour {} ligne(s) mise(s) à jour : {error}",
                requests.len()
            ),
        }
    }

    // 4. Conflits ETag : relire l'élément, vérifier l'idempotence, sinon consigner.
    for (index, item_id) in conflicts {
        let plan = &write_plans[index];
        let remote = ctx.client.get_list_item_blocking(
            ctx.access_token,
            ctx.site_id,
            ctx.data_list_id,
            &item_id,
        )?;
        if remote.fields.get("MutationId").and_then(Value::as_str) == Some(plan.mutation_id.as_str())
        {
            // Déjà écrit par un envoi précédent non acquitté : même chemin qu'un succès.
            acknowledge_applied(
                db,
                ctx,
                plan,
                index,
                &remote.id,
                &remote.etag,
                now_rfc3339,
                &mut outcome,
                audits,
            )?;
            continue;
        }
        let item = &plan.plan.queue_item;
        if written_by_actor(&remote.fields, ctx.actor_id) {
            // Notre révision antérieure : on retient le bon ETag, la version locale
            // (plus récente) repart au prochain cycle. Ce n'est pas un conflit.
            with_db(db, |database| {
                database
                    .workspace_sync_upsert_remote_mapping(
                        &item.table_name,
                        &item.record_key,
                        &remote.id,
                        &remote.etag,
                    )
                    .map_err(|error| error.to_string())
            })?;
            continue;
        }
        with_db(db, |database| {
            database.workspace_sync_record_push_conflict(
                &item.table_name,
                &item.record_key,
                &remote.id,
                remote.fields.get("PayloadJson").and_then(Value::as_str),
                Some(&remote.etag),
                remote
                    .fields
                    .get("Deleted")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            )
        })?;
        outcome.conflicts += 1;
        let conflict_key = format!("{}:{}", item.table_name, item.record_key);
        let mutation_id = compute_mutation_id(
            &compute_sync_key("sync_conflict", &conflict_key),
            item.revision,
        );
        if let Err(error) = ensure_remote_audit_entry(
            ctx.client,
            ctx.access_token,
            ctx.site_id,
            ctx.audit_list_id,
            &mutation_id,
            &item.table_name,
            &item.record_key,
            ctx.actor_id,
            "conflict",
            &format!("Conflit de synchronisation — révision {}", item.revision),
            now_rfc3339,
        ) {
            eprintln!("⚠️ Audit de conflit non écrit ({conflict_key}) : {error}");
        }
    }

    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::sharepoint::test_server::{ScriptedGraphServer, ScriptedResponse};
    use crate::workspace::sharepoint::SharePointSiteRef;
    use std::sync::Mutex;

    fn pending_db(count: usize) -> DbState {
        let db = Database::open_in_memory_for_tests().unwrap();
        for index in 0..count {
            db.workspace_sync_enqueue(
                "contacts",
                &format!(r#"[{{"column":"id","kind":"integer","value":{}}}]"#, index + 1),
                "upsert",
                Some(r#"{"nom":{"kind":"text","value":"DUPONT"}}"#),
            )
            .unwrap();
        }
        Mutex::new(Some(db))
    }

    fn pending_count(db: &DbState) -> usize {
        with_db(db, |database| {
            database
                .workspace_sync_list_pending()
                .map(|items| items.len())
                .map_err(|error| error.to_string())
        })
        .unwrap()
    }

    #[test]
    fn two_new_rows_take_three_http_calls_and_are_acknowledged() {
        let server = ScriptedGraphServer::spawn(vec![
            // 1. recherche SyncKey : rien côté SharePoint
            ScriptedResponse::json(
                200,
                r#"{"responses":[
                    {"id":"0","status":200,"body":{"value":[]}},
                    {"id":"1","status":200,"body":{"value":[]}}
                ]}"#,
            ),
            // 2. créations
            ScriptedResponse::json(
                200,
                r#"{"responses":[
                    {"id":"0","status":201,"body":{"id":"sp-1","@odata.etag":"\"1\"","fields":{}}},
                    {"id":"1","status":201,"body":{"id":"sp-2","@odata.etag":"\"1\"","fields":{}}}
                ]}"#,
            ),
            // 3. audit
            ScriptedResponse::json(
                200,
                r#"{"responses":[
                    {"id":"0","status":201,"body":{}},
                    {"id":"1","status":201,"body":{}}
                ]}"#,
            ),
        ]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm".into(),
        })
        .with_graph_host(server.base_url.clone());
        let db = pending_db(2);
        let plans = with_db(&db, |database| next_pending_pushes(database, 20)).unwrap();
        assert_eq!(plans.len(), 2);

        let outcome =
            push_pending_batch(&db, &ctx(&client), plans, "2026-09-27T15:00:00Z").unwrap();
        assert_eq!(outcome.pushed, 2);
        assert_eq!(outcome.conflicts, 0);
        assert!(!outcome.throttled);
        assert_eq!(pending_count(&db), 0);
        let mapping = with_db(&db, |database| {
            database
                .workspace_sync_get_remote_mapping(
                    "contacts",
                    r#"[{"column":"id","kind":"integer","value":2}]"#,
                )
                .map_err(|error| error.to_string())
        })
        .unwrap()
        .expect("mapping distant");
        assert_eq!(mapping.remote_item_id.as_deref(), Some("sp-2"));
        assert_eq!(server.finish().len(), 3);
    }

    #[test]
    fn stored_conflicts_written_by_this_actor_close_as_keep_local() {
        // Deux conflits ouverts : sp-1 écrit par nous (à fermer), sp-2 par Violette (à garder).
        let server = ScriptedGraphServer::spawn(vec![ScriptedResponse::json(
            200,
            r#"{"responses":[
                {"id":"0","status":200,"body":{"id":"sp-1","@odata.etag":"\"7\"","fields":{"UpdatedBy":"actor-1"}}},
                {"id":"1","status":200,"body":{"id":"sp-2","@odata.etag":"\"3\"","fields":{"UpdatedBy":"actor-violette"}}}
            ]}"#,
        )]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm".into(),
        })
        .with_graph_host(server.base_url.clone());
        let db = pending_db(2);
        with_db(&db, |database| {
            for (key, item) in [(1, "sp-1"), (2, "sp-2")] {
                database
                    .connection()
                    .execute(
                        "INSERT INTO workspace_conflicts
                            (table_name, record_key, local_payload_json, remote_payload_json,
                             remote_etag, remote_item_id, remote_deleted)
                         VALUES ('contacts', ?1, '{}', '{}', '\"1\"', ?2, 0)",
                        rusqlite::params![
                            format!(r#"[{{"column":"id","kind":"integer","value":{key}}}]"#),
                            item
                        ],
                    )
                    .map_err(|error| error.to_string())?;
            }
            Ok(())
        })
        .unwrap();

        let resolved = resolve_own_conflicts(&db, &ctx(&client), 100).unwrap();
        assert_eq!(resolved, 1);
        let (open, mapping_etag) = with_db(&db, |database| {
            let open: i64 = database
                .connection()
                .query_row(
                    "SELECT COUNT(*) FROM workspace_conflicts WHERE status = 'open'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let mapping = database
                .workspace_sync_get_remote_mapping(
                    "contacts",
                    r#"[{"column":"id","kind":"integer","value":1}]"#,
                )
                .map_err(|error| error.to_string())?;
            Ok((open, mapping.and_then(|m| m.remote_etag)))
        })
        .unwrap();
        assert_eq!(open, 1, "le conflit de Violette reste à arbitrer");
        assert_eq!(mapping_etag.as_deref(), Some("\"7\""), "ETag frais pour le prochain PATCH");
        assert_eq!(pending_count(&db), 2, "les versions locales restent à envoyer");
        assert_eq!(server.finish().len(), 1);
    }

    #[test]
    fn only_version_mismatches_count_as_conflicts() {
        let response = |status: u16, body: &str| GraphBatchResponse {
            id: "0".into(),
            status,
            body: serde_json::from_str(body).unwrap(),
        };
        assert!(is_version_conflict(&response(412, r#"{"error":{"code":"preconditionFailed"}}"#)));
        assert!(is_version_conflict(&response(404, "{}")));
        assert!(is_version_conflict(&response(400, r#"{"error":{"code":"resourceModified"}}"#)));
        assert!(!is_version_conflict(&response(400, r#"{"error":{"code":"invalidRequest"}}"#)));
        assert!(!is_version_conflict(&response(403, "{}")));
        assert!(!is_version_conflict(&response(500, "{}")));
    }

    #[test]
    fn throttled_lookup_leaves_rows_pending_without_writing() {
        let server = ScriptedGraphServer::spawn(vec![ScriptedResponse::json(
            200,
            r#"{"responses":[{"id":"0","status":429,"body":{"error":{"code":"tooManyRequests"}}}]}"#,
        )]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm".into(),
        })
        .with_graph_host(server.base_url.clone());
        let db = pending_db(1);
        let plans = with_db(&db, |database| next_pending_pushes(database, 20)).unwrap();

        let outcome =
            push_pending_batch(&db, &ctx(&client), plans, "2026-09-27T15:00:00Z").unwrap();
        assert!(outcome.throttled);
        assert_eq!(outcome.pushed, 0);
        assert_eq!(pending_count(&db), 1);
        assert_eq!(server.finish().len(), 1, "aucune écriture tentée");
    }

    fn ctx<'a>(client: &'a SharePointGraphClient) -> BatchPushContext<'a> {
        BatchPushContext {
            client,
            access_token: "token",
            site_id: "site-1",
            data_list_id: "data-list",
            audit_list_id: "audit-list",
            actor_id: "actor-1",
        }
    }

    #[test]
    fn lookup_and_write_requests_use_relative_urls_and_if_match() {
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm".into(),
        });
        let ctx = ctx(&client);
        let lookup = lookup_request(&ctx, 3, "abc'def");
        assert_eq!(lookup.id, "3");
        assert_eq!(lookup.method, "GET");
        assert!(lookup.url.starts_with("/sites/site-1/lists/data-list/items?"));
        assert!(lookup.url.contains("SyncKey"));
        assert!(!lookup.url.contains("https://"));

        let created = WritePlan {
            plan: PendingPushPlan {
                queue_item: crate::database::workspace_sync::WorkspaceSyncQueueItem {
                    id: 1,
                    revision: 1,
                    table_name: "contacts".into(),
                    record_key: "k".into(),
                    operation: "upsert".into(),
                    payload_json: Some("{}".into()),
                    enqueued_at: 0,
                },
                remote_mapping: None,
            },
            fields: json!({ "SyncKey": "x" }),
            mutation_id: "m".into(),
            target: None,
            skipped: false,
        };
        let post = write_request(&ctx, 0, &created);
        assert_eq!(post.method, "POST");
        assert!(post.if_match.is_none());
        assert_eq!(post.body.as_ref().unwrap()["fields"]["SyncKey"], "x");

        let updated = WritePlan {
            target: Some(("42".into(), "\"7\"".into())),
            ..created
        };
        let patch = write_request(&ctx, 1, &updated);
        assert_eq!(patch.method, "PATCH");
        assert_eq!(patch.if_match.as_deref(), Some("\"7\""));
        assert_eq!(patch.url, "/sites/site-1/lists/data-list/items/42/fields");
        assert_eq!(patch.body.as_ref().unwrap()["SyncKey"], "x");
    }
}
