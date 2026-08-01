//! Alertes suivi arbitrage AV/PER « avec moi » (opt-in par date sur le contrat).

use rusqlite::{params, OptionalExtension, Result};

pub const TYPE_ALERTE_ARBITRAGE: &str = "ARBITRAGE_AV_PER";

const ARBITRAGE_TASK_INV_DESC_PREFIX: &str = "crm:investissement_id:";

fn arbitrage_task_description(investissement_id: i64) -> String {
    format!("{ARBITRAGE_TASK_INV_DESC_PREFIX}{investissement_id}")
}

fn parse_arbitrage_investissement_id_from_description(description: Option<&str>) -> Option<i64> {
    description?
        .strip_prefix(ARBITRAGE_TASK_INV_DESC_PREFIX)?
        .parse()
        .ok()
}

pub(crate) fn type_produit_arbitrage_label(type_produit: &str) -> Option<&'static str> {
    match type_produit {
        "ASSURANCE_VIE" => Some("assurance vie"),
        "PER" => Some("PER"),
        _ => None,
    }
}

pub(crate) fn build_arbitrage_alerte_message(
    type_produit: &str,
    nom: &str,
    prenom: &str,
    numero_contrat: Option<&str>,
) -> Option<String> {
    let type_label = type_produit_arbitrage_label(type_produit)?;
    let name = format!("{} {}", nom.to_uppercase(), prenom);
    let mut msg = format!("Arbitrage {type_label} — {name}");
    if let Some(num) = numero_contrat.filter(|s| !s.trim().is_empty()) {
        msg.push_str(&format!(" — {}", num.trim()));
    }
    Some(msg)
}

/// Exclut les tâches auto créées avec les alertes arbitrage du compteur « urgent ».
pub(crate) fn arbitrage_auto_task_title_sql_exclude(t_alias: &str) -> String {
    format!(
        "NOT ({t_alias}.titre LIKE 'Arbitrage assurance vie —%' OR {t_alias}.titre LIKE 'Arbitrage PER —%')"
    )
}

pub(crate) fn is_arbitrage_auto_task_title(titre: &str) -> bool {
    titre.starts_with("Arbitrage assurance vie —") || titre.starts_with("Arbitrage PER —")
}

struct OpenArbitrageAlerte {
    contact_id: i64,
    message: String,
    investissement_id: Option<i64>,
}

fn start_of_today_unix() -> i64 {
    let now = chrono::Utc::now();
    now.date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp()
}

fn add_months_to_timestamp(ts: i64, months: u32) -> i64 {
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| {
            dt.date_naive()
                .checked_add_months(chrono::Months::new(months))
                .and_then(|d| d.and_hms_opt(0, 0, 0))
                .map(|ndt| ndt.and_utc().timestamp())
                .unwrap_or(ts)
        })
        .unwrap_or(ts)
}

impl super::Database {
    fn get_open_arbitrage_alerte(&self, alerte_id: i64) -> Result<Option<OpenArbitrageAlerte>> {
        self.conn
            .query_row(
                "SELECT contact_id, message, investissement_id FROM alertes
                 WHERE id = ?1 AND type_alerte = ?2 AND traitee = 0",
                params![alerte_id, TYPE_ALERTE_ARBITRAGE],
                |row| {
                    Ok(OpenArbitrageAlerte {
                        contact_id: row.get(0)?,
                        message: row.get(1)?,
                        investissement_id: row.get(2)?,
                    })
                },
            )
            .optional()
    }

