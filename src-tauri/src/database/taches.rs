//! Tâches / rappels (liés ou non à un contact). Module de domaine dédié.

use super::models::{NewTache, SetTacheStatutResult, Tache, TacheContactRef};
use super::tache_recurrence::{
    next_occurrence, parse_recurrence_json, serialize_recurrence_json,
};
use rusqlite::{params, OptionalExtension, Result};

fn normalize_priorite(value: Option<String>) -> String {
    match value.as_deref() {
        Some("BASSE") => "BASSE".to_string(),
        Some("HAUTE") => "HAUTE".to_string(),
        _ => "NORMALE".to_string(),
    }
}

fn normalize_statut(value: Option<String>) -> String {
    match value.as_deref() {
        Some("FAIT") => "FAIT".to_string(),
        _ => "A_FAIRE".to_string(),
    }
}

impl super::Database {
    const TACHE_SELECT_COLS: &'static str = "id, titre, description, date_echeance, priorite,
                    statut, completed_at, created_at, updated_at, recurrence,
                    EXISTS (SELECT 1 FROM contact_etiquettes ce WHERE ce.tache_id = taches.id) AS from_etiquette_auto";

    /// Toutes les tâches (page Tâches), chacune avec ses contacts liés.
    /// Tri : à faire d'abord, puis échéance la plus proche (sans date en dernier).
    pub fn get_all_taches_with_contact(&self) -> Result<Vec<Tache>> {
        let sql = format!(
            "SELECT {} FROM taches ORDER BY (statut = 'FAIT'),
                      (date_echeance IS NULL),
                      date_echeance ASC,
                      created_at DESC",
            Self::TACHE_SELECT_COLS
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let mut result = Vec::new();
        let rows = stmt.query_map([], Self::map_tache_base)?;
        for row in rows {
            result.push(row?);
        }
        self.attach_contacts(&mut result)?;
        Ok(result)
    }

    /// Tâches rattachées à un contact donné (encart fiche contact).
    pub fn get_taches_by_contact(&self, contact_id: i64) -> Result<Vec<Tache>> {
        let sql = format!(
            "SELECT t.id, t.titre, t.description, t.date_echeance, t.priorite,
                    t.statut, t.completed_at, t.created_at, t.updated_at, t.recurrence,
                    EXISTS (SELECT 1 FROM contact_etiquettes ce WHERE ce.tache_id = t.id) AS from_etiquette_auto
             FROM taches t
             JOIN tache_contacts tc ON tc.tache_id = t.id
             WHERE tc.contact_id = ?1
             ORDER BY (t.statut = 'FAIT'),
                      (t.date_echeance IS NULL),
                      t.date_echeance ASC,
                      t.created_at DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let mut result = Vec::new();
        let rows = stmt.query_map(params![contact_id], Self::map_tache_base)?;
        for row in rows {
            result.push(row?);
        }
        self.attach_contacts(&mut result)?;
        Ok(result)
    }

    pub fn get_tache_by_id(&self, id: i64) -> Result<Tache> {
        let sql = format!(
            "SELECT {} FROM taches WHERE id = ?1",
            Self::TACHE_SELECT_COLS
        );
        let mut tache = self.conn.query_row(&sql, params![id], Self::map_tache_base)?;
        tache.contacts = self.load_tache_contacts(id)?;
        Ok(tache)
    }

    pub fn create_tache(&self, tache: NewTache) -> Result<Tache> {
        let priorite = normalize_priorite(tache.priorite);
        let statut = normalize_statut(tache.statut);
        let completed_at: Option<i64> = if statut == "FAIT" {
            Some(now_unix())
        } else {
            None
        };
        let recurrence_json = serialize_recurrence_json(tache.recurrence.as_ref());

        self.conn.execute(
            "INSERT INTO taches (titre, description, date_echeance, priorite, statut, completed_at, recurrence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                tache.titre,
                tache.description,
                tache.date_echeance,
                priorite,
                statut,
                completed_at,
                recurrence_json,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.replace_tache_contacts(id, &tache.contact_ids)?;
        self.get_tache_by_id(id)
    }

    pub fn update_tache(&self, id: i64, tache: &NewTache) -> Result<Tache> {
        let existing = self.get_tache_by_id(id)?;
        let priorite = normalize_priorite(tache.priorite.clone());
        let statut = normalize_statut(tache.statut.clone());
        let completed_at: Option<i64> = if statut == "FAIT" {
            Some(now_unix())
        } else {
            None
        };
        let recurrence_json = serialize_recurrence_json(tache.recurrence.as_ref());

        self.conn.execute(
            "UPDATE taches SET
                titre = ?1,
                description = ?2,
                date_echeance = ?3,
                priorite = ?4,
                statut = ?5,
                completed_at = ?6,
                recurrence = ?7,
                updated_at = unixepoch()
             WHERE id = ?8",
            params![
                tache.titre,
                tache.description,
                tache.date_echeance,
                priorite,
                statut,
                completed_at,
                recurrence_json,
                id,
            ],
        )?;
        self.replace_tache_contacts(id, &tache.contact_ids)?;
        let updated = self.get_tache_by_id(id)?;
        if existing.statut != "FAIT" && updated.statut == "FAIT" {
            let _ = self.maybe_spawn_recurrence(&updated)?;
        }
        Ok(updated)
    }

    /// Bascule rapide du statut (case à cocher) sans toucher au reste.
    pub fn set_tache_statut(&self, id: i64, statut: &str) -> Result<SetTacheStatutResult> {
        let existing = self.get_tache_by_id(id)?;
        let statut = normalize_statut(Some(statut.to_string()));
        let completed_at: Option<i64> = if statut == "FAIT" {
            Some(now_unix())
        } else {
            None
        };

        self.conn.execute(
            "UPDATE taches SET statut = ?1, completed_at = ?2, updated_at = unixepoch() WHERE id = ?3",
            params![statut, completed_at, id],
        )?;

        let tache = self.get_tache_by_id(id)?;
        let spawned_next = if existing.statut != "FAIT" && tache.statut == "FAIT" {
            self.maybe_spawn_recurrence(&tache)?
        } else {
            None
        };
        Ok(SetTacheStatutResult {
            tache,
            spawned_next,
        })
    }

    pub fn delete_tache(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM taches WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Crée la prochaine occurrence si la tâche terminée est récurrente.
    fn maybe_spawn_recurrence(&self, completed: &Tache) -> Result<Option<Tache>> {
        let Some(rec) = completed.recurrence.as_ref() else {
            return Ok(None);
        };
        if completed.statut != "FAIT" || !rec.is_active() {
            return Ok(None);
        }
        let anchor = completed
            .date_echeance
            .unwrap_or_else(start_of_today_unix);
        let Some(next_due) = next_occurrence(anchor, rec) else {
            return Ok(None);
        };
        let contact_ids: Vec<i64> = completed
            .contacts
            .iter()
            .map(|c| c.contact_id)
            .collect();
        let spawned = self.create_tache(NewTache {
            contact_ids,
            titre: completed.titre.clone(),
            description: completed.description.clone(),
            date_echeance: Some(next_due),
            priorite: Some(completed.priorite.clone()),
            statut: Some("A_FAIRE".to_string()),
            recurrence: Some(rec.clone()),
        })?;
        Ok(Some(spawned))
    }

    /// Remplace l'ensemble des contacts liés à une tâche (dédupliqués).
    fn replace_tache_contacts(&self, tache_id: i64, contact_ids: &[i64]) -> Result<()> {
        self.conn.execute(
            "DELETE FROM tache_contacts WHERE tache_id = ?1",
            params![tache_id],
        )?;
        for cid in contact_ids {
            self.conn.execute(
                "INSERT OR IGNORE INTO tache_contacts (tache_id, contact_id) VALUES (?1, ?2)",
                params![tache_id, cid],
            )?;
        }
        Ok(())
    }

    /// Contacts liés à une tâche (triés par nom).
    fn load_tache_contacts(&self, tache_id: i64) -> Result<Vec<TacheContactRef>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, c.nom, c.prenom
             FROM tache_contacts tc
             JOIN contacts c ON c.id = tc.contact_id
             WHERE tc.tache_id = ?1
             ORDER BY c.nom, c.prenom",
        )?;
        let rows = stmt.query_map(params![tache_id], |row| {
            Ok(TacheContactRef {
                contact_id: row.get(0)?,
                nom: row.get(1)?,
                prenom: row.get(2)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Renseigne `contacts` pour une liste de tâches déjà chargées.
    fn attach_contacts(&self, taches: &mut [Tache]) -> Result<()> {
        for tache in taches.iter_mut() {
            tache.contacts = self.load_tache_contacts(tache.id)?;
        }
        Ok(())
    }

    fn map_tache_base(row: &rusqlite::Row) -> Result<Tache> {
        let recurrence_raw: Option<String> = row.get(9)?;
        Ok(Tache {
            id: row.get(0)?,
            titre: row.get(1)?,
            description: row.get(2)?,
            date_echeance: row.get(3)?,
            priorite: row.get(4)?,
            statut: row.get(5)?,
            completed_at: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            recurrence: parse_recurrence_json(recurrence_raw.as_deref()),
            contacts: Vec::new(),
            from_etiquette_auto: row.get::<_, i64>(10)? != 0,
        })
    }

    /// Tâches actives dont l'échéance est aujourd'hui ou en retard (exclut sans date et à venir).
    pub fn count_taches_urgent_echeance(&self) -> Result<(u32, Option<i64>)> {
        let tomorrow = start_of_today_unix() + 86400;
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM taches
             WHERE statut != 'FAIT'
               AND date_echeance IS NOT NULL
               AND date_echeance < ?1",
            params![tomorrow],
            |row| row.get(0),
        )?;
        let focus_contact_id = if count == 1 {
            self.conn
                .query_row(
                    "SELECT tc.contact_id FROM taches t
                     LEFT JOIN tache_contacts tc ON tc.tache_id = t.id
                     WHERE t.statut != 'FAIT'
                       AND t.date_echeance IS NOT NULL
                       AND t.date_echeance < ?1
                     ORDER BY t.date_echeance ASC, t.id ASC
                     LIMIT 1",
                    params![tomorrow],
                    |row| row.get::<_, Option<i64>>(0),
                )
                .optional()?
                .flatten()
        } else {
            None
        };
        Ok((count as u32, focus_contact_id))
    }
}

fn start_of_today_unix() -> i64 {
    let now = now_unix();
    let secs_per_day = 86400_i64;
    (now / secs_per_day) * secs_per_day
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewContact;
    use crate::database::tache_recurrence::TacheRecurrence;
    use crate::database::Database;

    fn mem_db() -> Database {
        Database::open_in_memory_for_tests().expect("db mémoire")
    }

    fn new_tache(titre: &str) -> NewTache {
        NewTache {
            contact_ids: vec![],
            titre: titre.to_string(),
            description: None,
            date_echeance: None,
            priorite: None,
            statut: None,
            recurrence: None,
        }
    }

    fn insert_contact(db: &Database, nom: &str) -> i64 {
        db.create_contact(NewContact {
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            categorie: "CLIENT".to_string(),
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            nom: nom.to_string(),
            prenom: "Test".to_string(),
            email: None,
            telephone: None,
            adresse: None,
            code_postal: None,
            ville: None,
            pays: None,
            date_naissance: None,
            lieu_naissance: None,
            profession: None,
            situation_familiale: None,
            regime_matrimonial: None,
            revenus_annuels: None,
            charges_emprunts: None,
            objectifs_patrimoniaux: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            date_r1: None,
            type_invitation_filleul: None,
            date_invitation_filleul: None,
            presence_invitation_filleul: None,
            statut_suivi: None,
            registre: None,
            notes: None,
            famille_regroupement_exclu: None,
            epargne_precaution_souhaitee: None,
        })
        .unwrap()
        .id
        .unwrap()
    }

    #[test]
    fn create_tache_defaults_to_a_faire_normale() {
        let db = mem_db();
        let t = db.create_tache(new_tache("Appeler M. X")).unwrap();
        assert_eq!(t.statut, "A_FAIRE");
        assert_eq!(t.priorite, "NORMALE");
        assert!(t.completed_at.is_none());
    }

    #[test]
    fn set_statut_fait_sets_completed_at_and_back() {
        let db = mem_db();
        let t = db.create_tache(new_tache("Relancer")).unwrap();
        let done = db.set_tache_statut(t.id, "FAIT").unwrap();
        assert_eq!(done.tache.statut, "FAIT");
        assert!(done.tache.completed_at.is_some());
        assert!(done.spawned_next.is_none());
        let reopened = db.set_tache_statut(t.id, "A_FAIRE").unwrap();
        assert_eq!(reopened.tache.statut, "A_FAIRE");
        assert!(reopened.tache.completed_at.is_none());
    }

    #[test]
    fn completing_recurring_monthly_spawns_next() {
        let db = mem_db();
        let today = start_of_today_unix();
        let mut t = new_tache("Versements programmés");
        t.date_echeance = Some(today);
        t.recurrence = Some(TacheRecurrence {
            freq: "monthly".into(),
            interval: Some(1),
            day_of_month: Some(2),
            ..Default::default()
        });
        let created = db.create_tache(t).unwrap();
        assert!(created.recurrence.is_some());

        let result = db.set_tache_statut(created.id, "FAIT").unwrap();
        assert!(result.spawned_next.is_some());
        let next = result.spawned_next.unwrap();
        assert_eq!(next.statut, "A_FAIRE");
        assert_eq!(next.titre, "Versements programmés");
        assert!(next.date_echeance.unwrap() > today);
        assert_eq!(db.get_all_taches_with_contact().unwrap().len(), 2);
    }

    #[test]
    fn taches_by_contact_filters_and_unlinks_on_delete() {
        let db = mem_db();
        let cid = insert_contact(&db, "Lié");

        let mut linked = new_tache("Préparer bilan");
        linked.contact_ids = vec![cid];
        db.create_tache(linked).unwrap();
        db.create_tache(new_tache("Tâche libre")).unwrap();

        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 1);
        assert_eq!(db.get_all_taches_with_contact().unwrap().len(), 2);

        db.delete_contact(cid).unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);
        assert_eq!(db.get_all_taches_with_contact().unwrap().len(), 2);
    }

    #[test]
    fn tache_links_multiple_contacts_and_update_replaces_them() {
        let db = mem_db();
        let c1 = insert_contact(&db, "Alpha");
        let c2 = insert_contact(&db, "Beta");
        let c3 = insert_contact(&db, "Gamma");

        let mut t = new_tache("Relancer le groupe");
        t.contact_ids = vec![c1, c2];
        let created = db.create_tache(t).unwrap();
        assert_eq!(created.contacts.len(), 2);
        assert_eq!(db.get_taches_by_contact(c1).unwrap().len(), 1);
        assert_eq!(db.get_taches_by_contact(c2).unwrap().len(), 1);
        assert_eq!(db.get_taches_by_contact(c3).unwrap().len(), 0);

        let mut upd = new_tache("Relancer le groupe");
        upd.contact_ids = vec![c2, c3];
        let updated = db.update_tache(created.id, &upd).unwrap();
        assert_eq!(updated.contacts.len(), 2);
        assert_eq!(db.get_taches_by_contact(c1).unwrap().len(), 0);
        assert_eq!(db.get_taches_by_contact(c3).unwrap().len(), 1);
    }

    #[test]
    fn count_taches_urgent_echeance_includes_overdue_and_today_only() {
        let db = mem_db();
        let today = start_of_today_unix();

        let mut overdue = new_tache("Retard");
        overdue.date_echeance = Some(today - 86400);
        db.create_tache(overdue).unwrap();

        let mut today_task = new_tache("Aujourd'hui");
        today_task.date_echeance = Some(today);
        db.create_tache(today_task).unwrap();

        let mut future = new_tache("Semaine prochaine");
        future.date_echeance = Some(today + 86400 * 5);
        db.create_tache(future).unwrap();

        db.create_tache(new_tache("Sans date")).unwrap();

        let (count, _) = db.count_taches_urgent_echeance().unwrap();
        assert_eq!(count, 2);
    }
}
