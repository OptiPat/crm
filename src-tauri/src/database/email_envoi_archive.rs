//! Archive des envois campagne : un email parti n'est jamais perdu.
//!
//! Avant toute suppression d'une ligne `contact_etiquettes` / `contact_template_envois`
//! déjà envoyée (étiquette AUTO retirée, contact en pause, fin de période, modèle supprimé
//! via la cascade…), un déclencheur SQL copie l'envoi ici. La 1re émission est aussi
//! archivée quand une relance email la remplace sur la ligne.
//! L'historique des échanges et la fiche contact lisent cette table en plus des lignes vivantes.

use super::Database;
use rusqlite::{params, Result};

/// Colonnes copiées (ordre = INSERT des déclencheurs et de `archive_send_before_relance`).
const ARCHIVE_COLUMNS: &str = "contact_id, source, source_row_id, etiquette_id, template_id,
    campaign_nom, sent_template_nom, email_date_envoi, sent_subject, sent_body,
    gmail_message_id, gmail_thread_id, reponse_at, reponse_type, reponse_body,
    reponse_gmail_message_id, relance_canal, relance_canal_at, relance_canal_message,
    reason, archived_at";

/// Colonnes source requises pour créer les déclencheurs (bases très anciennes : on attend la migration).
const REQUIRED_SOURCE_COLUMNS: [&str; 7] = [
    "email_sent_subject",
    "email_sent_body",
    "email_sent_template_nom",
    "email_reponse_body",
    "email_reponse_gmail_message_id",
    "relance_canal",
    "relance_canal_message",
];

