//! Échéances rédigées à la main par le conseiller pour un client.
//!
//! À la différence des alertes et des tâches — pense-bêtes internes qui ne
//! quittent jamais le CRM —, celles-ci sont écrites *pour* le client :
//! « Pensez à préparer vos justificatifs de revenus fonciers. » Chacune peut
//! désigner un lien d'agenda du profil CGP, vers lequel son bouton mènera.

use rusqlite::{params, OptionalExtension, Result};

use super::models::EspaceEcheance;

pub fn normalize_echeance_titre(titre: &str) -> std::result::Result<String, String> {
    let trimmed = titre.trim();
    if trimmed.is_empty() {
        return Err("Intitulé de l'échéance manquant".into());
    }
    Ok(trimmed.to_string())
}

fn map_echeance(row: &rusqlite::Row<'_>) -> Result<EspaceEcheance> {
    Ok(EspaceEcheance {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        date_echeance: row.get(2)?,
        titre: row.get(3)?,
        message: row.get(4)?,
        rdv_lien_id: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const COLONNES: &str =
    "id, contact_id, date_echeance, titre, message, rdv_lien_id, created_at, updated_at";

impl super::Database {
    pub(crate) fn migrate_espace_echeance(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS espace_echeance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                date_echeance INTEGER NOT NULL,
                titre TEXT NOT NULL,
                message TEXT,
                rdv_lien_id TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_espace_echeance_contact
             ON espace_echeance(contact_id, date_echeance)",
            [],
        )?;
        Ok(())
    }

    /// Toutes les échéances d'un contact, passées comprises : le conseiller
    /// doit pouvoir corriger ou supprimer celle qu'il a datée de travers.
    pub fn list_espace_echeances(&self, contact_id: i64) -> Result<Vec<EspaceEcheance>> {
        let sql = format!(
            "SELECT {COLONNES} FROM espace_echeance
             WHERE contact_id = ?1 ORDER BY date_echeance ASC, id ASC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![contact_id], map_echeance)?;
        rows.collect()
    }

    pub fn get_espace_echeance(&self, id: i64) -> Result<Option<EspaceEcheance>> {
        let sql = format!("SELECT {COLONNES} FROM espace_echeance WHERE id = ?1");
        self.conn
            .query_row(&sql, params![id], map_echeance)
            .optional()
    }

    pub fn create_espace_echeance(
        &self,
        contact_id: i64,
        date_echeance: i64,
        titre: &str,
        message: Option<&str>,
        rdv_lien_id: Option<&str>,
    ) -> std::result::Result<EspaceEcheance, String> {
        let titre = normalize_echeance_titre(titre)?;
        let message = message.map(str::trim).filter(|m| !m.is_empty());
        let rdv_lien_id = rdv_lien_id.map(str::trim).filter(|id| !id.is_empty());

        self.conn
            .execute(
                "INSERT INTO espace_echeance
                    (contact_id, date_echeance, titre, message, rdv_lien_id)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![contact_id, date_echeance, titre, message, rdv_lien_id],
            )
            .map_err(|e| e.to_string())?;

        let id = self.conn.last_insert_rowid();
        self.get_espace_echeance(id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Échéance introuvable après création".to_string())
    }

    pub fn delete_espace_echeance(&self, id: i64) -> std::result::Result<(), String> {
        let deleted = self
            .conn
            .execute("DELETE FROM espace_echeance WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if deleted == 0 {
            return Err("Échéance introuvable".into());
        }
        Ok(())
    }

    pub fn contact_has_echeance_same_day(
        &self,
        contact_id: i64,
        date_echeance: i64,
        titre: &str,
    ) -> Result<bool> {
        let titre = match normalize_echeance_titre(titre) {
            Ok(t) => t,
            Err(_) => return Ok(false),
        };
        let found: Option<i64> = self
            .conn
            .query_row(
                "SELECT id FROM espace_echeance
                 WHERE contact_id = ?1
                   AND titre = ?2
                   AND date(date_echeance, 'unixepoch') = date(?3, 'unixepoch')
                 LIMIT 1",
                params![contact_id, titre, date_echeance],
                |row| row.get(0),
            )
            .optional()?;
        Ok(found.is_some())
    }
}

#[cfg(test)]
mod tests {
    use crate::database::models::NewContact;
    use crate::database::Database;

    fn contact(db: &Database) -> i64 {
        db.create_contact(NewContact {
            nom: "DUPONT".into(),
            prenom: "Jean".into(),
            ..Default::default()
        })
        .unwrap()
        .id
        .unwrap()
    }

    #[test]
    fn rejects_empty_title() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let id = contact(&db);
        assert!(db
            .create_espace_echeance(id, 1_800_000_000, "   ", None, None)
            .is_err());
    }

    #[test]
    fn optional_fields_stay_empty_rather_than_blank() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let id = contact(&db);
        let echeance = db
            .create_espace_echeance(id, 1_800_000_000, "Déclaration", Some("   "), Some(""))
            .unwrap();

        assert_eq!(echeance.message, None);
        assert_eq!(echeance.rdv_lien_id, None);
    }

    /// Le conseiller garde les échéances passées sous les yeux : sans elles,
    /// impossible de corriger une date saisie de travers. C'est la
    /// construction de la timeline qui les écarte de la vue client.
    #[test]
    fn advisor_keeps_past_entries_in_sight() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let id = contact(&db);
        let maintenant = 1_800_000_000;
        db.create_espace_echeance(id, maintenant + 86_400, "À venir", None, None)
            .unwrap();
        db.create_espace_echeance(id, maintenant - 86_400, "Passée", None, None)
            .unwrap();

        let toutes = db.list_espace_echeances(id).unwrap();
        assert_eq!(toutes.len(), 2);
        // Tri chronologique : la plus ancienne d'abord.
        assert_eq!(toutes[0].titre, "Passée");
    }

    #[test]
    fn echeances_are_scoped_to_their_contact() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let premier = contact(&db);
        let second = db
            .create_contact(NewContact {
                nom: "LEGRAND".into(),
                prenom: "Paul".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();

        db.create_espace_echeance(premier, 1_800_000_000, "Pour Jean", None, None)
            .unwrap();

        assert_eq!(db.list_espace_echeances(second).unwrap().len(), 0);
    }

    #[test]
    fn delete_rejects_unknown_id() {
        let db = Database::open_in_memory_for_tests().unwrap();
        assert!(db.delete_espace_echeance(404).is_err());
    }

    #[test]
    fn same_day_title_is_detected_for_broadcast() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let id = contact(&db);
        let midi = 1_800_000_000;
        db.create_espace_echeance(id, midi, "Assemblée", None, None)
            .unwrap();
        assert!(db
            .contact_has_echeance_same_day(id, midi + 3_600, "Assemblée")
            .unwrap());
        assert!(!db
            .contact_has_echeance_same_day(id, midi + 86_400, "Assemblée")
            .unwrap());
        assert!(!db
            .contact_has_echeance_same_day(id, midi, "Autre titre")
            .unwrap());
    }
}
