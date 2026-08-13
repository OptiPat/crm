//! Relance unique à J+3 si une pièce demandée n'a toujours pas été déposée.
//!
//! Le CRM est éteint la nuit : c'est le portail qui envoie, comme pour le
//! premier mail de demande. Un seul rappel, jamais une série.

use std::time::Duration;

use rusqlite::{params, OptionalExtension, Result};

use crate::demande_store::{DemandeEmailNotification, DEMANDE_EN_ATTENTE};
use crate::db::PortalDb;
use crate::AppState;

/// 72 heures après `demande_at` (trois fois 24 h).
pub const REMINDER_AFTER_SECS: i64 = 3 * 24 * 60 * 60;
const REMINDER_TICK: Duration = Duration::from_secs(15 * 60);

impl PortalDb {
    /// Demandes encore en attente, déjà notifiées une première fois, jamais
    /// relancées, dont le délai est écoulé — **réservées** au passage.
    pub fn claim_demande_reminders(
        &self,
        now: i64,
        delay_secs: i64,
    ) -> Result<Vec<DemandeEmailNotification>> {
        self.ensure_demande_tables()?;
        let cutoff = now.saturating_sub(delay_secs);
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT d.id, d.contact_id, d.libelle, a.email
             FROM espace_demande d
             INNER JOIN espace_acces a ON a.contact_id = d.contact_id
             WHERE d.statut = ?1
               AND d.client_notified_at IS NOT NULL
               AND d.client_reminded_at IS NULL
               AND d.demande_at <= ?2
               AND a.statut = 'actif'
               AND TRIM(a.email) != ''",
        )?;
        let candidates: Vec<(i64, i64, String, String)> = stmt
            .query_map(params![DEMANDE_EN_ATTENTE, cutoff], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>>>()?;
        drop(stmt);
        drop(conn);

        let mut notifications = Vec::new();
        for (demande_id, contact_id, libelle, email) in candidates {
            if !self.claim_demande_reminder(demande_id)? {
                continue;
            }
            notifications.push(DemandeEmailNotification {
                demande_id,
                contact_id,
                email,
                prenom: self.snapshot_prenom(contact_id),
                libelle,
            });
        }
        Ok(notifications)
    }

    fn claim_demande_reminder(&self, demande_id: i64) -> Result<bool> {
        let updated = self.conn().execute(
            "UPDATE espace_demande
             SET client_reminded_at = unixepoch()
             WHERE id = ?1
               AND statut = ?2
               AND client_reminded_at IS NULL",
            params![demande_id, DEMANDE_EN_ATTENTE],
        )?;
        Ok(updated > 0)
    }

    pub fn release_demande_reminder(&self, demande_id: i64) -> Result<()> {
        self.conn().execute(
            "UPDATE espace_demande SET client_reminded_at = NULL WHERE id = ?1",
            params![demande_id],
        )?;
        Ok(())
    }

    /// Relecture juste avant l'envoi : un dépôt, une annulation ou une
    /// révocation peuvent arriver après la réservation.
    pub fn reminder_still_sendable(&self, demande_id: i64) -> Result<bool> {
        self.ensure_demande_tables()?;
        let found: Option<i64> = self
            .conn()
            .query_row(
                "SELECT 1
                 FROM espace_demande d
                 INNER JOIN espace_acces a ON a.contact_id = d.contact_id
                 WHERE d.id = ?1
                   AND d.statut = ?2
                   AND a.statut = 'actif'
                   AND TRIM(a.email) != ''",
                params![demande_id, DEMANDE_EN_ATTENTE],
                |row| row.get(0),
            )
            .optional()?;
        Ok(found.is_some())
    }

    fn snapshot_prenom(&self, contact_id: i64) -> String {
        self.get_contact_snapshot(contact_id)
            .ok()
            .flatten()
            .and_then(|row| {
                row.payload
                    .pointer("/contact/prenom")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            })
            .unwrap_or_default()
    }
}

pub fn spawn_demande_reminder_loop(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(REMINDER_TICK);
        loop {
            ticker.tick().await;
            run_demande_reminders(&state).await;
        }
    });
}

