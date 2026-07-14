//! Action « créer une tâche » liée à un modèle email (déclenchée à l'envoi campagne).

use super::models::TemplateEmailAction;
use rusqlite::{params, OptionalExtension, Result};

enum ReconcileTacheOutcome {
    Purged,
    EcheanceFixed,
    Unchanged,
}

fn normalize_priorite(value: Option<&str>) -> String {
    match value {
        Some("BASSE") => "BASSE".to_string(),
        Some("HAUTE") => "HAUTE".to_string(),
        _ => "NORMALE".to_string(),
    }
}

fn render_tache_titre(template: &str, prenom: &str, nom: &str) -> String {
    template
        .replace("{prenom}", prenom)
        .replace("{nom}", nom)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn tache_echeance(eligible_at: i64, delai_jours: i64) -> i64 {
    let day = eligible_at - eligible_at.rem_euclid(86_400);
    day + delai_jours.max(0) * 86_400
}

impl super::Database {
    pub fn migrate_template_email_actions(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS template_email_actions (
                template_id INTEGER PRIMARY KEY,
                tache_actif INTEGER NOT NULL DEFAULT 0,
                tache_titre TEXT,
                tache_priorite TEXT NOT NULL DEFAULT 'NORMALE',
                tache_delai_jours INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (template_id) REFERENCES templates_email(id) ON DELETE CASCADE
            )",
            [],
        )?;
        if !self.table_has_column("contact_template_envois", "tache_id")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN tache_id INTEGER",
                [],
            )?;
            println!("✅ Migration: colonne tache_id sur contact_template_envois");
        }
        Ok(())
    }

    pub fn get_template_email_action(
        &self,
        template_id: i64,
    ) -> Result<Option<TemplateEmailAction>> {
        self.conn
            .query_row(
                "SELECT template_id, tache_actif, tache_titre, tache_priorite, tache_delai_jours
                 FROM template_email_actions WHERE template_id = ?1",
                params![template_id],
                |row| {
                    Ok(TemplateEmailAction {
                        template_id: row.get(0)?,
                        tache_actif: row.get::<_, i64>(1)? != 0,
                        tache_titre: row.get(2)?,
                        tache_priorite: row.get(3)?,
                        tache_delai_jours: row.get(4)?,
                    })
                },
            )
            .optional()
    }

    pub fn set_template_email_action(&self, action: &TemplateEmailAction) -> Result<()> {
        let priorite = normalize_priorite(action.tache_priorite.as_str().into());
        let titre = action
            .tache_titre
            .as_ref()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty());
        let actif = if action.tache_actif { 1 } else { 0 };
        let delai = action.tache_delai_jours.max(0);

        self.conn.execute(
            "INSERT INTO template_email_actions
                (template_id, tache_actif, tache_titre, tache_priorite, tache_delai_jours)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(template_id) DO UPDATE SET
                tache_actif = excluded.tache_actif,
                tache_titre = excluded.tache_titre,
                tache_priorite = excluded.tache_priorite,
                tache_delai_jours = excluded.tache_delai_jours,
                updated_at = unixepoch()",
            params![action.template_id, actif, titre, priorite, delai],
        )?;

        let _ = self.reconcile_template_email_tache_actions_for_template(action.template_id)?;
        Ok(())
    }

    /// Tente de créer la tâche après envoi effectif (idempotent par ligne file d'envoi).
    pub(crate) fn try_apply_template_email_tache_for_sent_row(
        &self,
        row_id: i64,
        sent_at: i64,
    ) -> Result<bool> {
        let row: Option<(i64, i64, Option<i64>)> = self
            .conn
            .query_row(
                "SELECT contact_id, template_id, tache_id FROM contact_template_envois WHERE id = ?1",
                params![row_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let Some((contact_id, template_id, existing)) = row else {
            return Ok(false);
        };
        if existing.is_some() {
            return Ok(false);
        }
        self.apply_template_email_tache_action(row_id, contact_id, template_id, sent_at)?;
        let created: bool = self
            .conn
            .query_row(
                "SELECT COALESCE(tache_id IS NOT NULL, 0) FROM contact_template_envois WHERE id = ?1",
                params![row_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            != 0;
        Ok(created)
    }

    pub(crate) fn apply_pending_template_email_tache_actions(
        &self,
        template_id: i64,
    ) -> Result<u32> {
        let Some(action) = self.get_template_email_action(template_id)? else {
            return Ok(0);
        };
        if !action.tache_actif {
            return Ok(0);
        }

        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, COALESCE(email_date_envoi, 0)
             FROM contact_template_envois
             WHERE template_id = ?1 AND email_envoye = 1 AND tache_id IS NULL",
        )?;
        let rows: Vec<(i64, i64, i64)> = stmt
            .query_map(params![template_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut created = 0u32;
        for (row_id, contact_id, sent_at) in rows {
            if sent_at <= 0 {
                continue;
            }
            if self.apply_template_email_tache_action(row_id, contact_id, template_id, sent_at).is_ok()
            {
                let has: bool = self
                    .conn
                    .query_row(
                        "SELECT COALESCE(tache_id IS NOT NULL, 0) FROM contact_template_envois WHERE id = ?1",
                        params![row_id],
                        |row| row.get::<_, i64>(0),
                    )
                    .unwrap_or(0)
                    != 0;
                if has {
                    created += 1;
                }
            }
        }
        Ok(created)
    }

    pub(crate) fn reconcile_template_email_tache_actions_for_template(
        &self,
        template_id: i64,
    ) -> Result<(u32, u32, u32)> {
        let (purged, fixed) =
            self.reconcile_existing_template_email_taches_for_template(template_id)?;
        let backfilled = self.apply_pending_template_email_tache_actions(template_id)?;
        Ok((purged, fixed, backfilled))
    }

    fn reconcile_existing_template_email_taches_for_template(
        &self,
        template_id: i64,
    ) -> Result<(u32, u32)> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, tache_id, COALESCE(email_date_envoi, 0)
             FROM contact_template_envois
             WHERE template_id = ?1 AND tache_id IS NOT NULL",
        )?;
        let rows: Vec<(i64, i64, i64, i64)> = stmt
            .query_map(params![template_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut purged = 0u32;
        let mut fixed = 0u32;
        for (row_id, contact_id, tache_id, sent_at) in rows {
            match self.reconcile_one_template_email_tache(
                row_id,
                contact_id,
                template_id,
                tache_id,
                sent_at,
            )? {
                ReconcileTacheOutcome::Purged => purged += 1,
                ReconcileTacheOutcome::EcheanceFixed => fixed += 1,
                ReconcileTacheOutcome::Unchanged => {}
            }
        }
        Ok((purged, fixed))
    }

    fn reconcile_one_template_email_tache(
        &self,
        row_id: i64,
        _contact_id: i64,
        template_id: i64,
        tache_id: i64,
        sent_at: i64,
    ) -> Result<ReconcileTacheOutcome> {
        let Some(action) = self.get_template_email_action(template_id)? else {
            self.purge_template_email_tache_link(row_id, tache_id)?;
            return Ok(ReconcileTacheOutcome::Purged);
        };
        if !action.tache_actif {
            self.purge_template_email_tache_link(row_id, tache_id)?;
            return Ok(ReconcileTacheOutcome::Purged);
        }
        if sent_at <= 0 {
            self.purge_template_email_tache_link(row_id, tache_id)?;
            return Ok(ReconcileTacheOutcome::Purged);
        }

        let expected_echeance = tache_echeance(sent_at, action.tache_delai_jours);
        let current_echeance: Option<i64> = self
            .conn
            .query_row(
                "SELECT date_echeance FROM taches WHERE id = ?1",
                params![tache_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(current) = current_echeance else {
            self.conn.execute(
                "UPDATE contact_template_envois SET tache_id = NULL WHERE id = ?1",
                params![row_id],
            )?;
            return Ok(ReconcileTacheOutcome::Purged);
        };

        if current != expected_echeance {
            self.conn.execute(
                "UPDATE taches SET date_echeance = ?1, updated_at = unixepoch() WHERE id = ?2",
                params![expected_echeance, tache_id],
            )?;
            return Ok(ReconcileTacheOutcome::EcheanceFixed);
        }
        Ok(ReconcileTacheOutcome::Unchanged)
    }

    fn purge_template_email_tache_link(&self, row_id: i64, tache_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_template_envois SET tache_id = NULL WHERE id = ?1",
            params![row_id],
        )?;
        self.conn
            .execute("DELETE FROM taches WHERE id = ?1", params![tache_id])?;
        Ok(())
    }

    pub(crate) fn apply_template_email_tache_action(
        &self,
        row_id: i64,
        contact_id: i64,
        template_id: i64,
        eligible_at: i64,
    ) -> Result<()> {
        let Some(action) = self.get_template_email_action(template_id)? else {
            return Ok(());
        };
        if !action.tache_actif {
            return Ok(());
        }
        let Some(template) = action.tache_titre.as_ref().map(|t| t.trim()).filter(|t| !t.is_empty())
        else {
            return Ok(());
        };

        let existing: Option<Option<i64>> = self
            .conn
            .query_row(
                "SELECT tache_id FROM contact_template_envois WHERE id = ?1",
                params![row_id],
                |row| row.get(0),
            )
            .optional()?;
        if existing.flatten().is_some() {
            return Ok(());
        }

        let contact = self.get_contact_by_id(contact_id)?;
        let titre = render_tache_titre(template, &contact.prenom, &contact.nom);
        if titre.is_empty() {
            return Ok(());
        }
        let priorite = normalize_priorite(action.tache_priorite.as_str().into());
        let echeance = tache_echeance(eligible_at, action.tache_delai_jours);

        self.conn.execute(
            "INSERT INTO taches (titre, date_echeance, priorite, statut)
             VALUES (?1, ?2, ?3, 'A_FAIRE')",
            params![titre, echeance, priorite],
        )?;
        let tache_id = self.conn.last_insert_rowid();

        self.conn.execute(
            "INSERT OR IGNORE INTO tache_contacts (tache_id, contact_id) VALUES (?1, ?2)",
            params![tache_id, contact_id],
        )?;

        self.conn.execute(
            "UPDATE contact_template_envois SET tache_id = ?1 WHERE id = ?2",
            params![tache_id, row_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewTemplateEmail, TemplateEmailAction};
    use crate::database::Database;

    fn mem_db() -> Database {
        Database::open_in_memory_for_tests().expect("db mémoire")
    }

    fn insert_contact(db: &Database, prenom: &str, nom: &str) -> i64 {
        db.create_contact(NewContact {
            categorie: "CLIENT".to_string(),
            nom: nom.to_string(),
            prenom: prenom.to_string(),
            ..Default::default()
        })
        .unwrap()
        .id
        .unwrap()
    }

    fn insert_template(db: &Database, nom: &str) -> i64 {
        db.create_template_email(NewTemplateEmail {
            nom: nom.to_string(),
            sujet: "Objet".into(),
            corps: "Corps".into(),
            categorie: "RELANCE".into(),
            variables: None,
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })
        .unwrap()
        .id
    }

    fn insert_queue_row(db: &Database, contact_id: i64, template_id: i64) -> i64 {
        db.get_connection()
            .execute(
                "INSERT INTO contact_template_envois (contact_id, template_id, trigger_event_at)
                 VALUES (?1, ?2, unixepoch())",
                params![contact_id, template_id],
            )
            .unwrap();
        db.get_connection().last_insert_rowid()
    }

    fn action(template_id: i64, titre: &str, delai: i64) -> TemplateEmailAction {
        TemplateEmailAction {
            template_id,
            tache_actif: true,
            tache_titre: Some(titre.to_string()),
            tache_priorite: "HAUTE".to_string(),
            tache_delai_jours: delai,
        }
    }

    #[test]
    fn set_and_get_roundtrip_normalizes_priorite() {
        let db = mem_db();
        let tid = insert_template(&db, "Suivi annuel");
        db.set_template_email_action(&TemplateEmailAction {
            template_id: tid,
            tache_actif: true,
            tache_titre: Some("  Rappeler   {prenom}  ".to_string()),
            tache_priorite: "XYZ".to_string(),
            tache_delai_jours: -3,
        })
        .unwrap();

        let got = db.get_template_email_action(tid).unwrap().unwrap();
        assert!(got.tache_actif);
        assert_eq!(got.tache_titre.as_deref(), Some("Rappeler   {prenom}"));
        assert_eq!(got.tache_priorite, "NORMALE");
        assert_eq!(got.tache_delai_jours, 0);
    }

    #[test]
    fn mark_sent_creates_one_task_and_is_idempotent() {
        let db = mem_db();
        let tid = insert_template(&db, "Campagne test");
        let cid = insert_contact(&db, "Marie", "Durand");
        db.set_template_email_action(&action(tid, "Appeler {prenom} {nom}", 7))
            .unwrap();
        let row_id = insert_queue_row(&db, cid, tid);

        db.mark_template_email_sent(row_id, None, None, Some("Sujet"), None, None, None)
            .unwrap();
        assert!(!db
            .try_apply_template_email_tache_for_sent_row(row_id, 1_700_000_000)
            .unwrap());

        let sent_at: i64 = db
            .get_connection()
            .query_row(
                "SELECT email_date_envoi FROM contact_template_envois WHERE id = ?1",
                params![row_id],
                |row| row.get(0),
            )
            .unwrap();

        let taches = db.get_taches_by_contact(cid).unwrap();
        assert_eq!(taches.len(), 1);
        assert_eq!(taches[0].titre, "Appeler Marie Durand");
        assert_eq!(taches[0].priorite, "HAUTE");
        assert_eq!(taches[0].date_echeance, Some(tache_echeance(sent_at, 7)));
        assert!(taches[0].from_template_auto);
    }

    #[test]
    fn backfill_creates_tasks_for_already_sent_rows() {
        let db = mem_db();
        let tid = insert_template(&db, "Relance");
        let cid = insert_contact(&db, "Luc", "Bernard");
        let row_id = insert_queue_row(&db, cid, tid);
        let sent_at = 1_700_100_000_i64;
        db.get_connection()
            .execute(
                "UPDATE contact_template_envois SET email_envoye = 1, email_date_envoi = ?1 WHERE id = ?2",
                params![sent_at, row_id],
            )
            .unwrap();

        db.set_template_email_action(&action(tid, "Suivi {prenom}", 15))
            .unwrap();

        let taches = db.get_taches_by_contact(cid).unwrap();
        assert_eq!(taches.len(), 1);
        assert_eq!(taches[0].titre, "Suivi Luc");
        assert_eq!(
            taches[0].date_echeance,
            Some(tache_echeance(sent_at, 15))
        );
    }
}
