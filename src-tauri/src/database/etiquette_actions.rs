//! Actions automatiques rattachées à une étiquette.
//!
//! Aujourd'hui une seule action : « créer une tâche » au **déclenchement campagne**
//! (mail Stellium pour Exceltis, envoi email pour les autres campagnes).
//! Stockée dans `etiquette_actions` pour rester extensible.

use super::models::EtiquetteAction;
use rusqlite::{params, OptionalExtension, Result};

enum ReconcileTacheOutcome {
    Purged,
    EcheanceFixed,
    Unchanged,
}

/// Normalise la priorité de tâche vers l'une des trois valeurs autorisées.
fn normalize_priorite(value: Option<&str>) -> String {
    match value {
        Some("BASSE") => "BASSE".to_string(),
        Some("HAUTE") => "HAUTE".to_string(),
        _ => "NORMALE".to_string(),
    }
}

/// Remplace `{prenom}` / `{nom}` dans le modèle de titre, puis nettoie les espaces.
fn render_tache_titre(template: &str, prenom: &str, nom: &str) -> String {
    template
        .replace("{prenom}", prenom)
        .replace("{nom}", nom)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Échéance = jour d'éligibilité (minuit UTC) + N jours. N négatif est ramené à 0.
fn tache_echeance(eligible_at: i64, delai_jours: i64) -> i64 {
    let day = eligible_at - eligible_at.rem_euclid(86_400);
    day + delai_jours.max(0) * 86_400
}

impl super::Database {
    /// Lit l'action d'une étiquette (None si jamais configurée).
    pub fn get_etiquette_action(&self, etiquette_id: i64) -> Result<Option<EtiquetteAction>> {
        self.conn
            .query_row(
                "SELECT etiquette_id, tache_actif, tache_titre, tache_priorite, tache_delai_jours
                 FROM etiquette_actions WHERE etiquette_id = ?1",
                params![etiquette_id],
                |row| {
                    Ok(EtiquetteAction {
                        etiquette_id: row.get(0)?,
                        tache_actif: row.get::<_, i64>(1)? != 0,
                        tache_titre: row.get(2)?,
                        tache_priorite: row.get(3)?,
                        tache_delai_jours: row.get(4)?,
                    })
                },
            )
            .optional()
    }

    /// Crée ou met à jour l'action d'une étiquette (upsert).
    /// Si l'action tâche est active, rattrape les contacts déjà en campagne sans tâche.
    pub fn set_etiquette_action(&self, action: &EtiquetteAction) -> Result<()> {
        let priorite = normalize_priorite(action.tache_priorite.as_str().into());
        let titre = action
            .tache_titre
            .as_ref()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty());
        let actif = if action.tache_actif { 1 } else { 0 };
        let delai = action.tache_delai_jours.max(0);

        self.conn.execute(
            "INSERT INTO etiquette_actions
                (etiquette_id, tache_actif, tache_titre, tache_priorite, tache_delai_jours)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(etiquette_id) DO UPDATE SET
                tache_actif = excluded.tache_actif,
                tache_titre = excluded.tache_titre,
                tache_priorite = excluded.tache_priorite,
                tache_delai_jours = excluded.tache_delai_jours,
                updated_at = unixepoch()",
            params![action.etiquette_id, actif, titre, priorite, delai],
        )?;

        let _ = self.reconcile_etiquette_tache_actions_for_etiquette(action.etiquette_id)?;
        Ok(())
    }

    /// Date de référence pour l'échéance tâche : None si la campagne n'est pas encore déclenchée.
    pub(crate) fn resolve_tache_eligible_at(
        &self,
        contact_id: i64,
        etiquette_id: i64,
    ) -> Result<Option<i64>> {
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        let row = self
            .conn
            .query_row(
                "SELECT email_date_prevue, email_envoye, email_date_envoi
                 FROM contact_etiquettes
                 WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![contact_id, etiquette_id],
                |row| {
                    Ok((
                        row.get::<_, Option<i64>>(0)?,
                        row.get::<_, i64>(1)? != 0,
                        row.get::<_, Option<i64>>(2)?,
                    ))
                },
            )
            .optional()?;
        let Some((_, email_envoye, email_date_envoi)) = row else {
            return Ok(None);
        };

        if crate::email::stellium_exceltis::is_exceltis_etiquette_nom(&etiquette.nom) {
            // Campagne Exceltis déclenchée = signal Stellium connu (pas seule la date planifiée).
            return crate::email::stellium_exceltis::stellium_signal_received_at_for_etiquette(
                self, etiquette_id,
            )
            .map_err(|e| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e,
                )))
            });
        }

        // Autres campagnes email : tâche à l'envoi effectif du mail campagne.
        if !email_envoye {
            return Ok(None);
        }
        Ok(email_date_envoi)
    }

    /// Tente de créer la tâche si la campagne est déclenchée pour ce contact. Retourne true si créée.
    pub(crate) fn try_apply_etiquette_tache_for_contact(
        &self,
        contact_id: i64,
        etiquette_id: i64,
    ) -> Result<bool> {
        let Some(eligible_at) = self.resolve_tache_eligible_at(contact_id, etiquette_id)? else {
            return Ok(false);
        };
        let had_tache: bool = self
            .conn
            .query_row(
                "SELECT COALESCE(tache_id IS NOT NULL, 0) FROM contact_etiquettes
                 WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![contact_id, etiquette_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            != 0;
        if had_tache {
            return Ok(false);
        }
        self.apply_etiquette_tache_action(contact_id, etiquette_id, eligible_at)?;
        let created: bool = self
            .conn
            .query_row(
                "SELECT COALESCE(tache_id IS NOT NULL, 0) FROM contact_etiquettes
                 WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![contact_id, etiquette_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            != 0;
        Ok(created)
    }

    /// Crée les tâches manquantes pour tous les contacts éligibles d'une étiquette.
    pub(crate) fn apply_pending_tache_actions_for_etiquette(
        &self,
        etiquette_id: i64,
    ) -> Result<u32> {
        let Some(action) = self.get_etiquette_action(etiquette_id)? else {
            return Ok(0);
        };
        if !action.tache_actif {
            return Ok(0);
        }

        let mut stmt = self.conn.prepare(
            "SELECT contact_id FROM contact_etiquettes
             WHERE etiquette_id = ?1 AND tache_id IS NULL",
        )?;
        let contact_ids: Vec<i64> = stmt
            .query_map(params![etiquette_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut created = 0u32;
        for contact_id in contact_ids {
            if self.try_apply_etiquette_tache_for_contact(contact_id, etiquette_id)? {
                created += 1;
            }
        }
        Ok(created)
    }

    /// Reprend les tâches d'une étiquette : purge prématurées, corrige échéances, crée les manquantes.
    pub(crate) fn reconcile_etiquette_tache_actions_for_etiquette(
        &self,
        etiquette_id: i64,
    ) -> Result<(u32, u32, u32)> {
        let (purged, fixed) = self.reconcile_existing_etiquette_taches_for_etiquette(etiquette_id)?;
        let backfilled = self.apply_pending_tache_actions_for_etiquette(etiquette_id)?;
        Ok((purged, fixed, backfilled))
    }

    /// Reprise globale (migration démarrage) : toutes les étiquettes avec action tâche active.
    pub(crate) fn reconcile_all_etiquette_tache_actions(&self) -> Result<(u32, u32, u32)> {
        let (purged, fixed) = self.reconcile_existing_etiquette_taches_all()?;
        let mut backfilled = 0u32;
        let mut stmt = self.conn.prepare(
            "SELECT etiquette_id FROM etiquette_actions WHERE tache_actif = 1",
        )?;
        let etiquette_ids: Vec<i64> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for etiquette_id in etiquette_ids {
            backfilled += self.apply_pending_tache_actions_for_etiquette(etiquette_id)?;
        }
        Ok((purged, fixed, backfilled))
    }

    fn reconcile_existing_etiquette_taches_for_etiquette(
        &self,
        etiquette_id: i64,
    ) -> Result<(u32, u32)> {
        let mut stmt = self.conn.prepare(
            "SELECT contact_id, tache_id FROM contact_etiquettes
             WHERE etiquette_id = ?1 AND tache_id IS NOT NULL",
        )?;
        let rows: Vec<(i64, i64)> = stmt
            .query_map(params![etiquette_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut purged = 0u32;
        let mut fixed = 0u32;
        for (contact_id, tache_id) in rows {
            match self.reconcile_one_etiquette_tache(contact_id, etiquette_id, tache_id)? {
                ReconcileTacheOutcome::Purged => purged += 1,
                ReconcileTacheOutcome::EcheanceFixed => fixed += 1,
                ReconcileTacheOutcome::Unchanged => {}
            }
        }
        Ok((purged, fixed))
    }

    fn reconcile_existing_etiquette_taches_all(&self) -> Result<(u32, u32)> {
        let mut stmt = self.conn.prepare(
            "SELECT contact_id, etiquette_id, tache_id FROM contact_etiquettes
             WHERE tache_id IS NOT NULL",
        )?;
        let rows: Vec<(i64, i64, i64)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut purged = 0u32;
        let mut fixed = 0u32;
        for (contact_id, etiquette_id, tache_id) in rows {
            match self.reconcile_one_etiquette_tache(contact_id, etiquette_id, tache_id)? {
                ReconcileTacheOutcome::Purged => purged += 1,
                ReconcileTacheOutcome::EcheanceFixed => fixed += 1,
                ReconcileTacheOutcome::Unchanged => {}
            }
        }
        Ok((purged, fixed))
    }

    fn reconcile_one_etiquette_tache(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        tache_id: i64,
    ) -> Result<ReconcileTacheOutcome> {
        let Some(eligible_at) = self.resolve_tache_eligible_at(contact_id, etiquette_id)? else {
            self.conn.execute(
                "UPDATE contact_etiquettes SET tache_id = NULL WHERE tache_id = ?1",
                params![tache_id],
            )?;
            self.conn.execute("DELETE FROM taches WHERE id = ?1", params![tache_id])?;
            return Ok(ReconcileTacheOutcome::Purged);
        };

        let Some(action) = self.get_etiquette_action(etiquette_id)? else {
            self.conn.execute(
                "UPDATE contact_etiquettes SET tache_id = NULL WHERE tache_id = ?1",
                params![tache_id],
            )?;
            self.conn.execute("DELETE FROM taches WHERE id = ?1", params![tache_id])?;
            return Ok(ReconcileTacheOutcome::Purged);
        };
        if !action.tache_actif {
            self.conn.execute(
                "UPDATE contact_etiquettes SET tache_id = NULL WHERE tache_id = ?1",
                params![tache_id],
            )?;
            self.conn.execute("DELETE FROM taches WHERE id = ?1", params![tache_id])?;
            return Ok(ReconcileTacheOutcome::Purged);
        }

        let expected_echeance = tache_echeance(eligible_at, action.tache_delai_jours);
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
                "UPDATE contact_etiquettes SET tache_id = NULL WHERE tache_id = ?1",
                params![tache_id],
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

    /// Déclenche l'action « tâche » d'une étiquette pour un contact, au plus une fois
    /// par liaison contact↔étiquette (déduplication via `contact_etiquettes.tache_id`).
    ///
    /// Appelé au déclenchement campagne (Stellium ou envoi email). Idempotent.
    pub(crate) fn apply_etiquette_tache_action(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        eligible_at: i64,
    ) -> Result<()> {
        let Some(action) = self.get_etiquette_action(etiquette_id)? else {
            return Ok(());
        };
        if !action.tache_actif {
            return Ok(());
        }
        let Some(template) = action.tache_titre.as_ref().map(|t| t.trim()).filter(|t| !t.is_empty())
        else {
            return Ok(());
        };

        let row = self
            .conn
            .query_row(
                "SELECT id, tache_id FROM contact_etiquettes
                 WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![contact_id, etiquette_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?)),
            )
            .optional()?;
        let Some((ce_id, existing_tache)) = row else {
            return Ok(());
        };
        if existing_tache.is_some() {
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
            "UPDATE contact_etiquettes SET tache_id = ?1 WHERE id = ?2",
            params![tache_id, ce_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{EtiquetteAction, NewContact};
    use crate::database::Database;

    fn mem_db() -> Database {
        Database::open_in_memory_for_tests().expect("db mémoire")
    }

    fn insert_etiquette(db: &Database, nom: &str) -> i64 {
        db.get_connection()
            .execute("INSERT INTO etiquettes (nom) VALUES (?1)", params![nom])
            .unwrap();
        db.get_connection().last_insert_rowid()
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

    fn action(etiquette_id: i64, titre: &str, delai: i64) -> EtiquetteAction {
        EtiquetteAction {
            etiquette_id,
            tache_actif: true,
            tache_titre: Some(titre.to_string()),
            tache_priorite: "HAUTE".to_string(),
            tache_delai_jours: delai,
        }
    }

    fn insert_exceltis_stellium_signal(db: &Database, etiquette_id: i64, received_at: i64) {
        let etiquette = db.get_etiquette_by_id(etiquette_id).unwrap();
        let state_json = serde_json::json!({
            "signals": [{
                "gmailMessageId": format!("test-msg-{etiquette_id}"),
                "subject": "Remboursement Exceltis",
                "millesimeLabel": "Test",
                "etiquetteNom": etiquette.nom,
                "etiquetteId": etiquette_id,
                "contactCount": 0,
                "receivedAt": received_at,
            }]
        });
        db.set_setting("stellium_exceltis_signals_v1", &state_json.to_string())
            .unwrap();
    }

    #[test]
    fn set_and_get_roundtrip_normalizes_priorite() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Arbitrage");
        db.set_etiquette_action(&EtiquetteAction {
            etiquette_id: eid,
            tache_actif: true,
            tache_titre: Some("  Préparer   bilan  ".to_string()),
            tache_priorite: "FANTAISIE".to_string(),
            tache_delai_jours: -5,
        })
        .unwrap();

        let got = db.get_etiquette_action(eid).unwrap().unwrap();
        assert!(got.tache_actif);
        assert_eq!(got.tache_titre.as_deref(), Some("Préparer   bilan"));
        assert_eq!(got.tache_priorite, "NORMALE");
        assert_eq!(got.tache_delai_jours, 0);
    }

    #[test]
    fn apply_creates_one_task_and_is_idempotent() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Relance");
        let cid = insert_contact(&db, "Marie", "Durand");
        db.set_etiquette_action(&action(eid, "Appeler {prenom} {nom}", 7))
            .unwrap();
        db.attribuer_etiquette(cid, eid, Some("AUTO".to_string()), None)
            .unwrap();

        // Sans envoi campagne : pas de tâche à la simple pose d'étiquette.
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);

        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1 WHERE contact_id = ?2 AND etiquette_id = ?3",
                params![1_700_000_000_i64, cid, eid],
            )
            .unwrap();

        db.apply_etiquette_tache_action(cid, eid, 1_700_000_000)
            .unwrap();
        db.apply_etiquette_tache_action(cid, eid, 1_700_000_000)
            .unwrap();

        let taches = db.get_taches_by_contact(cid).unwrap();
        assert_eq!(taches.len(), 1);
        assert_eq!(taches[0].titre, "Appeler Marie Durand");
        assert_eq!(taches[0].priorite, "HAUTE");
        assert_eq!(taches[0].statut, "A_FAIRE");
        assert_eq!(taches[0].date_echeance, Some(tache_echeance(1_700_000_000, 7)));
        assert!(taches[0].from_etiquette_auto);
    }

    #[test]
    fn backfill_creates_tasks_for_already_sent_contacts() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Campagne SCPI");
        let cid = insert_contact(&db, "Luc", "Bernard");
        db.attribuer_etiquette(cid, eid, Some("MANUEL".into()), None)
            .unwrap();
        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1 WHERE contact_id = ?2",
                params![1_700_100_000_i64, cid],
            )
            .unwrap();

        db.set_etiquette_action(&action(eid, "Suivi {prenom}", 15))
            .unwrap();

        let taches = db.get_taches_by_contact(cid).unwrap();
        assert_eq!(taches.len(), 1);
        assert_eq!(taches[0].titre, "Suivi Luc");
        assert_eq!(
            taches[0].date_echeance,
            Some(tache_echeance(1_700_100_000, 15))
        );
    }

    #[test]
    fn exceltis_no_task_until_stellium_signal() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Exceltis Rendement — Février 2025");
        let cid = insert_contact(&db, "Jean", "Dupont");
        db.set_etiquette_action(&action(eid, "Arbitrage {nom}", 15))
            .unwrap();
        db.attribuer_etiquette(cid, eid, Some("MANUEL".into()), None)
            .unwrap();

        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);

        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_date_prevue = ?1 WHERE contact_id = ?2",
                params![1_700_200_000_i64, cid],
            )
            .unwrap();

        assert!(!db
            .try_apply_etiquette_tache_for_contact(cid, eid)
            .unwrap());

        insert_exceltis_stellium_signal(&db, eid, 1_700_200_000);
        assert!(db
            .try_apply_etiquette_tache_for_contact(cid, eid)
            .unwrap());
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 1);
    }

    #[test]
    fn reconcile_fixes_echeance_after_stellium_trigger() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Exceltis Rendement — Septembre 2026");
        let cid = insert_contact(&db, "Guillaume", "ROY");
        db.set_etiquette_action(&action(eid, "Arbitrage", 15)).unwrap();
        db.attribuer_etiquette(cid, eid, Some("MANUEL".into()), None)
            .unwrap();
        // Ancien bug : tâche avec échéance basée sur la pose, avant Stellium.
        db.apply_etiquette_tache_action(cid, eid, 1_750_000_000)
            .unwrap();
        insert_exceltis_stellium_signal(&db, eid, 1_800_000_000);
        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_date_prevue = ?1 WHERE contact_id = ?2",
                params![1_800_000_000_i64, cid],
            )
            .unwrap();

        let (_, fixed, _) = db.reconcile_etiquette_tache_actions_for_etiquette(eid).unwrap();
        assert_eq!(fixed, 1);

        let taches = db.get_taches_by_contact(cid).unwrap();
        assert_eq!(taches.len(), 1);
        assert_eq!(
            taches[0].date_echeance,
            Some(tache_echeance(1_800_000_000, 15))
        );
    }

    #[test]
    fn disabling_tache_action_purges_existing_tasks() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Campagne SCPI");
        let cid = insert_contact(&db, "Luc", "Bernard");
        db.attribuer_etiquette(cid, eid, Some("MANUEL".into()), None)
            .unwrap();
        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1 WHERE contact_id = ?2",
                params![1_700_100_000_i64, cid],
            )
            .unwrap();
        db.set_etiquette_action(&action(eid, "Suivi {prenom}", 15))
            .unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 1);

        db.set_etiquette_action(&EtiquetteAction {
            etiquette_id: eid,
            tache_actif: false,
            tache_titre: Some("Suivi {prenom}".to_string()),
            tache_priorite: "HAUTE".to_string(),
            tache_delai_jours: 15,
        })
        .unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);
    }

    #[test]
    fn apply_does_nothing_when_inactive_or_no_action() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Sans action");
        let cid = insert_contact(&db, "Paul", "Martin");
        db.attribuer_etiquette(cid, eid, Some("AUTO".to_string()), None)
            .unwrap();
        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1 WHERE contact_id = ?2",
                params![1_700_000_000_i64, cid],
            )
            .unwrap();

        db.apply_etiquette_tache_action(cid, eid, 1_700_000_000)
            .unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);

        db.set_etiquette_action(&EtiquetteAction {
            etiquette_id: eid,
            tache_actif: false,
            tache_titre: Some("Ne pas créer".to_string()),
            tache_priorite: "NORMALE".to_string(),
            tache_delai_jours: 0,
        })
        .unwrap();
        db.apply_etiquette_tache_action(cid, eid, 1_700_000_000)
            .unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);
    }

    #[test]
    fn purge_removes_exceltis_task_before_stellium_trigger() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Exceltis Rendement — Septembre 2026");
        let cid = insert_contact(&db, "Guillaume", "ROY");
        db.set_etiquette_action(&action(eid, "Arbitrage Exceltis", 15))
            .unwrap();
        db.attribuer_etiquette(cid, eid, Some("MANUEL".into()), None)
            .unwrap();
        // Simule l'ancien bug : tâche posée à l'attribution sans déclenchement campagne.
        db.apply_etiquette_tache_action(cid, eid, 1_752_000_000)
            .unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 1);

        let (purged, _) = db.reconcile_existing_etiquette_taches_all().unwrap();
        assert_eq!(purged, 1);
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);
    }
}
