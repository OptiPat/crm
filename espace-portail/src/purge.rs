//! Purge RGPD de la copie portail à la révocation.
//!
//! Le CRM et la GED ne sont pas concernés : le portail n'est qu'une copie.
//! On efface photo, sessions, journaux, fichiers en transit et saisies
//! encore non importées. La ligne d'accès reste, marquée révoquée, sans email.

use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use rusqlite::params;

use crate::db::PortalDb;

impl PortalDb {
    pub fn purge_contact_on_revoke(&self, contact_id: i64, data_dir: &Path) -> Result<(), String> {
        self.ensure_demande_tables().map_err(|e| e.to_string())?;
        self.ensure_evenement_table().map_err(|e| e.to_string())?;
        self.migrate_scpi_declarations().map_err(|e| e.to_string())?;
        self.migrate_avoir_declarations().map_err(|e| e.to_string())?;
        self.migrate_avoir_retraits().map_err(|e| e.to_string())?;

        let email = self.client_email(contact_id).map_err(|e| e.to_string())?;
        let stored_paths = self
            .contact_depot_paths(contact_id)
            .map_err(|e| e.to_string())?;
        let depot_dir = data_dir.join("depots").join(contact_id.to_string());

        self.delete_contact_rows(contact_id, email.as_deref())?;
        self.upsert_acces_from_sync(contact_id, "revoque", None, None, None)
            .map_err(|e| e.to_string())?;

        remove_depot_files(&stored_paths, &depot_dir, contact_id)?;
        Ok(())
    }

    fn contact_depot_paths(&self, contact_id: i64) -> rusqlite::Result<Vec<PathBuf>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT stored_path FROM espace_depot WHERE contact_id = ?1",
        )?;
        let paths = stmt
            .query_map(params![contact_id], |row| {
                let stored: String = row.get(0)?;
                Ok(PathBuf::from(stored))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(paths)
    }

    fn delete_contact_rows(&self, contact_id: i64, email: Option<&str>) -> Result<(), String> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM contact_snapshot WHERE contact_id = ?1",
            params![contact_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM espace_connexion_log WHERE contact_id = ?1",
            params![contact_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM espace_depot WHERE contact_id = ?1",
            params![contact_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM espace_demande WHERE contact_id = ?1",
            params![contact_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM espace_evenement_notifie WHERE contact_id = ?1",
            params![contact_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM espace_scpi_declaration WHERE contact_id = ?1",
            params![contact_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM espace_avoir_declaration WHERE contact_id = ?1",
            params![contact_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM espace_avoir_retrait WHERE contact_id = ?1",
            params![contact_id],
        )
        .map_err(|e| e.to_string())?;
        if let Some(email) = email {
            tx.execute(
                "DELETE FROM espace_login_guard WHERE email = ?1",
                params![email],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn remove_depot_files(
    stored_paths: &[PathBuf],
    depot_dir: &Path,
    contact_id: i64,
) -> Result<(), String> {
    for path in stored_paths {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Impossible d'effacer le dépôt {} (contact {contact_id}) : {error}",
                    path.display()
                ));
            }
        }
    }
    match std::fs::remove_dir_all(depot_dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Impossible d'effacer les dépôts du contact {contact_id} : {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn seed_actif(db: &PortalDb, contact_id: i64, email: &str) {
        db.upsert_acces_from_sync(contact_id, "actif", Some(email), None, Some(1))
            .unwrap();
    }

    #[test]
    fn revoke_wipes_portal_copy_and_keeps_a_stripped_acces_row() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        seed_actif(&db, 2, "autre@example.com");

        db.upsert_contact_snapshot(1, 4, &json!({"contact":{"prenom":"Jean"}}).to_string())
            .unwrap();
        db.upsert_contact_snapshot(2, 1, &json!({"contact":{"prenom":"Paul"}}).to_string())
            .unwrap();
        db.ensure_demande_tables().unwrap();
        db.conn()
            .execute(
                "INSERT INTO espace_demande (
                    id, contact_id, type_document, libelle, statut, demande_at, updated_at
                 ) VALUES (9, 1, 'cni', 'CNI', 'en_attente', unixepoch(), unixepoch())",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO espace_connexion_log (contact_id, event) VALUES (1, 'login_ok')",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO espace_login_guard (email, failures) VALUES ('client@example.com', 2)",
                [],
            )
            .unwrap();

        let tmp = std::env::temp_dir().join(format!("espace-purge-{}", std::process::id()));
        let depot_dir = tmp.join("depots").join("1");
        std::fs::create_dir_all(&depot_dir).unwrap();
        std::fs::write(depot_dir.join("9.sealed"), b"sealed").unwrap();

        db.purge_contact_on_revoke(1, &tmp).unwrap();

        assert!(db.get_contact_snapshot(1).unwrap().is_none());
        assert!(db.get_contact_snapshot(2).unwrap().is_some());
        let demandes: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM espace_demande WHERE contact_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(demandes, 0);
        let logs: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM espace_connexion_log WHERE contact_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(logs, 0);
        let guards: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM espace_login_guard WHERE email = 'client@example.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(guards, 0);
        let email: String = db
            .conn()
            .query_row(
                "SELECT email FROM espace_acces WHERE contact_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(email, "");
        let statut: String = db
            .conn()
            .query_row(
                "SELECT statut FROM espace_acces WHERE contact_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(statut, "revoque");
        assert!(!tmp.join("depots").join("1").exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn purge_does_not_touch_another_contact() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "a@example.com");
        seed_actif(&db, 2, "b@example.com");
        db.upsert_contact_snapshot(2, 3, r#"{"ok":true}"#).unwrap();
        db.purge_contact_on_revoke(1, Path::new("/tmp/espace-purge-unused"))
            .unwrap();
        assert!(db.get_contact_snapshot(2).unwrap().is_some());
        let statut: String = db
            .conn()
            .query_row(
                "SELECT statut FROM espace_acces WHERE contact_id = 2",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(statut, "actif");
    }

    #[test]
    fn purge_fails_if_depot_files_cannot_be_removed() {
        let db = PortalDb::open(":memory:").unwrap();
        seed_actif(&db, 1, "client@example.com");
        let tmp = std::env::temp_dir().join(format!(
            "espace-purge-fail-{}-{}",
            std::process::id(),
            1
        ));
        let depots = tmp.join("depots");
        std::fs::create_dir_all(&depots).unwrap();
        // Un fichier à la place du dossier contact : remove_dir_all échoue.
        std::fs::write(depots.join("1"), b"not-a-directory").unwrap();

        let err = db.purge_contact_on_revoke(1, &tmp).unwrap_err();
        assert!(
            err.contains("Impossible d'effacer"),
            "message inattendu : {err}"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