impl Database {
    pub fn migrate_email_envoi_archive(&self) -> Result<()> {
        // Relance email déjà envoyée (D1 : une seule relance email, puis WhatsApp).
        for table in ["contact_etiquettes", "contact_template_envois"] {
            if !self.table_has_column(table, "relance_email_sent_at")? {
                self.conn.execute(
                    &format!("ALTER TABLE {table} ADD COLUMN relance_email_sent_at INTEGER"),
                    [],
                )?;
            }
        }
        // Relance email ignorée (✕ sur une relance dans « Prêts ») : plus de relance email, WhatsApp possible.
        for table in ["contact_etiquettes", "contact_template_envois"] {
            if !self.table_has_column(table, "relance_email_skipped_at")? {
                self.conn.execute(
                    &format!("ALTER TABLE {table} ADD COLUMN relance_email_skipped_at INTEGER"),
                    [],
                )?;
            }
        }
        // Synchro équipe : les déclencheurs de file sortante figent la liste des colonnes,
        // les recréer pour inclure les colonnes ajoutées ci-dessus dès cette session.
        self.ensure_workspace_outbox_triggers_for_table("contact_etiquettes")?;
        self.ensure_workspace_outbox_triggers_for_table("contact_template_envois")?;
        // Anciennes relances (avant cette version), une seule fois : 2 envois réussis pour la même
        // ligne étiquette = relance déjà faite (hors newsletter, dont la ligne est réutilisée à chaque
        // édition). Le 1er mail a été écrasé, il ne peut pas être récupéré.
        let backfill_done: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM settings WHERE key = 'email_archive_relance_backfill_v1'",
            [],
            |row| row.get(0),
        )?;
        if backfill_done == 0 && self.table_has_column("email_send_log", "contact_etiquette_id")? {
            self.conn.execute(
                "UPDATE contact_etiquettes SET relance_email_sent_at = email_date_envoi
                 WHERE relance_email_sent_at IS NULL AND email_date_envoi IS NOT NULL
                   AND etiquette_id NOT IN (
                     SELECT e.id FROM etiquettes e
                     INNER JOIN templates_email t ON t.id = e.email_template_id
                     WHERE t.categorie = 'NEWSLETTER'
                   )
                   AND id IN (
                     SELECT contact_etiquette_id FROM email_send_log
                     WHERE status = 'success' AND contact_etiquette_id IS NOT NULL
                       AND etiquette_id IS NOT NULL
                     GROUP BY contact_etiquette_id, etiquette_id
                     HAVING COUNT(*) >= 2
                   )",
                [],
            )?;
            self.conn.execute(
                "INSERT OR IGNORE INTO settings (key, value, updated_at)
                 VALUES ('email_archive_relance_backfill_v1', '1', unixepoch())",
                [],
            )?;
        }
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS email_envoi_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                source TEXT NOT NULL,
                source_row_id INTEGER,
                etiquette_id INTEGER,
                template_id INTEGER,
                campaign_nom TEXT NOT NULL,
                sent_template_nom TEXT,
                email_date_envoi INTEGER NOT NULL,
                sent_subject TEXT,
                sent_body TEXT,
                gmail_message_id TEXT,
                gmail_thread_id TEXT,
                reponse_at INTEGER,
                reponse_type TEXT,
                reponse_body TEXT,
                reponse_gmail_message_id TEXT,
                relance_canal TEXT,
                relance_canal_at INTEGER,
                relance_canal_message TEXT,
                reason TEXT NOT NULL,
                archived_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;
        // Un même envoi (ligne + date) n'est archivé qu'une fois (suppressions répétées, réimport…).
        self.conn
            .execute("DROP INDEX IF EXISTS email_envoi_archive_unique", [])?;
        self.conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS email_envoi_archive_row_unique
             ON email_envoi_archive (source, source_row_id, email_date_envoi)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS email_envoi_archive_contact_idx
             ON email_envoi_archive (contact_id)",
            [],
        )?;
        // Interrupteur pour les remplacements en masse (adhésion équipe) : pas d'archivage.
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS email_archive_control (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                suspended INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO email_archive_control (id, suspended) VALUES (1, 0)",
            [],
        )?;
        // Un remplacement interrompu ne doit pas laisser l'archivage coupé.
        self.conn
            .execute("UPDATE email_archive_control SET suspended = 0 WHERE id = 1", [])?;

        for table in ["contact_etiquettes", "contact_template_envois"] {
            for col in REQUIRED_SOURCE_COLUMNS {
                if !self.table_has_column(table, col)? {
                    return Ok(());
                }
            }
        }

        const ACTIVE: &str =
            "COALESCE((SELECT suspended FROM email_archive_control WHERE id = 1), 0) = 0";
        // Recréés à chaque démarrage : une version corrigée remplace toujours l'ancienne.
        self.conn.execute_batch(&format!(
            "DROP TRIGGER IF EXISTS email_archive_ce_before_delete;
             DROP TRIGGER IF EXISTS email_archive_cte_before_delete;
             DROP TRIGGER IF EXISTS email_archive_etiquette_before_delete;
             DROP TRIGGER IF EXISTS email_archive_template_before_delete;
             DROP TRIGGER IF EXISTS email_archive_contact_after_delete;
             DROP TRIGGER IF EXISTS email_archive_ce_before_update;
             DROP TRIGGER IF EXISTS email_archive_cte_before_update;

             CREATE TRIGGER email_archive_ce_before_delete
             BEFORE DELETE ON contact_etiquettes
             FOR EACH ROW
             WHEN (OLD.email_date_envoi IS NOT NULL OR OLD.email_envoye = 1) AND {ACTIVE}
             BEGIN
               INSERT OR IGNORE INTO email_envoi_archive ({ARCHIVE_COLUMNS})
               VALUES (
                 OLD.contact_id, 'etiquette', OLD.id, OLD.etiquette_id, NULL,
                 COALESCE((SELECT nom FROM etiquettes WHERE id = OLD.etiquette_id), 'Campagne email'),
                 OLD.email_sent_template_nom, COALESCE(OLD.email_date_envoi, unixepoch()),
                 OLD.email_sent_subject, OLD.email_sent_body,
                 OLD.email_gmail_message_id, OLD.email_gmail_thread_id,
                 OLD.email_reponse_at, OLD.email_reponse_type, OLD.email_reponse_body,
                 OLD.email_reponse_gmail_message_id,
                 OLD.relance_canal, OLD.relance_canal_at, OLD.relance_canal_message,
                 'suppression', unixepoch()
               );
             END;

             CREATE TRIGGER email_archive_cte_before_delete
             BEFORE DELETE ON contact_template_envois
             FOR EACH ROW
             WHEN (OLD.email_date_envoi IS NOT NULL OR OLD.email_envoye = 1) AND {ACTIVE}
             BEGIN
               INSERT OR IGNORE INTO email_envoi_archive ({ARCHIVE_COLUMNS})
               VALUES (
                 OLD.contact_id, 'template', OLD.id, NULL, OLD.template_id,
                 'Modèle · ' || COALESCE(
                   (SELECT nom FROM templates_email WHERE id = OLD.template_id),
                   NULLIF(TRIM(OLD.email_sent_template_nom), ''),
                   'supprimé'
                 ),
                 OLD.email_sent_template_nom, COALESCE(OLD.email_date_envoi, unixepoch()),
                 OLD.email_sent_subject, OLD.email_sent_body,
                 OLD.email_gmail_message_id, OLD.email_gmail_thread_id,
                 OLD.email_reponse_at, OLD.email_reponse_type, OLD.email_reponse_body,
                 OLD.email_reponse_gmail_message_id,
                 OLD.relance_canal, OLD.relance_canal_at, OLD.relance_canal_message,
                 'suppression', unixepoch()
               );
             END;

             -- Date d'envoi remplacée (nouvelle édition newsletter, mise à jour venue d'un
             -- collègue, relance…) : l'envoi précédent est archivé avant d'être écrasé.
             CREATE TRIGGER email_archive_ce_before_update
             BEFORE UPDATE OF email_date_envoi ON contact_etiquettes
             FOR EACH ROW
             WHEN OLD.email_date_envoi IS NOT NULL
               AND NEW.email_date_envoi IS NOT OLD.email_date_envoi AND {ACTIVE}
             BEGIN
               INSERT OR IGNORE INTO email_envoi_archive ({ARCHIVE_COLUMNS})
               VALUES (
                 OLD.contact_id, 'etiquette', OLD.id, OLD.etiquette_id, NULL,
                 COALESCE((SELECT nom FROM etiquettes WHERE id = OLD.etiquette_id), 'Campagne email'),
                 OLD.email_sent_template_nom, OLD.email_date_envoi,
                 OLD.email_sent_subject, OLD.email_sent_body,
                 OLD.email_gmail_message_id, OLD.email_gmail_thread_id,
                 OLD.email_reponse_at, OLD.email_reponse_type, OLD.email_reponse_body,
                 OLD.email_reponse_gmail_message_id,
                 OLD.relance_canal, OLD.relance_canal_at, OLD.relance_canal_message,
                 'remplacement', unixepoch()
               );
             END;

             CREATE TRIGGER email_archive_cte_before_update
             BEFORE UPDATE OF email_date_envoi ON contact_template_envois
             FOR EACH ROW
             WHEN OLD.email_date_envoi IS NOT NULL
               AND NEW.email_date_envoi IS NOT OLD.email_date_envoi AND {ACTIVE}
             BEGIN
               INSERT OR IGNORE INTO email_envoi_archive ({ARCHIVE_COLUMNS})
               VALUES (
                 OLD.contact_id, 'template', OLD.id, NULL, OLD.template_id,
                 'Modèle · ' || COALESCE(
                   (SELECT nom FROM templates_email WHERE id = OLD.template_id),
                   NULLIF(TRIM(OLD.email_sent_template_nom), ''),
                   'supprimé'
                 ),
                 OLD.email_sent_template_nom, OLD.email_date_envoi,
                 OLD.email_sent_subject, OLD.email_sent_body,
                 OLD.email_gmail_message_id, OLD.email_gmail_thread_id,
                 OLD.email_reponse_at, OLD.email_reponse_type, OLD.email_reponse_body,
                 OLD.email_reponse_gmail_message_id,
                 OLD.relance_canal, OLD.relance_canal_at, OLD.relance_canal_message,
                 'remplacement', unixepoch()
               );
             END;

             -- Étiquette / modèle supprimés : retirer les lignes AVANT le parent, pour que
             -- l'archive garde le vrai nom (pendant une cascade, le parent a déjà disparu).
             CREATE TRIGGER email_archive_etiquette_before_delete
             BEFORE DELETE ON etiquettes
             FOR EACH ROW WHEN {ACTIVE}
             BEGIN
               DELETE FROM contact_etiquettes WHERE etiquette_id = OLD.id;
             END;

             CREATE TRIGGER email_archive_template_before_delete
             BEFORE DELETE ON templates_email
             FOR EACH ROW WHEN {ACTIVE}
             BEGIN
               DELETE FROM contact_template_envois WHERE template_id = OLD.id;
               -- Étiquette qui utilisait ce modèle : sa relance préparée ne peut plus partir,
               -- l'envoi parti reste suivi (sinon la ligne deviendrait invisible).
               UPDATE contact_etiquettes SET email_envoye = 1, email_relance_active = 0,
                 email_date_prevue = NULL, relance_email_skipped_at = unixepoch()
               WHERE email_envoye = 0 AND COALESCE(email_relance_active, 0) = 1
                 AND etiquette_id IN (SELECT id FROM etiquettes WHERE email_template_id = OLD.id);
             END;

             -- Fiche supprimée (y compris « tout supprimer » ou synchro) : son archive part avec elle.
             CREATE TRIGGER email_archive_contact_after_delete
             AFTER DELETE ON contacts
             FOR EACH ROW WHEN {ACTIVE}
             BEGIN
               DELETE FROM email_envoi_archive WHERE contact_id = OLD.id;
             END;"
        ))?;

        self.purge_email_archive_orphans()?;
        Ok(())
    }

    /// Envois archivés dont le contact n'existe plus (suppression de fiche).
    pub(crate) fn purge_email_archive_orphans(&self) -> Result<usize> {
        self.conn.execute(
            "DELETE FROM email_envoi_archive WHERE contact_id NOT IN (SELECT id FROM contacts)",
            [],
        )
    }

    /// Avant qu'une relance email remplace la 1re émission sur la ligne : copie la 1re émission.
    /// `is_template` choisit la table (`contact_template_envois` ou `contact_etiquettes`).
    pub(crate) fn archive_send_before_relance(&self, is_template: bool, row_id: i64) -> Result<()> {
        let (table, source, campaign_sql) = if is_template {
            (
                "contact_template_envois",
                "template",
                "'Modèle · ' || COALESCE((SELECT nom FROM templates_email WHERE id = x.template_id), NULLIF(TRIM(x.email_sent_template_nom), ''), 'supprimé')",
            )
        } else {
            (
                "contact_etiquettes",
                "etiquette",
                "COALESCE((SELECT nom FROM etiquettes WHERE id = x.etiquette_id), 'Campagne email')",
            )
        };
        let (etiquette_col, template_col) = if is_template {
            ("NULL", "x.template_id")
        } else {
            ("x.etiquette_id", "NULL")
        };
        self.conn.execute(
            &format!(
                "INSERT OR IGNORE INTO email_envoi_archive ({ARCHIVE_COLUMNS})
                 SELECT x.contact_id, '{source}', x.id, {etiquette_col}, {template_col},
                        {campaign_sql},
                        x.email_sent_template_nom, x.email_date_envoi,
                        x.email_sent_subject, x.email_sent_body,
                        x.email_gmail_message_id, x.email_gmail_thread_id,
                        x.email_reponse_at, x.email_reponse_type, x.email_reponse_body,
                        x.email_reponse_gmail_message_id,
                        NULL, NULL, NULL,
                        'relance', unixepoch()
                 FROM {table} x
                 WHERE x.id = ?1 AND x.email_date_envoi IS NOT NULL"
            ),
            params![row_id],
        )?;
        Ok(())
    }

    /// Fil Gmail et date de la 1re émission d'une ligne déjà relancée (réponses au 1er mail).
    pub(crate) fn archived_first_thread(
        &self,
        is_template: bool,
        row_id: i64,
    ) -> Result<Option<(String, i64)>> {
        let source = if is_template { "template" } else { "etiquette" };
        let table = if is_template { "contact_template_envois" } else { "contact_etiquettes" };
        // Même ligne ET même contact (un id restauré par l'équipe ne doit pas pointer ailleurs).
        let mut stmt = self.conn.prepare(&format!(
            "SELECT gmail_thread_id, email_date_envoi FROM email_envoi_archive
             WHERE source = ?1 AND source_row_id = ?2 AND reason IN ('relance', 'remplacement')
               AND contact_id = (SELECT contact_id FROM {table} WHERE id = ?2)
               AND gmail_thread_id IS NOT NULL AND TRIM(gmail_thread_id) != ''
             ORDER BY email_date_envoi DESC LIMIT 1"
        ))?;
        let mut rows = stmt.query(params![source, row_id])?;
        Ok(match rows.next()? {
            Some(r) => Some((r.get(0)?, r.get(1)?)),
            None => None,
        })
    }

    /// Suspend / rétablit l'archivage (remplacement en masse des tables par l'équipe).
    pub(crate) fn set_email_archive_suspended(conn: &rusqlite::Connection, suspended: bool) {
        let _ = conn.execute(
            "UPDATE email_archive_control SET suspended = ?1 WHERE id = 1",
            params![suspended as i64],
        );
    }
}

