//! Espace client — accès, demandes, publications, état de synchro.
//! Verrouillage UI : clé `settings.espace_client_active` (lu côté frontend via `get_setting`).

use rusqlite::{params, OptionalExtension, Result};

use super::models::{EspaceAcces, EspaceSyncSummary};

pub const ESPACE_STATUT_INACTIF: &str = "inactif";
pub const ESPACE_STATUT_ACTIF: &str = "actif";
pub const ESPACE_STATUT_REVOQUE: &str = "revoque";
pub const ESPACE_SYNC_PORTAIL_KEY: &str = "portail";

fn map_espace_acces(row: &rusqlite::Row<'_>) -> Result<EspaceAcces> {
    Ok(EspaceAcces {
        contact_id: row.get(0)?,
        statut: row.get(1)?,
        email_utilise: row.get(2)?,
        active_at: row.get(3)?,
        revoked_at: row.get(4)?,
        derniere_connexion: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn normalize_espace_email(email: &str) -> Result<String, String> {
    let trimmed = email.trim();
    if trimmed.is_empty() || !trimmed.contains('@') || trimmed.contains(char::is_whitespace) {
        return Err("Adresse email invalide".into());
    }
    Ok(trimmed.to_lowercase())
}

impl super::Database {
    pub(crate) fn migrate_espace_client(&self) -> Result<()> {
        if !self.table_has_column("partenaires", "url_extranet")? {
            self.conn.execute(
                "ALTER TABLE partenaires ADD COLUMN url_extranet TEXT",
                [],
            )?;
            println!("✅ Migration: colonne url_extranet sur partenaires");
        }

        if !self.table_has_column("investissements", "derniere_maj_client")? {
            self.conn.execute(
                "ALTER TABLE investissements ADD COLUMN derniere_maj_client INTEGER",
                [],
            )?;
            println!("✅ Migration: colonne derniere_maj_client sur investissements");
        }

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS espace_acces (
                contact_id INTEGER PRIMARY KEY,
                statut TEXT NOT NULL DEFAULT 'inactif',
                email_utilise TEXT,
                active_at INTEGER,
                revoked_at INTEGER,
                derniere_connexion INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS espace_demande (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                type_document TEXT NOT NULL,
                libelle TEXT NOT NULL,
                statut TEXT NOT NULL DEFAULT 'en_attente',
                demande_at INTEGER NOT NULL DEFAULT (unixepoch()),
                recu_at INTEGER,
                valide_at INTEGER,
                annule_at INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS espace_publication (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                document_id INTEGER NOT NULL,
                publie_at INTEGER NOT NULL DEFAULT (unixepoch()),
                expire_at INTEGER,
                retire_at INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS espace_sync_state (
                cle TEXT PRIMARY KEY,
                curseur INTEGER NOT NULL DEFAULT 0,
                derniere_synchro_at INTEGER,
                dernier_statut TEXT,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;

        Ok(())
    }

    pub fn get_espace_acces_by_contact(&self, contact_id: i64) -> Result<Option<EspaceAcces>> {
        self.conn
            .query_row(
                "SELECT contact_id, statut, email_utilise, active_at, revoked_at,
                        derniere_connexion, created_at, updated_at
                 FROM espace_acces
                 WHERE contact_id = ?1",
                params![contact_id],
                map_espace_acces,
            )
            .optional()
    }

    pub fn activate_espace_acces(
        &self,
        contact_id: i64,
        email: &str,
    ) -> std::result::Result<EspaceAcces, String> {
        let email_norm = normalize_espace_email(email)?;

        self.get_contact_by_id(contact_id)
            .map_err(|e| e.to_string())?;

        self.conn
            .execute(
                "INSERT INTO espace_acces (
                    contact_id, statut, email_utilise, active_at, revoked_at, updated_at
                 ) VALUES (?1, ?2, ?3, unixepoch(), NULL, unixepoch())
                 ON CONFLICT(contact_id) DO UPDATE SET
                    statut = excluded.statut,
                    email_utilise = excluded.email_utilise,
                    active_at = unixepoch(),
                    revoked_at = NULL,
                    updated_at = unixepoch()",
                params![contact_id, ESPACE_STATUT_ACTIF, email_norm],
            )
            .map_err(|e| e.to_string())?;

        self.get_espace_acces_by_contact(contact_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Accès espace client introuvable après activation".to_string())
    }

    pub fn revoke_espace_acces(&self, contact_id: i64) -> std::result::Result<EspaceAcces, String> {
        let existing = self
            .get_espace_acces_by_contact(contact_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Aucun accès espace client pour ce contact".to_string())?;

        if existing.statut == ESPACE_STATUT_REVOQUE {
            return Ok(existing);
        }

        if existing.statut == ESPACE_STATUT_INACTIF {
            return Err("Aucun accès actif à révoquer".to_string());
        }

        self.conn
            .execute(
                "UPDATE espace_acces
                 SET statut = ?1, revoked_at = unixepoch(), updated_at = unixepoch()
                 WHERE contact_id = ?2",
                params![ESPACE_STATUT_REVOQUE, contact_id],
            )
            .map_err(|e| e.to_string())?;

        self.get_espace_acces_by_contact(contact_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Accès espace client introuvable après révocation".to_string())
    }

    pub fn get_espace_sync_summary(&self) -> Result<EspaceSyncSummary> {
        let row = self
            .conn
            .query_row(
                "SELECT derniere_synchro_at, dernier_statut
                 FROM espace_sync_state
                 WHERE cle = ?1",
                params![ESPACE_SYNC_PORTAIL_KEY],
                |row| {
                    Ok(EspaceSyncSummary {
                        derniere_synchro_at: row.get(0)?,
                        dernier_statut: row.get(1)?,
                    })
                },
            )
            .optional()?;

        Ok(row.unwrap_or(EspaceSyncSummary {
            derniere_synchro_at: None,
            dernier_statut: None,
        }))
    }

    pub fn reserve_espace_sync_sequence(&self) -> Result<i64> {
        let tx = self.conn.unchecked_transaction()?;
        let current: i64 = tx
            .query_row(
                "SELECT curseur FROM espace_sync_state WHERE cle = ?1",
                params![ESPACE_SYNC_PORTAIL_KEY],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let next = current + 1;
        tx.execute(
            "INSERT INTO espace_sync_state (cle, curseur, updated_at)
             VALUES (?1, ?2, unixepoch())
             ON CONFLICT(cle) DO UPDATE SET
                curseur = excluded.curseur,
                updated_at = unixepoch()",
            params![ESPACE_SYNC_PORTAIL_KEY, next],
        )?;
        tx.commit()?;
        Ok(next)
    }

    pub fn record_espace_sync_success(
        &self,
        statut: &str,
        sequence: Option<i64>,
    ) -> Result<()> {
        if let Some(seq) = sequence {
            self.conn.execute(
                "INSERT INTO espace_sync_state (cle, curseur, derniere_synchro_at, dernier_statut, updated_at)
                 VALUES (?1, ?2, unixepoch(), ?3, unixepoch())
                 ON CONFLICT(cle) DO UPDATE SET
                    curseur = excluded.curseur,
                    derniere_synchro_at = unixepoch(),
                    dernier_statut = excluded.dernier_statut,
                    updated_at = unixepoch()",
                params![ESPACE_SYNC_PORTAIL_KEY, seq, statut],
            )?;
        } else {
            self.conn.execute(
                "INSERT INTO espace_sync_state (cle, curseur, dernier_statut, updated_at)
                 VALUES (?1, 0, ?2, unixepoch())
                 ON CONFLICT(cle) DO UPDATE SET
                    dernier_statut = excluded.dernier_statut,
                    updated_at = unixepoch()",
                params![ESPACE_SYNC_PORTAIL_KEY, statut],
            )?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewContact;

    fn sample_contact(db: &super::super::Database) -> i64 {
        let contact = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                email: Some("jean@example.com".into()),
                ..Default::default()
            })
            .unwrap();
        contact.id.unwrap()
    }

    #[test]
    fn activate_and_revoke_espace_acces() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let contact_id = sample_contact(&db);

        assert!(db.get_espace_acces_by_contact(contact_id).unwrap().is_none());

        let activated = db
            .activate_espace_acces(contact_id, "Client@Example.com")
            .unwrap();
        assert_eq!(activated.statut, ESPACE_STATUT_ACTIF);
        assert_eq!(activated.email_utilise.as_deref(), Some("client@example.com"));
        assert!(activated.active_at.is_some());
        assert!(activated.revoked_at.is_none());

        let revoked = db.revoke_espace_acces(contact_id).unwrap();
        assert_eq!(revoked.statut, ESPACE_STATUT_REVOQUE);
        assert!(revoked.revoked_at.is_some());

        let reactivated = db
            .activate_espace_acces(contact_id, "autre@example.com")
            .unwrap();
        assert_eq!(reactivated.statut, ESPACE_STATUT_ACTIF);
        assert_eq!(
            reactivated.email_utilise.as_deref(),
            Some("autre@example.com")
        );
        assert!(reactivated.revoked_at.is_none());
    }

    #[test]
    fn revoke_inactif_row_returns_error() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let contact_id = sample_contact(&db);

        db.conn
            .execute(
                "INSERT INTO espace_acces (contact_id, statut) VALUES (?1, ?2)",
                params![contact_id, ESPACE_STATUT_INACTIF],
            )
            .unwrap();

        let err = db.revoke_espace_acces(contact_id).unwrap_err();
        assert!(err.contains("actif"));
    }

    #[test]
    fn activate_rejects_invalid_email() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let contact_id = sample_contact(&db);
        assert!(db.activate_espace_acces(contact_id, "pas-un-email").is_err());
    }
}
