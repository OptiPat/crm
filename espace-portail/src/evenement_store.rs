//! Notification des événements ajoutés par le conseiller.
//!
//! Le CRM transmet ces événements dans la timeline. Le portail retient ceux
//! qu'il a déjà annoncés par email : sans cette trace, chaque synchronisation
//! renverrait le même message, et le client finirait par tous les ignorer.

use rusqlite::{params, Result};
use serde_json::Value;

use crate::db::PortalDb;

/// Un événement à annoncer au client, prêt pour l'envoi.
#[derive(Debug, Clone)]
pub struct EvenementEmailNotification {
    pub evenement_id: String,
    pub contact_id: i64,
    pub email: String,
    pub prenom: String,
    pub titre: String,
    pub message: Option<String>,
    pub date_label: String,
}

/// Kind porté par les échéances rédigées à la main dans le CRM. Les autres
/// lignes de la timeline viennent des placements : elles n'ont pas à
/// déclencher d'email, le client ne les découvre pas.
const KIND_CONSEILLER: &str = "conseiller";

fn format_date(unix: i64) -> String {
    use chrono::{Local, TimeZone};
    match Local.timestamp_opt(unix, 0).single() {
        Some(date) => date.format("%d/%m/%Y").to_string(),
        None => String::new(),
    }
}

impl PortalDb {
    pub(crate) fn ensure_evenement_table(&self) -> Result<()> {
        self.conn().execute(
            "CREATE TABLE IF NOT EXISTS espace_evenement_notifie (
                evenement_id TEXT PRIMARY KEY,
                contact_id INTEGER NOT NULL,
                notified_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;
        Ok(())
    }

    /// Événements de la charge utile jamais annoncés à ce client, **réservés**
    /// au passage.
    ///
    /// La réservation est prise ici, avant l'envoi : deux synchronisations
    /// simultanées (push unitaire et push groupé, par exemple) sélectionneraient
    /// sinon le même événement et le client recevrait deux fois la nouvelle. Un
    /// envoi qui échoue rend sa réservation (`release_evenement_notification`).
    pub fn claim_evenement_notifications(
        &self,
        contact_id: i64,
        payload: &Value,
    ) -> Result<Vec<EvenementEmailNotification>> {
        self.ensure_evenement_table()?;

        let Some(events) = payload.get("timeline").and_then(|v| v.as_array()) else {
            return Ok(vec![]);
        };
        let Some(email) = self.client_email(contact_id)? else {
            return Ok(vec![]);
        };
        let prenom = payload
            .pointer("/contact/prenom")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut notifications = Vec::new();
        for event in events {
            if event.get("kind").and_then(|v| v.as_str()) != Some(KIND_CONSEILLER) {
                continue;
            }
            let Some(id) = event.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            if !self.claim_evenement_notification(id, contact_id)? {
                continue;
            }

            notifications.push(EvenementEmailNotification {
                evenement_id: id.to_string(),
                contact_id,
                email: email.clone(),
                prenom: prenom.clone(),
                titre: event
                    .get("label")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Événement")
                    .to_string(),
                message: event
                    .get("detail")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                date_label: format_date(
                    event.get("date").and_then(|v| v.as_i64()).unwrap_or_default(),
                ),
            });
        }

        Ok(notifications)
    }

    /// `true` si la réservation vient d'être prise, `false` si l'événement
    /// était déjà annoncé ou réservé ailleurs. L'insertion étant atomique, deux
    /// appels concurrents ne peuvent pas réussir tous les deux.
    fn claim_evenement_notification(&self, evenement_id: &str, contact_id: i64) -> Result<bool> {
        let inserees = self.conn().execute(
            "INSERT OR IGNORE INTO espace_evenement_notifie (evenement_id, contact_id)
             VALUES (?1, ?2)",
            params![evenement_id, contact_id],
        )?;
        Ok(inserees > 0)
    }

    /// Envoi échoué : la nouvelle sera reproposée à la prochaine photo.
    pub fn release_evenement_notification(&self, evenement_id: &str) -> Result<()> {
        self.conn().execute(
            "DELETE FROM espace_evenement_notifie WHERE evenement_id = ?1",
            params![evenement_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn payload(events: Value) -> Value {
        json!({
            "contact": { "prenom": "Jean", "nom": "DUPONT" },
            "timeline": events,
        })
    }

    fn db_avec_client() -> PortalDb {
        let db = PortalDb::open(":memory:").unwrap();
        db.conn()
            .execute(
                "INSERT INTO espace_acces (contact_id, statut, email, premiere_connexion_at)
                 VALUES (1, 'actif', 'client@example.com', unixepoch())",
                [],
            )
            .unwrap();
        db
    }

    /// Seules les échéances rédigées à la main déclenchent un email : une fin
    /// de prêt n'est pas une nouvelle que le conseiller annonce.
    #[test]
    fn only_advisor_events_are_announced() {
        let db = db_avec_client();
        let charge = payload(json!([
            { "id": "echeance-1", "kind": "conseiller", "label": "Déclaration", "date": 1_800_000_000 },
            { "id": "inv-2-fin_pret", "kind": "fin_pret", "label": "Fin de prêt", "date": 1_800_000_000 },
        ]));

        let notifications = db.claim_evenement_notifications(1, &charge).unwrap();
        assert_eq!(notifications.len(), 1);
        assert_eq!(notifications[0].evenement_id, "echeance-1");
        assert_eq!(notifications[0].titre, "Déclaration");
    }

    /// La réservation est prise dès la sélection : deux synchronisations qui se
    /// croisent ne peuvent pas annoncer deux fois la même nouvelle.
    #[test]
    fn an_event_is_announced_once() {
        let db = db_avec_client();
        let charge = payload(json!([
            { "id": "echeance-1", "kind": "conseiller", "label": "Déclaration", "date": 1_800_000_000 },
        ]));

        assert_eq!(db.claim_evenement_notifications(1, &charge).unwrap().len(), 1);
        assert!(db.claim_evenement_notifications(1, &charge).unwrap().is_empty());
    }

    /// Envoi échoué : la nouvelle doit repartir à la synchronisation suivante,
    /// sinon le client ne l'apprendra jamais.
    #[test]
    fn a_failed_send_is_offered_again() {
        let db = db_avec_client();
        let charge = payload(json!([
            { "id": "echeance-1", "kind": "conseiller", "label": "Déclaration", "date": 1_800_000_000 },
        ]));

        assert_eq!(db.claim_evenement_notifications(1, &charge).unwrap().len(), 1);
        db.release_evenement_notification("echeance-1").unwrap();
        assert_eq!(db.claim_evenement_notifications(1, &charge).unwrap().len(), 1);
    }

    #[test]
    fn a_contact_without_email_gets_nothing() {
        let db = PortalDb::open(":memory:").unwrap();
        db.conn()
            .execute(
                "INSERT INTO espace_acces (contact_id, statut, email) VALUES (2, 'actif', '')",
                [],
            )
            .unwrap();
        let charge = payload(json!([
            { "id": "echeance-9", "kind": "conseiller", "label": "X", "date": 1_800_000_000 },
        ]));

        assert!(db.claim_evenement_notifications(2, &charge).unwrap().is_empty());
    }
}
