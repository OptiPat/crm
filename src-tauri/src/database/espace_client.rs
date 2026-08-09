//! Espace client — accès, demandes, publications, état de synchro.
//! Phase 0 : schéma ; logique métier portail dans les phases suivantes.
//! Verrouillage UI : clé `settings.espace_client_active` (lu côté frontend via `get_setting`).

use rusqlite::Result;

impl super::Database {
    pub(crate) fn migrate_espace_client(&self) -> Result<()> {        if !self.table_has_column("partenaires", "url_extranet")? {
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

        // Pas de triggers outbox : ces tables sont classées LocalOnly dans
        // `workspace_sync::TABLE_POLICIES` et ne partent pas vers SharePoint.

        Ok(())
    }
}
