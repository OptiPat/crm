//! Pipe parrainage — funnel de recrutement filleul (prise de contact → inscription).

use chrono::{TimeZone, Utc};
use rusqlite::{params, Result, Row};

pub const STAGE_A_CONTACTER: &str = "A_CONTACTER";
pub const STAGE_ATTENTE_REPONSE: &str = "ATTENTE_REPONSE";
pub const STAGE_PRISE_DE_CONTACT: &str = "PRISE_DE_CONTACT";
pub const STAGE_CONFIRME: &str = "CONFIRME";
pub const STAGE_PRESENT: &str = "PRESENT";
pub const STAGE_INSCRIT: &str = "INSCRIT";
pub const STAGE_REFUSE: &str = "REFUSE";

const VALID_STAGES: &[&str] = &[
    STAGE_A_CONTACTER,
    STAGE_ATTENTE_REPONSE,
    STAGE_PRISE_DE_CONTACT,
    STAGE_CONFIRME,
    STAGE_PRESENT,
    STAGE_INSCRIT,
    STAGE_REFUSE,
];

const TIMELINE_CREATION: &str = "CREATION";
const TIMELINE_AVANCEMENT: &str = "AVANCEMENT";
const TIMELINE_NOTE: &str = "NOTE";
const TIMELINE_SMS_ENVOYE: &str = "SMS_ENVOYE";

fn now_unix() -> i64 {
    Utc::now().timestamp()
}

fn today_unix() -> i64 {
    let dt = Utc::now();
    dt.date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|naive| Utc.from_utc_datetime(&naive).timestamp())
        .unwrap_or(0)
}

pub(crate) fn is_valid_parrainage_stage(value: &str) -> bool {
    VALID_STAGES.contains(&value)
}

pub(crate) fn parrainage_stage_label(stage: &str) -> String {
    match stage {
        STAGE_A_CONTACTER => "À contacter".into(),
        STAGE_ATTENTE_REPONSE => "En attente de réponse".into(),
        STAGE_PRISE_DE_CONTACT => "Prise de contact".into(),
        STAGE_CONFIRME => "Oui, je viens".into(),
        STAGE_PRESENT => "Présent JD/PO".into(),
        STAGE_INSCRIT => "Inscrit".into(),
        STAGE_REFUSE => "Refusé / abandonné".into(),
        _ => stage.to_string(),
    }
}

fn normalize_invitation_type(value: Option<&str>) -> Option<String> {
    match value.map(str::trim) {
        Some("JD") => Some("JD".into()),
        Some("PO") => Some("PO".into()),
        _ => None,
    }
}

fn map_parrainage_pipe_row(row: &Row<'_>) -> Result<super::models::ParrainagePipe> {
    Ok(super::models::ParrainagePipe {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        stage: row.get(2)?,
        invitation_type: row.get(3)?,
        exercice_label: row.get(4)?,
        notes: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        archived_at: row.get(8)?,
        contact_nom: row.get(9)?,
        contact_prenom: row.get(10)?,
        contact_telephone: row.get(11)?,
    })
}

const PARRAINAGE_PIPE_SELECT: &str = "pp.id, pp.contact_id, pp.stage, pp.invitation_type, pp.exercice_label, pp.notes,
                    pp.created_at, pp.updated_at, pp.archived_at,
                    c.nom, c.prenom, c.telephone";

