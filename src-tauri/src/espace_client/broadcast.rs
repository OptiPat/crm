//! Campagnes vers tous les espaces clients actifs.
//!
//! Une échéance collective, et une demande du dernier avis d'imposition
//! (en sautant ceux qui l'ont déjà honorée ; une en-attente est re-poussée).

use tauri::State;

use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::espace_demande::ESPACE_DEMANDE_EN_ATTENTE;
use crate::database::espace_echeance::normalize_echeance_titre;
use crate::database::Database;
use crate::espace_client::commands::require_espace_client_active;
use crate::espace_client::config::ensure_depot_public_key;
use crate::espace_client::push::{
    load_portal_push_target, post_espace_client_snapshot_http, record_espace_push_outcome,
};
use crate::espace_client::snapshot::build_espace_client_snapshot_for_push;
use crate::espace_client::sync_payload::EspaceClientSyncPayload;

pub const AVIS_IMPOSITION_TEMPLATE_KEY: &str = "R1:avis_imposition";
const AVIS_IMPOSITION_LIBELLE: &str = "Dernier avis d'imposition";
const AVIS_IMPOSITION_TYPE: &str = "FISCAL";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceBroadcastPreview {
    pub actifs: usize,
    pub avis_a_demander: usize,
    pub avis_deja_traites: usize,
    pub avis_en_attente: usize,
    pub echeance_a_creer: usize,
    pub echeance_ignores: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceBroadcastResult {
    pub total: usize,
    pub crees: usize,
    pub ignores: usize,
    pub relances: usize,
    pub echecs: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AvisPlan {
    Create,
    RetryPending,
    SkipHonored,
}

fn classify_avis(statut: Option<&str>) -> AvisPlan {
    match statut {
        None => AvisPlan::Create,
        Some(ESPACE_DEMANDE_EN_ATTENTE) => AvisPlan::RetryPending,
        Some(_) => AvisPlan::SkipHonored,
    }
}

fn rollback_created_demande(database: &Database, demande_id: i64) {
    let _ = database.cancel_espace_demande(demande_id);
}

fn rollback_created_echeance(database: &Database, echeance_id: i64) {
    let _ = database.delete_espace_echeance(echeance_id);
}

enum Rollback {
    None,
    Demande(i64),
    Echeance(i64),
}

#[derive(Clone, Copy)]
enum JobKind {
    Created,
    Retry,
    Skip,
}

struct PreparedJob {
    contact_id: i64,
    kind: JobKind,
    rollback: Rollback,
    payload: Option<EspaceClientSyncPayload>,
    prepare_error: Option<String>,
}

fn with_db<T>(
    db: &DbState,
    f: impl FnOnce(&Database) -> Result<T, String>,
) -> Result<T, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte")?;
    f(database)
}

fn prepare_payload(
    database: &Database,
    contact_id: i64,
    portal: bool,
) -> Result<Option<EspaceClientSyncPayload>, String> {
    if !portal {
        return Ok(None);
    }
    build_espace_client_snapshot_for_push(database, contact_id).map(Some)
}

pub(crate) fn preview_broadcast(
    database: &Database,
    date_echeance: Option<i64>,
    titre: Option<&str>,
) -> Result<EspaceBroadcastPreview, String> {
    let actifs = database
        .list_espace_contacts_actifs()
        .map_err(|e| e.to_string())?;
    let mut avis_deja_traites = 0usize;
    let mut avis_en_attente = 0usize;
    for contact_id in &actifs {
        let statut = database
            .blocking_espace_demande_statut(
                *contact_id,
                AVIS_IMPOSITION_TEMPLATE_KEY,
                AVIS_IMPOSITION_LIBELLE,
            )
            .map_err(|e| e.to_string())?;
        match classify_avis(statut.as_deref()) {
            AvisPlan::Create => {}
            AvisPlan::RetryPending => avis_en_attente += 1,
            AvisPlan::SkipHonored => avis_deja_traites += 1,
        }
    }

    let mut echeance_ignores = 0usize;
    if let (Some(date), Some(titre_brut)) = (date_echeance, titre) {
        if let Ok(titre) = normalize_echeance_titre(titre_brut) {
            for contact_id in &actifs {
                if database
                    .contact_has_echeance_same_day(*contact_id, date, &titre)
                    .map_err(|e| e.to_string())?
                {
                    echeance_ignores += 1;
                }
            }
        }
    }

    Ok(EspaceBroadcastPreview {
        actifs: actifs.len(),
        avis_a_demander: actifs
            .len()
            .saturating_sub(avis_deja_traites)
            .saturating_sub(avis_en_attente),
        avis_deja_traites,
        avis_en_attente,
        echeance_a_creer: actifs.len().saturating_sub(echeance_ignores),
        echeance_ignores,
    })
}

fn finish_jobs(jobs: Vec<PreparedJob>) -> EspaceBroadcastResult {
    let total = jobs.len();
    let mut crees = 0usize;
    let mut ignores = 0usize;
    let mut relances = 0usize;
    let mut echecs = Vec::new();

    for job in jobs {
        if let Some(error) = job.prepare_error {
            echecs.push(format!("contact {} : {error}", job.contact_id));
            continue;
        }
        match job.kind {
            JobKind::Skip => ignores += 1,
            JobKind::Created => crees += 1,
            JobKind::Retry => relances += 1,
        }
    }

    EspaceBroadcastResult {
        total,
        crees,
        ignores,
        relances,
        echecs,
    }
}

fn apply_http_results(
    database: &Database,
    jobs: Vec<(PreparedJob, Result<(), String>)>,
) -> EspaceBroadcastResult {
    let total = jobs.len();
    let mut crees = 0usize;
    let mut ignores = 0usize;
    let mut relances = 0usize;
    let mut echecs = Vec::new();

    for (job, http) in jobs {
        if let Some(error) = job.prepare_error {
            echecs.push(format!("contact {} : {error}", job.contact_id));
            continue;
        }
        match job.kind {
            JobKind::Skip => {
                ignores += 1;
                continue;
            }
            JobKind::Created | JobKind::Retry => match http {
                Ok(()) => {
                    if let Some(payload) = &job.payload {
                        let _ = record_espace_push_outcome(database, payload.sequence, true);
                    }
                    if matches!(job.kind, JobKind::Created) {
                        crees += 1;
                    } else {
                        relances += 1;
                    }
                }
                Err(error) => {
                    if let Some(payload) = &job.payload {
                        let _ = record_espace_push_outcome(database, payload.sequence, false);
                    }
                    match job.rollback {
                        Rollback::Demande(id) => rollback_created_demande(database, id),
                        Rollback::Echeance(id) => rollback_created_echeance(database, id),
                        Rollback::None => {}
                    }
                    echecs.push(format!("contact {} : {error}", job.contact_id));
                }
            },
        }
    }

    EspaceBroadcastResult {
        total,
        crees,
        ignores,
        relances,
        echecs,
    }
}

/// HTTP hors mutex : on prépare sous verrou, on envoie, puis on enregistre.
fn run_broadcast_jobs(
    db: &DbState,
    jobs: Vec<PreparedJob>,
    portal: Option<(String, String)>,
) -> Result<EspaceBroadcastResult, String> {
    let Some((url, secret)) = portal else {
        return Ok(finish_jobs(jobs));
    };
    let outcomes: Vec<(PreparedJob, Result<(), String>)> = jobs
        .into_iter()
        .map(|job| {
            let result = match &job.payload {
                Some(payload)
                    if !matches!(job.kind, JobKind::Skip) && job.prepare_error.is_none() =>
                {
                    post_espace_client_snapshot_http(&url, &secret, payload)
                }
                _ => Ok(()),
            };
            (job, result)
        })
        .collect();
    with_db(db, |database| Ok(apply_http_results(database, outcomes)))
}

#[tauri::command]
pub fn preview_espace_broadcast_cmd(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    date_echeance: Option<i64>,
    titre: Option<String>,
) -> Result<EspaceBroadcastPreview, String> {
    require_ui_session(&session)?;
    with_db(&db, |database| {
        require_espace_client_active(database)?;
        preview_broadcast(database, date_echeance, titre.as_deref())
    })
}

#[tauri::command]
pub fn broadcast_espace_echeance_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    date_echeance: i64,
    titre: String,
    message: Option<String>,
    rdv_lien_id: Option<String>,
) -> Result<EspaceBroadcastResult, String> {
    require_ui_session(&session)?;
    let titre = normalize_echeance_titre(&titre)?;

    let (jobs, portal) = with_db(&db, |database| {
        require_espace_client_active(database)?;
        ensure_depot_public_key(&app, database)?;
        let portal = load_portal_push_target(&app, database)?;
        let has_portal = portal.is_some();
        let contacts = database
            .list_espace_contacts_actifs()
            .map_err(|e| e.to_string())?;

        let mut jobs = Vec::with_capacity(contacts.len());
        for contact_id in contacts {
            match database.contact_has_echeance_same_day(contact_id, date_echeance, &titre)
            {
                Ok(true) => match prepare_payload(database, contact_id, has_portal) {
                    Ok(payload) => jobs.push(PreparedJob {
                        contact_id,
                        kind: JobKind::Retry,
                        rollback: Rollback::None,
                        payload,
                        prepare_error: None,
                    }),
                    Err(error) => jobs.push(PreparedJob {
                        contact_id,
                        kind: JobKind::Retry,
                        rollback: Rollback::None,
                        payload: None,
                        prepare_error: Some(error),
                    }),
                },
                Ok(false) => match database.create_espace_echeance(
                    contact_id,
                    date_echeance,
                    &titre,
                    message.as_deref(),
                    rdv_lien_id.as_deref(),
                ) {
                    Ok(created) => match prepare_payload(database, contact_id, has_portal) {
                        Ok(payload) => jobs.push(PreparedJob {
                            contact_id,
                            kind: JobKind::Created,
                            rollback: Rollback::Echeance(created.id),
                            payload,
                            prepare_error: None,
                        }),
                        Err(error) => {
                            rollback_created_echeance(database, created.id);
                            jobs.push(PreparedJob {
                                contact_id,
                                kind: JobKind::Created,
                                rollback: Rollback::None,
                                payload: None,
                                prepare_error: Some(error),
                            });
                        }
                    },
                    Err(error) => jobs.push(PreparedJob {
                        contact_id,
                        kind: JobKind::Created,
                        rollback: Rollback::None,
                        payload: None,
                        prepare_error: Some(error),
                    }),
                },
                Err(error) => jobs.push(PreparedJob {
                    contact_id,
                    kind: JobKind::Created,
                    rollback: Rollback::None,
                    payload: None,
                    prepare_error: Some(error.to_string()),
                }),
            }
        }
        Ok((jobs, portal))
    })?;

    run_broadcast_jobs(&db, jobs, portal)
}