#[cfg(test)]
mod tests {
    use crate::database::Database;
    use rusqlite::params;

    fn db() -> Database {
        Database::open_in_memory_for_tests().expect("db")
    }

    fn insert_contact(db: &Database, email: &str) -> i64 {
        db.create_contact(crate::database::models::NewContact {
            categorie: "CLIENT".into(),
            nom: "Test".into(),
            prenom: "Arch".into(),
            email: Some(email.into()),
            ..Default::default()
        })
        .unwrap()
        .id
        .unwrap()
    }

    #[test]
    fn deleting_a_sent_template_row_archives_it_once() {
        let db = db();
        let cid = insert_contact(&db, "arch@example.com");
        db.conn
            .execute(
                "INSERT INTO templates_email (nom, sujet, corps, categorie, created_at, updated_at)
                 VALUES ('Bilan', 'S', 'C', 'INFO', unixepoch(), unixepoch())",
                [],
            )
            .unwrap();
        let tid = db.conn.last_insert_rowid();
        db.conn
            .execute(
                "INSERT INTO contact_template_envois (contact_id, template_id, trigger_event_at,
                    email_envoye, email_date_envoi, email_sent_subject, email_sent_template_nom)
                 VALUES (?1, ?2, 1, 1, 1700000000, 'Objet envoyé', 'Bilan')",
                params![cid, tid],
            )
            .unwrap();
        // Suppression du modèle : la cascade efface la ligne, l'envoi reste archivé.
        db.conn
            .execute("DELETE FROM templates_email WHERE id = ?1", params![tid])
            .unwrap();
        let (n, nom, subject): (i64, String, String) = db
            .conn
            .query_row(
                "SELECT COUNT(*), MAX(campaign_nom), MAX(sent_subject) FROM email_envoi_archive
                 WHERE contact_id = ?1",
                params![cid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(n, 1);
        assert_eq!(nom, "Modèle · Bilan");
        assert_eq!(subject, "Objet envoyé");
    }

    #[test]
    fn unsent_rows_are_not_archived_and_suspend_flag_is_honoured() {
        let db = db();
        let cid = insert_contact(&db, "arch2@example.com");
        db.conn
            .execute(
                "INSERT INTO templates_email (nom, sujet, corps, categorie, created_at, updated_at)
                 VALUES ('X', 'S', 'C', 'INFO', unixepoch(), unixepoch())",
                [],
            )
            .unwrap();
        let tid = db.conn.last_insert_rowid();
        db.conn
            .execute(
                "INSERT INTO contact_template_envois (contact_id, template_id, trigger_event_at)
                 VALUES (?1, ?2, 1)",
                params![cid, tid],
            )
            .unwrap();
        db.conn.execute("DELETE FROM contact_template_envois", []).unwrap();
        Database::set_email_archive_suspended(&db.conn, true);
        db.conn
            .execute(
                "INSERT INTO contact_template_envois (contact_id, template_id, trigger_event_at,
                    email_envoye, email_date_envoi) VALUES (?1, ?2, 1, 1, 1700000000)",
                params![cid, tid],
            )
            .unwrap();
        db.conn.execute("DELETE FROM contact_template_envois", []).unwrap();
        Database::set_email_archive_suspended(&db.conn, false);
        let n: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM email_envoi_archive", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }
}