impl super::Database {
    pub fn migrate_parrainage_pipes_table(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS parrainage_pipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                stage TEXT NOT NULL DEFAULT 'A_CONTACTER',
                invitation_type TEXT,
                exercice_label TEXT NOT NULL,
                notes TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                archived_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS parrainage_pipe_timeline_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parrainage_pipe_id INTEGER NOT NULL,
                entry_type TEXT NOT NULL,
                titre TEXT,
                contenu TEXT,
                occurred_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_parrainage_pipes_exercice ON parrainage_pipes(exercice_label);
            CREATE INDEX IF NOT EXISTS idx_parrainage_pipes_stage ON parrainage_pipes(stage);
            CREATE INDEX IF NOT EXISTS idx_parrainage_pipes_contact ON parrainage_pipes(contact_id);
            CREATE INDEX IF NOT EXISTS idx_parrainage_pipe_timeline_pipe ON parrainage_pipe_timeline_entries(parrainage_pipe_id);
            ",
        )?;
        self.migrate_parrainage_attente_reponse_from_sms_v1()?;
        Ok(())
    }

    /// Rattrapage one-shot : pipes déjà marqués SMS envoyé mais encore à « À contacter ».
    fn migrate_parrainage_attente_reponse_from_sms_v1(&self) -> Result<()> {
        if self
            .get_setting("migration_parrainage_attente_reponse_v1")?
            .is_some()
        {
            return Ok(());
        }
        self.conn.execute(
            "UPDATE parrainage_pipes
             SET stage = ?1
             WHERE stage = ?2
               AND id IN (
                 SELECT DISTINCT parrainage_pipe_id
                 FROM parrainage_pipe_timeline_entries
                 WHERE entry_type = ?3
               )",
            params![STAGE_ATTENTE_REPONSE, STAGE_A_CONTACTER, TIMELINE_SMS_ENVOYE],
        )?;
        self.set_setting("migration_parrainage_attente_reponse_v1", "1")?;
        Ok(())
    }

    pub fn list_parrainage_pipes(
        &self,
        exercice_label: &str,
        include_archived: bool,
    ) -> Result<Vec<super::models::ParrainagePipe>> {
        let archived_clause = if include_archived {
            ""
        } else {
            " AND pp.archived_at IS NULL"
        };
        let sql = format!(
            "SELECT {PARRAINAGE_PIPE_SELECT}
             FROM parrainage_pipes pp
             JOIN contacts c ON c.id = pp.contact_id
             WHERE pp.exercice_label = ?1{archived_clause}
             ORDER BY pp.updated_at DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![exercice_label], map_parrainage_pipe_row)?;
        rows.collect()
    }

    pub fn get_parrainage_pipe_by_id(&self, id: i64) -> Result<super::models::ParrainagePipe> {
        let sql = format!(
            "SELECT {PARRAINAGE_PIPE_SELECT}
             FROM parrainage_pipes pp
             JOIN contacts c ON c.id = pp.contact_id
             WHERE pp.id = ?1"
        );
        self.conn
            .query_row(&sql, params![id], map_parrainage_pipe_row)
    }

    pub fn create_parrainage_pipe(
        &self,
        input: super::models::NewParrainagePipe,
    ) -> Result<super::models::ParrainagePipe> {
        let exercice_label = input.exercice_label.trim();
        if exercice_label.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "exercice_label obligatoire".into(),
            ));
        }
        if input.contact_id <= 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "contact_id obligatoire".into(),
            ));
        }
        let contact_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE id = ?1",
            params![input.contact_id],
            |row| row.get(0),
        )?;
        if contact_exists == 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "contact introuvable".into(),
            ));
        }
        let stage = input
            .stage
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(STAGE_A_CONTACTER);
        if !is_valid_parrainage_stage(stage) {
            return Err(rusqlite::Error::InvalidParameterName(
                "étape invalide".into(),
            ));
        }
        let invitation_type = normalize_invitation_type(input.invitation_type.as_deref());
        if stage == STAGE_CONFIRME && invitation_type.is_none() {
            return Err(rusqlite::Error::InvalidParameterName(
                "type d'invitation JD ou PO requis pour l'étape « Oui, je viens »".into(),
            ));
        }
        let notes = input
            .notes
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let now = now_unix();
        let tx = self.conn.unchecked_transaction()?;
        self.conn.execute(
            "INSERT INTO parrainage_pipes (contact_id, stage, invitation_type, exercice_label, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                input.contact_id,
                stage,
                invitation_type,
                exercice_label,
                notes,
                now,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.insert_parrainage_timeline_entry(
            id,
            TIMELINE_CREATION,
            Some("Ajout au pipe parrainage"),
            None,
            now,
        )?;
        self.sync_contact_from_parrainage_pipe(id, stage, invitation_type.as_deref())?;
        tx.commit()?;
        self.get_parrainage_pipe_by_id(id)
    }

    pub fn update_parrainage_pipe(
        &self,
        id: i64,
        update: super::models::UpdateParrainagePipe,
    ) -> Result<super::models::ParrainagePipe> {
        let current = self.get_parrainage_pipe_by_id(id)?;
        let invitation_type = normalize_invitation_type(
            update
                .invitation_type
                .as_deref()
                .or(current.invitation_type.as_deref()),
        );
        let notes = update
            .notes
            .as_ref()
            .map(|n| n.trim().to_string())
            .filter(|s| !s.is_empty());
        let now = now_unix();
        self.conn.execute(
            "UPDATE parrainage_pipes SET invitation_type = ?1, notes = ?2, updated_at = ?3 WHERE id = ?4",
            params![invitation_type, notes, now, id],
        )?;
        self.get_parrainage_pipe_by_id(id)
    }

    pub fn set_parrainage_pipe_stage(
        &self,
        id: i64,
        new_stage: &str,
        invitation_type: Option<&str>,
        notes: Option<&str>,
    ) -> Result<super::models::ParrainagePipe> {
        if !is_valid_parrainage_stage(new_stage) {
            return Err(rusqlite::Error::InvalidParameterName(
                "étape invalide".into(),
            ));
        }
        let current = self.get_parrainage_pipe_by_id(id)?;
        if current.stage == new_stage {
            return Ok(current);
        }
        let resolved_invitation = normalize_invitation_type(
            invitation_type.or(current.invitation_type.as_deref()),
        );
        if (new_stage == STAGE_CONFIRME || new_stage == STAGE_PRESENT)
            && resolved_invitation.is_none()
        {
            return Err(rusqlite::Error::InvalidParameterName(
                "type d'invitation JD ou PO requis".into(),
            ));
        }
        let now = now_unix();
        let tx = self.conn.unchecked_transaction()?;
        self.conn.execute(
            "UPDATE parrainage_pipes SET stage = ?1, invitation_type = ?2, updated_at = ?3 WHERE id = ?4",
            params![new_stage, resolved_invitation, now, id],
        )?;
        let titre = format!("Étape : {}", parrainage_stage_label(new_stage));
        self.insert_parrainage_timeline_entry(
            id,
            TIMELINE_AVANCEMENT,
            Some(&titre),
            notes,
            now,
        )?;
        self.sync_contact_from_parrainage_pipe(id, new_stage, resolved_invitation.as_deref())?;
        tx.commit()?;
        self.get_parrainage_pipe_by_id(id)
    }

    pub fn delete_parrainage_pipe(&self, id: i64) -> Result<()> {
        self.conn
            .execute(
                "DELETE FROM parrainage_pipe_timeline_entries WHERE parrainage_pipe_id = ?1",
                params![id],
            )?;
        self.conn
            .execute("DELETE FROM parrainage_pipes WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_parrainage_pipe_timeline_entries(
        &self,
        parrainage_pipe_id: i64,
    ) -> Result<Vec<super::models::ParrainagePipeTimelineEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, parrainage_pipe_id, entry_type, titre, contenu, occurred_at, created_at
             FROM parrainage_pipe_timeline_entries
             WHERE parrainage_pipe_id = ?1
             ORDER BY occurred_at DESC, id DESC",
        )?;
        let rows = stmt.query_map(params![parrainage_pipe_id], |row| {
            Ok(super::models::ParrainagePipeTimelineEntry {
                id: row.get(0)?,
                parrainage_pipe_id: row.get(1)?,
                entry_type: row.get(2)?,
                titre: row.get(3)?,
                contenu: row.get(4)?,
                occurred_at: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_parrainage_pipe_timeline_note(
        &self,
        parrainage_pipe_id: i64,
        contenu: &str,
    ) -> Result<super::models::ParrainagePipeTimelineEntry> {
        let trimmed = contenu.trim();
        if trimmed.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "note vide".into(),
            ));
        }
        let now = now_unix();
        self.insert_parrainage_timeline_entry(
            parrainage_pipe_id,
            TIMELINE_NOTE,
            Some("Note"),
            Some(trimmed),
            now,
        )?;
        let entries = self.list_parrainage_pipe_timeline_entries(parrainage_pipe_id)?;
        entries
            .into_iter()
            .next()
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn create_parrainage_pipe_sms_sent_note(
        &self,
        parrainage_pipe_id: i64,
        contenu: &str,
    ) -> Result<super::models::ParrainagePipeTimelineEntry> {
        let trimmed = contenu.trim();
        if trimmed.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "note vide".into(),
            ));
        }
        let now = now_unix();
        self.insert_parrainage_timeline_entry(
            parrainage_pipe_id,
            TIMELINE_SMS_ENVOYE,
            Some("SMS envoyé"),
            Some(trimmed),
            now,
        )?;
        let entries = self.list_parrainage_pipe_timeline_entries(parrainage_pipe_id)?;
        entries
            .into_iter()
            .next()
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn get_parrainage_funnel_counts(
        &self,
        exercice_label: &str,
    ) -> Result<super::models::ParrainageFunnelCounts> {
        let mut stmt = self.conn.prepare(
            "SELECT stage, COUNT(*) FROM parrainage_pipes
             WHERE exercice_label = ?1 AND archived_at IS NULL
             GROUP BY stage",
        )?;
        let rows = stmt.query_map(params![exercice_label], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut confirmations = 0i64;
        let mut presences = 0i64;
        let mut parrainages = 0i64;
        for row in rows {
            let (stage, count) = row?;
            match stage.as_str() {
                STAGE_CONFIRME => confirmations += count,
                STAGE_PRESENT => {
                    confirmations += count;
                    presences += count;
                }
                STAGE_INSCRIT => {
                    confirmations += count;
                    presences += count;
                    parrainages += count;
                }
                _ => {}
            }
        }
        // COUNT(DISTINCT ...) : un même pipe compte pour 1 même s'il a plusieurs entrées SMS_ENVOYE
        // (retour manuel à « À contacter » puis renvoi), pour rester cohérent avec les autres
        // compteurs du funnel qui comptent des pipes distincts, pas des événements.
        let sms_envoyes: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT te.parrainage_pipe_id) FROM parrainage_pipe_timeline_entries te
             JOIN parrainage_pipes pp ON pp.id = te.parrainage_pipe_id
             WHERE te.entry_type = ?1 AND pp.exercice_label = ?2 AND pp.archived_at IS NULL",
            params![TIMELINE_SMS_ENVOYE, exercice_label],
            |row| row.get(0),
        )?;
        Ok(super::models::ParrainageFunnelCounts {
            sms_envoyes,
            confirmations,
            presences,
            parrainages,
        })
    }

    fn insert_parrainage_timeline_entry(
        &self,
        parrainage_pipe_id: i64,
        entry_type: &str,
        titre: Option<&str>,
        contenu: Option<&str>,
        occurred_at: i64,
    ) -> Result<()> {
        let now = now_unix();
        self.conn.execute(
            "INSERT INTO parrainage_pipe_timeline_entries (parrainage_pipe_id, entry_type, titre, contenu, occurred_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                parrainage_pipe_id,
                entry_type,
                titre,
                contenu,
                occurred_at,
                now,
            ],
        )?;
        Ok(())
    }

    fn sync_contact_from_parrainage_pipe(
        &self,
        parrainage_pipe_id: i64,
        stage: &str,
        invitation_type: Option<&str>,
    ) -> Result<()> {
        let pipe = self.get_parrainage_pipe_by_id(parrainage_pipe_id)?;
        let contact_id = pipe.contact_id;
        let now = now_unix();
        let today = today_unix();
        let parrain_id = self.resolve_organisation_self_contact_id()?;

        match stage {
            STAGE_A_CONTACTER | STAGE_ATTENTE_REPONSE => {
                self.conn.execute(
                    "UPDATE contacts SET
                        filleul_categorie = CASE
                            WHEN filleul_categorie IS NULL OR filleul_categorie = '' OR filleul_categorie = 'AUCUN'
                            THEN 'SUSPECT_FILLEUL' ELSE filleul_categorie END,
                        parrain_id = COALESCE(parrain_id, ?1),
                        updated_at = ?2
                     WHERE id = ?3",
                    params![parrain_id, now, contact_id],
                )?;
            }
            STAGE_PRISE_DE_CONTACT => {
                self.conn.execute(
                    "UPDATE contacts SET
                        filleul_categorie = CASE
                            WHEN filleul_categorie IS NULL OR filleul_categorie = '' OR filleul_categorie = 'AUCUN'
                            THEN 'SUSPECT_FILLEUL' ELSE filleul_categorie END,
                        parrain_id = COALESCE(parrain_id, ?1),
                        date_dernier_contact_filleul = ?2,
                        updated_at = ?3
                     WHERE id = ?4",
                    params![parrain_id, today, now, contact_id],
                )?;
            }
            STAGE_CONFIRME => {
                let inv = invitation_type.unwrap_or("JD");
                self.conn.execute(
                    "UPDATE contacts SET
                        filleul_categorie = 'PROSPECT_FILLEUL',
                        parrain_id = COALESCE(parrain_id, ?1),
                        type_invitation_filleul = ?2,
                        date_invitation_filleul = COALESCE(date_invitation_filleul, ?3),
                        updated_at = ?4
                     WHERE id = ?5",
                    params![parrain_id, inv, today, now, contact_id],
                )?;
            }
            STAGE_PRESENT => {
                let inv = invitation_type.unwrap_or("JD");
                self.conn.execute(
                    "UPDATE contacts SET
                        filleul_categorie = 'PROSPECT_FILLEUL',
                        parrain_id = COALESCE(parrain_id, ?1),
                        type_invitation_filleul = ?2,
                        date_invitation_filleul = COALESCE(date_invitation_filleul, ?3),
                        presence_invitation_filleul = 1,
                        updated_at = ?4
                     WHERE id = ?5",
                    params![parrain_id, inv, today, now, contact_id],
                )?;
            }
            STAGE_INSCRIT => {
                self.conn.execute(
                    "UPDATE contacts SET
                        filleul_categorie = 'FILLEUL',
                        parrain_id = COALESCE(parrain_id, ?1),
                        date_inscription_filleul = COALESCE(date_inscription_filleul, ?2),
                        updated_at = ?3
                     WHERE id = ?4",
                    params![parrain_id, today, now, contact_id],
                )?;
            }
            STAGE_REFUSE => {
                self.conn.execute(
                    "UPDATE contacts SET updated_at = ?1 WHERE id = ?2",
                    params![now, contact_id],
                )?;
            }
            _ => {}
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewParrainagePipe};

    fn seed_contact(db: &super::super::Database) -> i64 {
        db.create_contact(NewContact {
            nom: "DUPONT".into(),
            prenom: "Jean".into(),
            categorie: "AUCUN".into(),
            statut_suivi: Some("ACTIF".into()),
            ..Default::default()
        })
        .unwrap()
        .id
        .unwrap()
    }

    #[test]
    fn parrainage_pipe_stage_progression_syncs_contact() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);

        let pipe = db
            .create_parrainage_pipe(NewParrainagePipe {
                contact_id,
                exercice_label: "2025-2026".into(),
                stage: Some(STAGE_A_CONTACTER.into()),
                invitation_type: None,
                notes: None,
            })
            .unwrap();

        db.set_parrainage_pipe_stage(pipe.id, STAGE_PRISE_DE_CONTACT, None, None)
            .unwrap();
        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.filleul_categorie.as_deref(), Some("SUSPECT_FILLEUL"));
        assert!(contact.date_dernier_contact_filleul.is_some());

        db.set_parrainage_pipe_stage(pipe.id, STAGE_CONFIRME, Some("JD"), None)
            .unwrap();
        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.filleul_categorie.as_deref(), Some("PROSPECT_FILLEUL"));
        assert_eq!(contact.type_invitation_filleul.as_deref(), Some("JD"));

        db.set_parrainage_pipe_stage(pipe.id, STAGE_PRESENT, None, None)
            .unwrap();
        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.presence_invitation_filleul, Some(1));

        db.set_parrainage_pipe_stage(pipe.id, STAGE_INSCRIT, None, None)
            .unwrap();
        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.filleul_categorie.as_deref(), Some("FILLEUL"));
        assert!(contact.date_inscription_filleul.is_some());

        let counts = db.get_parrainage_funnel_counts("2025-2026").unwrap();
        assert_eq!(counts.confirmations, 1);
        assert_eq!(counts.presences, 1);
        assert_eq!(counts.parrainages, 1);
    }

    #[test]
    fn migrate_attente_reponse_from_sms_runs_once() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe = db
            .create_parrainage_pipe(NewParrainagePipe {
                contact_id,
                exercice_label: "2025-2026".into(),
                stage: Some(STAGE_A_CONTACTER.into()),
                invitation_type: None,
                notes: None,
            })
            .unwrap();
        db.create_parrainage_pipe_sms_sent_note(pipe.id, "Coucou").unwrap();

        db.conn
            .execute(
                "DELETE FROM settings WHERE key = 'migration_parrainage_attente_reponse_v1'",
                [],
            )
            .unwrap();

        db.migrate_parrainage_attente_reponse_from_sms_v1().unwrap();
        let migrated = db.get_parrainage_pipe_by_id(pipe.id).unwrap();
        assert_eq!(migrated.stage, STAGE_ATTENTE_REPONSE);

        db.set_parrainage_pipe_stage(pipe.id, STAGE_A_CONTACTER, None, None)
            .unwrap();
        db.migrate_parrainage_attente_reponse_from_sms_v1().unwrap();
        let manual_reset = db.get_parrainage_pipe_by_id(pipe.id).unwrap();
        assert_eq!(manual_reset.stage, STAGE_A_CONTACTER);
    }
}