#[tauri::command]
pub fn broadcast_espace_avis_imposition_cmd(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<EspaceBroadcastResult, String> {
    require_ui_session(&session)?;

    let (jobs, portal) = with_db(&db, |database| {
        require_espace_client_active(database)?;
        ensure_depot_public_key(&app, database)?;
        let portal = load_portal_push_target(&app, database)?;
        let has_portal = portal.is_some();
        let contacts = database
            .list_espace_contacts_actifs()
            .map_err(|e| e.to_string())?;

        let mut jobs = Vec::with_capacity(contacts.len());
        for contact_id in contacts {
            let statut = match database.blocking_espace_demande_statut(
                contact_id,
                AVIS_IMPOSITION_TEMPLATE_KEY,
                AVIS_IMPOSITION_LIBELLE,
            ) {
                Ok(s) => s,
                Err(error) => {
                    jobs.push(PreparedJob {
                        contact_id,
                        kind: JobKind::Created,
                        rollback: Rollback::None,
                        payload: None,
                        prepare_error: Some(error.to_string()),
                    });
                    continue;
                }
            };

            match classify_avis(statut.as_deref()) {
                AvisPlan::SkipHonored => jobs.push(PreparedJob {
                    contact_id,
                    kind: JobKind::Skip,
                    rollback: Rollback::None,
                    payload: None,
                    prepare_error: None,
                }),
                AvisPlan::RetryPending => match prepare_payload(database, contact_id, has_portal)
                {
                    Ok(payload) => jobs.push(PreparedJob {
                        contact_id,
                        kind: JobKind::Retry,
                        rollback: Rollback::None,
                        payload,
                        prepare_error: None,
                    }),
                    Err(error) => jobs.push(PreparedJob {
                        contact_id,
                        kind: JobKind::Retry,
                        rollback: Rollback::None,
                        payload: None,
                        prepare_error: Some(error),
                    }),
                },
                AvisPlan::Create => match database.create_espace_demande(
                    contact_id,
                    AVIS_IMPOSITION_TYPE,
                    Some(AVIS_IMPOSITION_TEMPLATE_KEY),
                    AVIS_IMPOSITION_LIBELLE,
                ) {
                    Ok(created) => match prepare_payload(database, contact_id, has_portal) {
                        Ok(payload) => jobs.push(PreparedJob {
                            contact_id,
                            kind: JobKind::Created,
                            rollback: Rollback::Demande(created.id),
                            payload,
                            prepare_error: None,
                        }),
                        Err(error) => {
                            rollback_created_demande(database, created.id);
                            jobs.push(PreparedJob {
                                contact_id,
                                kind: JobKind::Created,
                                rollback: Rollback::None,
                                payload: None,
                                prepare_error: Some(error),
                            });
                        }
                    },
                    Err(error) => jobs.push(PreparedJob {
                        contact_id,
                        kind: JobKind::Created,
                        rollback: Rollback::None,
                        payload: None,
                        prepare_error: Some(error),
                    }),
                },
            }
        }
        Ok((jobs, portal))
    })?;

    run_broadcast_jobs(&db, jobs, portal)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::espace_client::ESPACE_STATUT_ACTIF;
    use crate::database::espace_demande::ESPACE_DEMANDE_VALIDE;
    use crate::database::models::NewContact;
    use rusqlite::params;

    fn contact_actif(db: &Database, nom: &str, prenom: &str, email: &str) -> i64 {
        let id = db
            .create_contact(NewContact {
                nom: nom.into(),
                prenom: prenom.into(),
                email: Some(email.into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();
        db.activate_espace_acces(id, email, "hash-test").unwrap();
        assert_eq!(
            db.get_espace_acces_by_contact(id).unwrap().unwrap().statut,
            ESPACE_STATUT_ACTIF
        );
        id
    }

    #[test]
    fn classify_pending_is_retry_not_skip() {
        assert_eq!(classify_avis(None), AvisPlan::Create);
        assert_eq!(
            classify_avis(Some(ESPACE_DEMANDE_EN_ATTENTE)),
            AvisPlan::RetryPending
        );
        assert_eq!(
            classify_avis(Some(ESPACE_DEMANDE_VALIDE)),
            AvisPlan::SkipHonored
        );
    }

    #[test]
    fn preview_counts_avis_already_asked() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let a = contact_actif(&db, "DUPONT", "Jean", "a@example.com");
        let _b = contact_actif(&db, "LEGRAND", "Paul", "b@example.com");
        db.create_espace_demande(
            a,
            AVIS_IMPOSITION_TYPE,
            Some(AVIS_IMPOSITION_TEMPLATE_KEY),
            AVIS_IMPOSITION_LIBELLE,
        )
        .unwrap();

        let preview = preview_broadcast(&db, None, None).unwrap();
        assert_eq!(preview.actifs, 2);
        assert_eq!(preview.avis_a_demander, 1);
        assert_eq!(preview.avis_en_attente, 1);
        assert_eq!(preview.avis_deja_traites, 0);
    }

    #[test]
    fn preview_treats_validated_avis_as_already_done() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let a = contact_actif(&db, "DUPONT", "Jean", "a@example.com");
        let demande = db
            .create_espace_demande(
                a,
                AVIS_IMPOSITION_TYPE,
                Some(AVIS_IMPOSITION_TEMPLATE_KEY),
                AVIS_IMPOSITION_LIBELLE,
            )
            .unwrap();
        db.connection()
            .execute(
                "UPDATE espace_demande SET statut = ?1, valide_at = unixepoch() WHERE id = ?2",
                params![ESPACE_DEMANDE_VALIDE, demande.id],
            )
            .unwrap();

        let preview = preview_broadcast(&db, None, None).unwrap();
        assert_eq!(preview.avis_a_demander, 0);
        assert_eq!(preview.avis_deja_traites, 1);
        assert_eq!(preview.avis_en_attente, 0);
    }

    #[test]
    fn preview_counts_same_day_echeance_ignores() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let a = contact_actif(&db, "DUPONT", "Jean", "a@example.com");
        let _b = contact_actif(&db, "LEGRAND", "Paul", "b@example.com");
        let midi = 1_800_000_000;
        db.create_espace_echeance(a, midi, "Assemblée", None, None)
            .unwrap();

        let preview = preview_broadcast(&db, Some(midi), Some("Assemblée")).unwrap();
        assert_eq!(preview.echeance_ignores, 1);
        assert_eq!(preview.echeance_a_creer, 1);
    }

    #[test]
    fn rollback_created_avis_allows_retry() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let a = contact_actif(&db, "DUPONT", "Jean", "a@example.com");
        let demande = db
            .create_espace_demande(
                a,
                AVIS_IMPOSITION_TYPE,
                Some(AVIS_IMPOSITION_TEMPLATE_KEY),
                AVIS_IMPOSITION_LIBELLE,
            )
            .unwrap();
        rollback_created_demande(&db, demande.id);
        assert_eq!(
            classify_avis(
                db.blocking_espace_demande_statut(
                    a,
                    AVIS_IMPOSITION_TEMPLATE_KEY,
                    AVIS_IMPOSITION_LIBELLE
                )
                .unwrap()
                .as_deref()
            ),
            AvisPlan::Create
        );
    }

    #[test]
    fn custom_avis_without_template_counts_as_pending() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let a = contact_actif(&db, "DUPONT", "Jean", "a@example.com");
        db.create_espace_demande(a, AVIS_IMPOSITION_TYPE, None, AVIS_IMPOSITION_LIBELLE)
            .unwrap();
        let preview = preview_broadcast(&db, None, None).unwrap();
        assert_eq!(preview.avis_en_attente, 1);
        assert_eq!(preview.avis_a_demander, 0);
    }
}