    fn resolve_arbitrage_contact_for_investissement(
        &self,
        inv_id: i64,
    ) -> Result<Option<(i64, String, String)>> {
        let inv = self.get_investissement_by_id(inv_id)?;
        let recipients = self.souscription_event_recipient_contact_ids(&inv)?;
        let contact_id = if let Some(cid) = inv.contact_id {
            if recipients.iter().any(|id| *id == cid) {
                cid
            } else {
                match recipients.first() {
                    Some(id) => *id,
                    None => return Ok(None),
                }
            }
        } else {
            match recipients.first() {
                Some(id) => *id,
                None => return Ok(None),
            }
        };
        let (nom, prenom): (String, String) = self.conn.query_row(
            "SELECT nom, prenom FROM contacts WHERE id = ?1",
            params![contact_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        Ok(Some((contact_id, nom, prenom)))
    }

    fn has_open_arbitrage_alerte_for_investissement(&self, investissement_id: i64) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM alertes
             WHERE investissement_id = ?1
               AND type_alerte = ?2
               AND traitee = 0",
            params![investissement_id, TYPE_ALERTE_ARBITRAGE],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    fn try_create_arbitrage_task(
        &self,
        contact_id: i64,
        titre: &str,
        date_echeance: i64,
        investissement_id: i64,
    ) -> Result<()> {
        let desc = arbitrage_task_description(investissement_id);
        let existing: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM taches t
             INNER JOIN tache_contacts tc ON tc.tache_id = t.id
             WHERE tc.contact_id = ?1 AND t.description = ?2 AND t.statut = 'A_FAIRE'",
            params![contact_id, desc],
            |row| row.get(0),
        )?;
        if existing > 0 {
            return Ok(());
        }
        self.create_tache(super::models::NewTache {
            contact_ids: vec![contact_id],
            titre: titre.to_string(),
            description: Some(desc),
            date_echeance: Some(date_echeance),
            priorite: Some("NORMALE".to_string()),
            statut: Some("A_FAIRE".to_string()),
            recurrence: None,
        })?;
        Ok(())
    }

    fn complete_arbitrage_tasks_for_investissement(
        &self,
        investissement_id: i64,
    ) -> Result<()> {
        let desc = arbitrage_task_description(investissement_id);
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM taches WHERE description = ?1 AND statut = 'A_FAIRE'")?;
        let ids: Vec<i64> = stmt
            .query_map(params![desc], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        self.mark_taches_fait_silent(&ids)?;
        Ok(())
    }

    fn complete_arbitrage_tasks_for_contact(&self, contact_id: i64, titre: &str) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id FROM taches t
             INNER JOIN tache_contacts tc ON tc.tache_id = t.id
             WHERE tc.contact_id = ?1 AND t.titre = ?2 AND t.statut = 'A_FAIRE'",
        )?;
        let ids: Vec<i64> = stmt
            .query_map(params![contact_id, titre], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        self.mark_taches_fait_silent(&ids)?;
        Ok(())
    }

    /// Marque des tâches faites sans déclencher le sync alerte arbitrage (évite boucles).
    fn mark_taches_fait_silent(&self, ids: &[i64]) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        for id in ids {
            self.conn.execute(
                "UPDATE taches SET statut = 'FAIT', completed_at = ?1, updated_at = unixepoch()
                 WHERE id = ?2 AND statut != 'FAIT'",
                params![now, id],
            )?;
        }
        Ok(())
    }