async fn run_demande_reminders(state: &AppState) {
    let Some(mailer) = state.mailer.clone() else {
        return;
    };
    let now = chrono::Utc::now().timestamp();
    let notifications = match state.db.claim_demande_reminders(now, REMINDER_AFTER_SECS) {
        Ok(rows) => rows,
        Err(error) => {
            tracing::error!("Relance documents : sélection impossible ({error})");
            return;
        }
    };
    for note in notifications {
        match state.db.reminder_still_sendable(note.demande_id) {
            Ok(true) => {}
            Ok(false) => {
                tracing::info!(
                    "Relance document abandonnée (demande {} plus éligible)",
                    note.demande_id
                );
                continue;
            }
            Err(error) => {
                tracing::error!(
                    "Relance document : relecture impossible (demande {}) : {error}",
                    note.demande_id
                );
                continue;
            }
        }
        match mailer
            .send_document_request_reminder(&note.email, &note.prenom, &note.libelle)
            .await
        {
            Ok(()) => tracing::info!("Relance document envoyée (demande {})", note.demande_id),
            Err(error) => {
                tracing::error!(
                    "Relance document impossible (demande {}) : {error}",
                    note.demande_id
                );
                if let Err(release_error) = state.db.release_demande_reminder(note.demande_id) {
                    tracing::error!(
                        "Demande {} : réservation de relance impossible à rendre ({release_error})",
                        note.demande_id
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn seed_actif(db: &PortalDb, contact_id: i64, email: &str) {
        db.conn()
            .execute(
                "INSERT INTO espace_acces (contact_id, statut, email, premiere_connexion_at)
                 VALUES (?1, 'actif', ?2, unixepoch())",
                params![contact_id, email],
            )
            .unwrap();
    }

    fn insert_demande(
        db: &PortalDb,
        id: i64,
        contact_id: i64,
        statut: &str,
        demande_at: i64,
        notified: bool,
        reminded: bool,
    ) {
        db.ensure_demande_tables().unwrap();
        db.conn()
            .execute(
                "INSERT INTO espace_demande (
                    id, contact_id, type_document, libelle, statut, demande_at,
                    client_notified_at, client_reminded_at, updated_at
                 ) VALUES (?1, ?2, 'cni', 'Carte d''identité', ?3, ?4, ?5, ?6, unixepoch())",
                params![
                    id,
                    contact_id,
                    statut,
                    demande_at,
                    notified.then_some(demande_at),
                    reminded.then_some(demande_at),
                ],
            )
            .unwrap();
    }

    #[test]
    fn reminder_waits_three_days_after_the_request() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        let demande_at = 1_700_000_000;
        insert_demande(&db, 10, 1, DEMANDE_EN_ATTENTE, demande_at, true, false);

        assert!(db
            .claim_demande_reminders(demande_at + REMINDER_AFTER_SECS - 1, REMINDER_AFTER_SECS)
            .unwrap()
            .is_empty());
        let claimed = db
            .claim_demande_reminders(demande_at + REMINDER_AFTER_SECS, REMINDER_AFTER_SECS)
            .unwrap();
        assert_eq!(claimed.len(), 1);
        assert_eq!(claimed[0].demande_id, 10);
        assert_eq!(claimed[0].libelle, "Carte d'identité");
    }

    #[test]
    fn a_demande_is_reminded_once() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        insert_demande(&db, 10, 1, DEMANDE_EN_ATTENTE, 1, true, false);
        let now = 1 + REMINDER_AFTER_SECS;
        assert_eq!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().len(), 1);
        assert!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().is_empty());
    }

    #[test]
    fn a_failed_send_is_offered_again() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        insert_demande(&db, 10, 1, DEMANDE_EN_ATTENTE, 1, true, false);
        let now = 1 + REMINDER_AFTER_SECS;
        assert_eq!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().len(), 1);
        db.release_demande_reminder(10).unwrap();
        assert_eq!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().len(), 1);
    }

    #[test]
    fn received_or_cancelled_demandes_are_not_reminded() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        insert_demande(&db, 11, 1, "recu", 1, true, false);
        insert_demande(&db, 12, 1, "annule", 1, true, false);
        let now = 1 + REMINDER_AFTER_SECS;
        assert!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().is_empty());
    }

    #[test]
    fn first_email_must_have_gone_out() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        insert_demande(&db, 10, 1, DEMANDE_EN_ATTENTE, 1, false, false);
        let now = 1 + REMINDER_AFTER_SECS;
        assert!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().is_empty());
    }

    #[test]
    fn revoked_access_is_not_reminded() {
        let db = PortalDb::open(":memory:").unwrap();
        db.conn()
            .execute(
                "INSERT INTO espace_acces (contact_id, statut, email)
                 VALUES (1, 'revoque', 'client@example.com')",
                [],
            )
            .unwrap();
        insert_demande(&db, 10, 1, DEMANDE_EN_ATTENTE, 1, true, false);
        let now = 1 + REMINDER_AFTER_SECS;
        assert!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().is_empty());
    }

    #[test]
    fn a_claimed_reminder_is_dropped_if_the_demande_is_no_longer_pending() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        insert_demande(&db, 10, 1, DEMANDE_EN_ATTENTE, 1, true, false);
        let now = 1 + REMINDER_AFTER_SECS;
        assert_eq!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().len(), 1);
        assert!(db.reminder_still_sendable(10).unwrap());
        db.conn()
            .execute(
                "UPDATE espace_demande SET statut = 'annule' WHERE id = 10",
                [],
            )
            .unwrap();
        assert!(!db.reminder_still_sendable(10).unwrap());
    }

    #[test]
    fn a_claimed_reminder_is_dropped_if_access_is_revoked() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        insert_demande(&db, 10, 1, DEMANDE_EN_ATTENTE, 1, true, false);
        let now = 1 + REMINDER_AFTER_SECS;
        assert_eq!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().len(), 1);
        db.upsert_acces_from_sync(1, "revoque", None, None, None).unwrap();
        assert!(!db.reminder_still_sendable(10).unwrap());
    }

    #[test]
    fn a_claimed_reminder_is_dropped_once_the_file_is_received() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        insert_demande(&db, 10, 1, DEMANDE_EN_ATTENTE, 1, true, false);
        let now = 1 + REMINDER_AFTER_SECS;
        assert_eq!(db.claim_demande_reminders(now, REMINDER_AFTER_SECS).unwrap().len(), 1);
        db.conn()
            .execute(
                "UPDATE espace_demande SET statut = 'recu' WHERE id = 10",
                [],
            )
            .unwrap();
        assert!(!db.reminder_still_sendable(10).unwrap());
    }
}