    fn postpone_arbitrage_tasks_for_contact(
        &self,
        contact_id: i64,
        titre: &str,
        new_echeance: i64,
    ) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id FROM taches t
             INNER JOIN tache_contacts tc ON tc.tache_id = t.id
             WHERE tc.contact_id = ?1 AND t.titre = ?2 AND t.statut = 'A_FAIRE'",
        )?;
        let ids: Vec<i64> = stmt
            .query_map(params![contact_id, titre], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for id in ids {
            self.conn.execute(
                "UPDATE taches SET date_echeance = ?1, updated_at = unixepoch() WHERE id = ?2",
                params![new_echeance, id],
            )?;
        }
        Ok(())
    }

    fn postpone_arbitrage_tasks_for_investissement(
        &self,
        investissement_id: i64,
        new_echeance: i64,
    ) -> Result<()> {
        let desc = arbitrage_task_description(investissement_id);
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM taches WHERE description = ?1 AND statut = 'A_FAIRE'")?;
        let ids: Vec<i64> = stmt
            .query_map(params![desc], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for id in ids {
            self.conn.execute(
                "UPDATE taches SET date_echeance = ?1, updated_at = unixepoch() WHERE id = ?2",
                params![new_echeance, id],
            )?;
        }
        Ok(())
    }

    fn complete_open_arbitrage_tasks_for_investissement(&self, investissement_id: i64) -> Result<()> {
        self.complete_arbitrage_tasks_for_investissement(investissement_id)
    }

    /// Avant suppression manuelle : clôture tâche liée et repousse l'échéance contrat (évite recréation).
    pub(crate) fn before_delete_arbitrage_alerte(&self, alerte_id: i64) -> Result<()> {
        let row: Option<(i64, String, Option<i64>)> = self
            .conn
            .query_row(
                "SELECT contact_id, message, investissement_id FROM alertes
                 WHERE id = ?1 AND type_alerte = ?2",
                params![alerte_id, TYPE_ALERTE_ARBITRAGE],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let Some((contact_id, message, inv_id)) = row else {
            return Ok(());
        };
        if let Some(inv_id) = inv_id {
            self.complete_arbitrage_tasks_for_investissement(inv_id)?;
            let next = add_months_to_timestamp(start_of_today_unix(), 1);
            self.conn.execute(
                "UPDATE investissements
                 SET date_prochain_arbitrage = ?1, updated_at = unixepoch()
                 WHERE id = ?2",
                params![next, inv_id],
            )?;
        } else {
            self.complete_arbitrage_tasks_for_contact(contact_id, &message)?;
        }
        Ok(())
    }

    /// Après snooze : repousse l'échéance de la tâche auto liée (affichage uniquement).
    pub(crate) fn after_snooze_arbitrage_alerte(&self, alerte_id: i64, new_date: i64) -> Result<()> {
        if let Some(row) = self.get_open_arbitrage_alerte(alerte_id)? {
            if let Some(inv_id) = row.investissement_id {
                self.postpone_arbitrage_tasks_for_investissement(inv_id, new_date)?;
            } else {
                self.postpone_arbitrage_tasks_for_contact(row.contact_id, &row.message, new_date)?;
            }
        }
        Ok(())
    }

    /// Tâche arbitrage terminée : traite l'alerte liée au contrat (investissement_id).
    pub(crate) fn try_traiter_arbitrage_alerte_from_tache(
        &self,
        titre: &str,
        description: Option<&str>,
        contact_ids: &[i64],
    ) -> Result<bool> {
        if !is_arbitrage_auto_task_title(titre) {
            return Ok(false);
        }
        if let Some(inv_id) = parse_arbitrage_investissement_id_from_description(description) {
            let alerte_id: Option<i64> = self
                .conn
                .query_row(
                    "SELECT id FROM alertes
                     WHERE investissement_id = ?1 AND type_alerte = ?2 AND traitee = 0
                     LIMIT 1",
                    params![inv_id, TYPE_ALERTE_ARBITRAGE],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(alerte_id) = alerte_id {
                self.traiter_alerte_arbitrage(alerte_id)?;
                return Ok(true);
            }
            return Ok(false);
        }
        for contact_id in contact_ids {
            let alerte_id: Option<i64> = self
                .conn
                .query_row(
                    "SELECT id FROM alertes
                     WHERE contact_id = ?1 AND type_alerte = ?2 AND message = ?3 AND traitee = 0
                     LIMIT 1",
                    params![contact_id, TYPE_ALERTE_ARBITRAGE, titre],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(alerte_id) = alerte_id {
                self.traiter_alerte_arbitrage(alerte_id)?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Après save contrat : clôture alertes obsolètes puis crée celles à échéance.
    pub(crate) fn sync_arbitrage_alerts_after_investissement_save(
        &self,
        investissement_id: i64,
    ) -> Result<()> {
        let _ = self.close_obsolete_arbitrage_alerts_for_investissement(investissement_id);
        let _ = self.check_and_create_arbitrage_alerts()?;
        Ok(())
    }

    /// Crée les alertes (et tâches) pour les contrats AV/PER « avec moi » dont l'échéance est atteinte.
    pub fn check_and_create_arbitrage_alerts(&self) -> Result<Vec<super::models::Alerte>> {
        let today_start = start_of_today_unix();
        let mut stmt = self.conn.prepare(
            "SELECT i.id, i.type_produit, i.numero_contrat, i.date_prochain_arbitrage
             FROM investissements i
             WHERE i.type_produit IN ('ASSURANCE_VIE', 'PER')
               AND i.origine = 'MON_CONSEIL'
               AND COALESCE(i.statut, 'ACTIF') = 'ACTIF'
               AND i.date_prochain_arbitrage IS NOT NULL
               AND i.date_prochain_arbitrage <= ?1",
        )?;

        let rows = stmt.query_map(params![today_start], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;

        let mut created_alerts = Vec::new();

        for row in rows {
            let (inv_id, type_produit, numero_contrat, date_prochain) = row?;

            let Some((resolved_contact_id, nom, prenom)) =
                self.resolve_arbitrage_contact_for_investissement(inv_id)?
            else {
                continue;
            };

            let Some(message) = build_arbitrage_alerte_message(
                &type_produit,
                &nom,
                &prenom,
                numero_contrat.as_deref(),
            ) else {
                continue;
            };

            if self.has_open_arbitrage_alerte_for_investissement(inv_id)? {
                continue;
            }

            self.conn.execute(
                "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee, investissement_id)
                 VALUES (?1, ?2, ?3, ?4, 0, 0, ?5)",
                params![
                    resolved_contact_id,
                    TYPE_ALERTE_ARBITRAGE,
                    message,
                    date_prochain,
                    inv_id
                ],
            )?;

            let alerte_id = self.conn.last_insert_rowid();
            let _ = self.try_create_arbitrage_task(
                resolved_contact_id,
                &message,
                today_start,
                inv_id,
            );

            let alerte = self.conn.query_row(
                "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
                 FROM alertes WHERE id = ?1",
                params![alerte_id],
                |row| {
                    Ok(super::models::Alerte {
                        id: row.get(0)?,
                        contact_id: row.get(1)?,
                        type_alerte: row.get(2)?,
                        message: row.get(3)?,
                        date_alerte: row.get(4)?,
                        lue: row.get::<_, i64>(5)? != 0,
                        traitee: row.get::<_, i64>(6)? != 0,
                        created_at: row.get(7)?,
                    })
                },
            )?;
            created_alerts.push(alerte);
        }

        Ok(created_alerts)
    }

    /// Clôture les alertes arbitrage ouvertes si la date prochaine est repoussée ou effacée.
    pub(crate) fn close_obsolete_arbitrage_alerts_for_investissement(
        &self,
        investissement_id: i64,
    ) -> Result<()> {
        if !self.table_has_column("alertes", "investissement_id")? {
            return Ok(());
        }
        let today_start = start_of_today_unix();
        let still_due: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM investissements
                 WHERE id = ?1
                   AND type_produit IN ('ASSURANCE_VIE', 'PER')
                   AND origine = 'MON_CONSEIL'
                   AND COALESCE(statut, 'ACTIF') = 'ACTIF'
                   AND date_prochain_arbitrage IS NOT NULL
                   AND date_prochain_arbitrage <= ?2",
                params![investissement_id, today_start],
                |row| row.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .unwrap_or(false);
        if still_due {
            return Ok(());
        }
        self.complete_open_arbitrage_tasks_for_investissement(investissement_id)?;
        self.conn.execute(
            "UPDATE alertes SET traitee = 1, lue = 1, traitee_at = unixepoch()
             WHERE investissement_id = ?1 AND type_alerte = ?2 AND traitee = 0",
            params![investissement_id, TYPE_ALERTE_ARBITRAGE],
        )?;
        Ok(())
    }

    fn advance_investissement_arbitrage_dates(&self, investissement_id: i64) -> Result<()> {
        let today_start = start_of_today_unix();
        let next = add_months_to_timestamp(today_start, 6);
        self.conn.execute(
            "UPDATE investissements
             SET date_dernier_arbitrage = ?1,
                 date_prochain_arbitrage = ?2,
                 updated_at = unixepoch()
             WHERE id = ?3",
            params![today_start, next, investissement_id],
        )?;
        Ok(())
    }

    /// Arbitrage effectué : avance les dates du contrat (+6 mois) et clôture l'alerte.
    pub fn traiter_alerte_arbitrage(&self, alerte_id: i64) -> Result<()> {
        let Some(row) = self.get_open_arbitrage_alerte(alerte_id)? else {
            return Ok(());
        };
        let inv_id = row
            .investissement_id
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        self.advance_investissement_arbitrage_dates(inv_id)?;
        self.complete_arbitrage_tasks_for_investissement(inv_id)?;
        self.set_alerte_traitee_flag(alerte_id)?;
        Ok(())
    }

    /// Reporte l'échéance arbitrage sur le contrat lié et clôture l'alerte.
    pub fn reporter_alerte_arbitrage(&self, alerte_id: i64, mois: i64) -> Result<()> {
        let Some(row) = self.get_open_arbitrage_alerte(alerte_id)? else {
            return Ok(());
        };
        let inv_id = row
            .investissement_id
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        let current: Option<i64> = self.conn.query_row(
            "SELECT date_prochain_arbitrage FROM investissements WHERE id = ?1",
            params![inv_id],
            |row| row.get(0),
        )?;

        let base = current.unwrap_or_else(start_of_today_unix);
        let months = mois.max(1) as u32;
        let next = add_months_to_timestamp(base, months);

        self.conn.execute(
            "UPDATE investissements
             SET date_prochain_arbitrage = ?1, updated_at = unixepoch()
             WHERE id = ?2",
            params![next, inv_id],
        )?;
        self.complete_arbitrage_tasks_for_investissement(inv_id)?;
        self.set_alerte_traitee_flag(alerte_id)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewInvestissement};
    use crate::database::Database;

    fn test_db() -> Database {
        Database::open_in_memory_for_tests().expect("in-memory db")
    }

    fn sample_contact(db: &Database, nom: &str, prenom: &str) -> i64 {
        let c = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: nom.into(),
                prenom: prenom.into(),
                statut_suivi: Some("ACTIF".into()),
                ..Default::default()
            })
            .unwrap();
        c.id.unwrap()
    }

    #[test]
    fn build_arbitrage_alerte_message_formats_type_and_numero() {
        assert_eq!(
            build_arbitrage_alerte_message(
                "ASSURANCE_VIE",
                "Dupont",
                "Jean",
                Some("12345")
            ),
            Some("Arbitrage assurance vie — DUPONT Jean — 12345".into())
        );
        assert_eq!(
            build_arbitrage_alerte_message("PER", "Martin", "Paul", None),
            Some("Arbitrage PER — MARTIN Paul".into())
        );
        assert!(build_arbitrage_alerte_message("SCPI", "X", "Y", None).is_none());
    }

    fn new_investissement(
        contact_id: i64,
        type_produit: &str,
        nom_produit: &str,
        origine: &str,
        date_prochain_arbitrage: Option<String>,
        numero_contrat: Option<String>,
    ) -> NewInvestissement {
        NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: type_produit.into(),
            partenaire_id: None,
            nom_produit: nom_produit.into(),
            numero_contrat,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            date_dernier_arbitrage: None,
            date_prochain_arbitrage,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some(origine.into()),
        }
    }

    #[test]
    fn arbitrage_alert_only_when_due_and_mon_conseil() {
        let db = test_db();
        let contact_id = sample_contact(&db, "Dupont", "Jean");
        let today = start_of_today_unix();
        let future = add_months_to_timestamp(today, 3);

        let iso_due = chrono::DateTime::from_timestamp(today, 0)
            .unwrap()
            .to_rfc3339();
        let iso_future = chrono::DateTime::from_timestamp(future, 0)
            .unwrap()
            .to_rfc3339();

        let inv_due = db
            .create_investissement(new_investissement(
                contact_id,
                "ASSURANCE_VIE",
                "Contrat",
                "MON_CONSEIL",
                Some(iso_due.clone()),
                Some("AV-1".into()),
            ))
            .unwrap();
        let stored = db.get_investissement_by_id(inv_due.id).unwrap();
        assert_eq!(
            stored.date_prochain_arbitrage,
            Some(today),
            "unexpected stored date"
        );
        let recipients = db
            .souscription_event_recipient_contact_ids(&stored)
            .unwrap();
        assert_eq!(recipients.len(), 1, "expected one arbitrage recipient");

        db.create_investissement(new_investissement(
            contact_id,
            "ASSURANCE_VIE",
            "A cote",
            "EXISTANT_CLIENT",
            Some(iso_due),
            None,
        ))
        .unwrap();

        db.create_investissement(new_investissement(
            contact_id,
            "ASSURANCE_VIE",
            "Futur",
            "MON_CONSEIL",
            Some(iso_future),
            None,
        ))
        .unwrap();

        let created = db.check_and_create_arbitrage_alerts().unwrap();
        let open: Vec<_> = db
            .get_alertes_non_traitees()
            .unwrap()
            .into_iter()
            .filter(|a| a.type_alerte == TYPE_ALERTE_ARBITRAGE)
            .collect();
        assert_eq!(open.len(), 1, "expected one open arbitrage alert");
        if !created.is_empty() {
            assert_eq!(created.len(), 1);
            assert!(created[0].message.contains("AV-1"));
        } else {
            assert!(open[0].message.contains("AV-1"));
        }

        let again = db.check_and_create_arbitrage_alerts().unwrap();
        assert!(again.is_empty());

        let alerte_id = open[0].id;
        db.traiter_alerte_arbitrage(alerte_id).unwrap();
        let inv = db.get_investissement_by_id(inv_due.id).unwrap();
        assert!(inv.date_dernier_arbitrage.is_some());
        assert!(inv.date_prochain_arbitrage.unwrap() > today);

        db.traiter_alerte_arbitrage(alerte_id).unwrap();
        let inv2 = db.get_investissement_by_id(inv_due.id).unwrap();
        assert_eq!(inv2.date_prochain_arbitrage, inv.date_prochain_arbitrage);
    }

    #[test]
    fn reporter_arbitrage_completes_linked_task() {
        let db = test_db();
        let contact_id = sample_contact(&db, "Martin", "Paul");
        let today = start_of_today_unix();
        let iso_due = chrono::DateTime::from_timestamp(today, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(new_investissement(
            contact_id,
            "PER",
            "Contrat PER",
            "MON_CONSEIL",
            Some(iso_due),
            None,
        ))
        .unwrap();

        let created = db.check_and_create_arbitrage_alerts().unwrap();
        let open: Vec<_> = db
            .get_alertes_non_traitees()
            .unwrap()
            .into_iter()
            .filter(|a| a.type_alerte == TYPE_ALERTE_ARBITRAGE)
            .collect();
        assert_eq!(open.len(), 1);
        let message = if created.is_empty() {
            open[0].message.clone()
        } else {
            created[0].message.clone()
        };

        db.reporter_alerte_arbitrage(open[0].id, 3).unwrap();

        let pending: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM taches t
                 INNER JOIN tache_contacts tc ON tc.tache_id = t.id
                 WHERE tc.contact_id = ?1 AND t.titre = ?2 AND t.statut = 'A_FAIRE'",
                params![contact_id, message],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending, 0);
    }

    #[test]
    fn completing_arbitrage_task_closes_linked_alerte() {
        let db = test_db();
        let contact_id = sample_contact(&db, "Bernard", "Luc");
        let today = start_of_today_unix();
        let iso_due = chrono::DateTime::from_timestamp(today, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(new_investissement(
            contact_id,
            "PER",
            "Contrat PER",
            "MON_CONSEIL",
            Some(iso_due),
            None,
        ))
        .unwrap();

        let open = db
            .get_alertes_non_traitees()
            .unwrap()
            .into_iter()
            .filter(|a| a.type_alerte == TYPE_ALERTE_ARBITRAGE)
            .collect::<Vec<_>>();
        assert_eq!(open.len(), 1);

        let taches = db.get_taches_by_contact(contact_id).unwrap();
        let tache = taches
            .into_iter()
            .find(|t| is_arbitrage_auto_task_title(&t.titre))
            .expect("arbitrage task");
        db.set_tache_statut(tache.id, "FAIT").unwrap();

        let still_open = db
            .get_alertes_non_traitees()
            .unwrap()
            .into_iter()
            .filter(|a| a.type_alerte == TYPE_ALERTE_ARBITRAGE)
            .count();
        assert_eq!(still_open, 0);
    }

    #[test]
    fn two_mon_conseil_contracts_without_numero_get_separate_alerts_and_tasks() {
        let db = test_db();
        let contact_id = sample_contact(&db, "Lefevre", "Anne");
        let today = start_of_today_unix();
        let iso_due = chrono::DateTime::from_timestamp(today, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(new_investissement(
            contact_id,
            "ASSURANCE_VIE",
            "Contrat A",
            "MON_CONSEIL",
            Some(iso_due.clone()),
            None,
        ))
        .unwrap();
        db.create_investissement(new_investissement(
            contact_id,
            "PER",
            "Contrat B",
            "MON_CONSEIL",
            Some(iso_due),
            None,
        ))
        .unwrap();

        db.check_and_create_arbitrage_alerts().unwrap();
        let open: Vec<_> = db
            .get_alertes_non_traitees()
            .unwrap()
            .into_iter()
            .filter(|a| a.type_alerte == TYPE_ALERTE_ARBITRAGE)
            .collect();
        assert_eq!(open.len(), 2);

        let pending: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM taches t
                 INNER JOIN tache_contacts tc ON tc.tache_id = t.id
                 WHERE tc.contact_id = ?1 AND t.statut = 'A_FAIRE'
                   AND t.description LIKE 'crm:investissement_id:%'",
                params![contact_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending, 2);
    }

    #[test]
    fn snooze_arbitrage_alerte_does_not_change_investissement_date() {
        let db = test_db();
        let contact_id = sample_contact(&db, "Petit", "Marie");
        let today = start_of_today_unix();
        let iso_due = chrono::DateTime::from_timestamp(today, 0)
            .unwrap()
            .to_rfc3339();

        let inv = db
            .create_investissement(new_investissement(
                contact_id,
                "PER",
                "Contrat PER",
                "MON_CONSEIL",
                Some(iso_due),
                None,
            ))
            .unwrap();

        db.check_and_create_arbitrage_alerts().unwrap();
        let open = db
            .get_alertes_non_traitees()
            .unwrap()
            .into_iter()
            .find(|a| a.type_alerte == TYPE_ALERTE_ARBITRAGE)
            .expect("arbitrage alert");
        let before = db.get_investissement_by_id(inv.id).unwrap();
        let due_before = before.date_prochain_arbitrage;

        db.snooze_alerte(open.id, 7).unwrap();

        let after = db.get_investissement_by_id(inv.id).unwrap();
        assert_eq!(
            after.date_prochain_arbitrage, due_before,
            "snooze ne doit pas modifier date_prochain_arbitrage"
        );
        assert!(
            db.get_alertes_non_traitees().unwrap().is_empty(),
            "alerte snoozée masquée jusqu'à échéance"
        );
    }
}
