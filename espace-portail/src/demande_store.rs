//! Demandes et dépôts documents côté portail.

use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension, Result};
use serde::Deserialize;
use serde_json::Value;

pub const DEMANDE_EN_ATTENTE: &str = "en_attente";
pub const DEMANDE_RECU: &str = "recu";
pub const DEMANDE_ANNULE: &str = "annule";

#[derive(Debug, Clone)]
pub struct PortalDemandeRow {
    pub id: i64,
    pub contact_id: i64,
    pub type_document: String,
    pub template_key: Option<String>,
    pub libelle: String,
    pub statut: String,
    pub demande_at: i64,
    pub client_notified_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct PortalDepotRow {
    pub demande_id: i64,
    pub contact_id: i64,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub stored_path: String,
    pub content_sha256: String,
    pub uploaded_at: i64,
}

#[derive(Debug, Clone)]
pub struct DemandeEmailNotification {
    pub demande_id: i64,
    pub contact_id: i64,
    pub email: String,
    pub prenom: String,
    pub libelle: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncDemandeLine {
    id: i64,
    #[serde(rename = "typeDocument")]
    type_document: String,
    template_key: Option<String>,
    libelle: String,
    statut: String,
    demande_at: i64,
}

impl super::PortalDb {
    fn migrate_demandes(&self) -> Result<()> {
        self.conn().execute_batch(
            "CREATE TABLE IF NOT EXISTS espace_demande (
                id INTEGER PRIMARY KEY,
                contact_id INTEGER NOT NULL,
                type_document TEXT NOT NULL,
                template_key TEXT,
                libelle TEXT NOT NULL,
                statut TEXT NOT NULL,
                demande_at INTEGER NOT NULL,
                client_notified_at INTEGER,
                client_reminded_at INTEGER,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS espace_depot (
                demande_id INTEGER PRIMARY KEY,
                contact_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                stored_path TEXT NOT NULL,
                content_sha256 TEXT NOT NULL DEFAULT '',
                uploaded_at INTEGER NOT NULL
            );",
        )?;
        if !self.has_column("espace_depot", "content_sha256")? {
            self.conn().execute_batch(
                "ALTER TABLE espace_depot ADD COLUMN content_sha256 TEXT NOT NULL DEFAULT '';",
            )?;
        }
        if !self.has_column("espace_demande", "client_reminded_at")? {
            self.conn().execute_batch(
                "ALTER TABLE espace_demande ADD COLUMN client_reminded_at INTEGER;",
            )?;
        }
        Ok(())
    }

    fn purge_demande_resources(&self, contact_id: i64, demande_id: i64) -> Result<()> {
        if let Some(depot) = self.get_depot(contact_id, demande_id)? {
            let _ = std::fs::remove_file(&depot.stored_path);
            self.conn().execute(
                "DELETE FROM espace_depot WHERE demande_id = ?1",
                params![demande_id],
            )?;
        }
        Ok(())
    }

    pub(crate) fn ensure_demande_tables(&self) -> Result<()> {
        self.migrate_demandes()
    }

    pub fn sync_demandes_from_payload(
        &self,
        contact_id: i64,
        payload: &Value,
    ) -> Result<Vec<DemandeEmailNotification>> {
        self.ensure_demande_tables()?;
        let Some(demandes) = payload.get("demandes").and_then(|v| v.as_array()) else {
            return Ok(vec![]);
        };

        let email = self.client_email(contact_id)?;
        let prenom = payload
            .pointer("/contact/prenom")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut notifications = Vec::new();
        for raw in demandes {
            let line: SyncDemandeLine = match serde_json::from_value(raw.clone()) {
                Ok(parsed) => parsed,
                Err(_) => continue,
            };

            if line.statut == DEMANDE_ANNULE {
                self.purge_demande_resources(contact_id, line.id)?;
            }

            let existing: Option<(String, Option<i64>)> = self
                .conn()
                .query_row(
                    "SELECT statut, client_notified_at FROM espace_demande WHERE id = ?1",
                    params![line.id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;

            let statut = if line.statut == DEMANDE_ANNULE {
                DEMANDE_ANNULE.to_string()
            } else if let Some((current, _)) = &existing {
                if *current == DEMANDE_RECU && line.statut == DEMANDE_EN_ATTENTE {
                    DEMANDE_RECU.to_string()
                } else {
                    line.statut.clone()
                }
            } else {
                line.statut.clone()
            };

            let updated = self.conn().execute(
                "INSERT INTO espace_demande (
                    id, contact_id, type_document, template_key, libelle, statut,
                    demande_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch())
                 ON CONFLICT(id) DO UPDATE SET
                    type_document = excluded.type_document,
                    template_key = excluded.template_key,
                    libelle = excluded.libelle,
                    statut = excluded.statut,
                    demande_at = excluded.demande_at,
                    updated_at = unixepoch()",
                params![
                    line.id,
                    contact_id,
                    line.type_document,
                    line.template_key,
                    line.libelle,
                    statut,
                    line.demande_at
                ],
            )?;

            let is_new = updated == 1 && existing.is_none();
            let needs_email = statut == DEMANDE_EN_ATTENTE
                && existing
                    .map(|(_, notified)| notified.is_none())
                    .unwrap_or(true);

            if is_new && needs_email {
                if let Some(email) = email.clone() {
                    notifications.push(DemandeEmailNotification {
                        demande_id: line.id,
                        contact_id,
                        email,
                        prenom: prenom.clone(),
                        libelle: line.libelle.clone(),
                    });
                }
            }
        }

        Ok(notifications)
    }

    pub fn mark_demande_client_notified(&self, demande_id: i64) -> Result<()> {
        self.conn().execute(
            "UPDATE espace_demande SET client_notified_at = unixepoch() WHERE id = ?1",
            params![demande_id],
        )?;
        Ok(())
    }

    pub fn list_client_demandes(&self, contact_id: i64) -> Result<Vec<PortalDemandeRow>> {
        self.ensure_demande_tables()?;
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, contact_id, type_document, template_key, libelle, statut,
                    demande_at, client_notified_at
             FROM espace_demande
             WHERE contact_id = ?1 AND statut = ?2
             ORDER BY demande_at ASC",
        )?;
        let rows = stmt
            .query_map(params![contact_id, DEMANDE_EN_ATTENTE], |row| {
                Ok(PortalDemandeRow {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    type_document: row.get(2)?,
                    template_key: row.get(3)?,
                    libelle: row.get(4)?,
                    statut: row.get(5)?,
                    demande_at: row.get(6)?,
                    client_notified_at: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_demande_for_contact(
        &self,
        demande_id: i64,
        contact_id: i64,
    ) -> Result<Option<PortalDemandeRow>> {
        self.ensure_demande_tables()?;
        self.conn()
            .query_row(
                "SELECT id, contact_id, type_document, template_key, libelle, statut,
                        demande_at, client_notified_at
                 FROM espace_demande
                 WHERE id = ?1 AND contact_id = ?2",
                params![demande_id, contact_id],
                |row| {
                    Ok(PortalDemandeRow {
                        id: row.get(0)?,
                        contact_id: row.get(1)?,
                        type_document: row.get(2)?,
                        template_key: row.get(3)?,
                        libelle: row.get(4)?,
                        statut: row.get(5)?,
                        demande_at: row.get(6)?,
                        client_notified_at: row.get(7)?,
                    })
                },
            )
            .optional()
    }

    pub fn has_depot(&self, demande_id: i64) -> Result<bool> {
        self.ensure_demande_tables()?;
        let exists: bool = self
            .conn()
            .query_row(
                "SELECT 1 FROM espace_depot WHERE demande_id = ?1 LIMIT 1",
                params![demande_id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        Ok(exists)
    }

    pub fn save_depot(
        &self,
        demande_id: i64,
        contact_id: i64,
        filename: &str,
        mime_type: &str,
        size_bytes: i64,
        stored_path: &str,
        content_sha256: &str,
    ) -> Result<()> {
        self.ensure_demande_tables()?;
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO espace_depot (
                demande_id, contact_id, filename, mime_type, size_bytes, stored_path,
                content_sha256, uploaded_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch())
             ON CONFLICT(demande_id) DO UPDATE SET
                filename = excluded.filename,
                mime_type = excluded.mime_type,
                size_bytes = excluded.size_bytes,
                stored_path = excluded.stored_path,
                content_sha256 = excluded.content_sha256,
                uploaded_at = unixepoch()",
            params![
                demande_id,
                contact_id,
                filename,
                mime_type,
                size_bytes,
                stored_path,
                content_sha256
            ],
        )?;
        tx.execute(
            "UPDATE espace_demande SET statut = ?1, updated_at = unixepoch() WHERE id = ?2",
            params![DEMANDE_RECU, demande_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn list_depots_for_sync(&self, contact_id: i64) -> Result<Vec<PortalDepotRow>> {
        self.ensure_demande_tables()?;
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT d.demande_id, d.contact_id, d.filename, d.mime_type, d.size_bytes,
                    d.stored_path, d.content_sha256, d.uploaded_at
             FROM espace_depot d
             INNER JOIN espace_demande m ON m.id = d.demande_id
             WHERE d.contact_id = ?1 AND m.statut = ?2
             ORDER BY d.uploaded_at ASC",
        )?;
        let rows = stmt
            .query_map(params![contact_id, DEMANDE_RECU], |row| {
                Ok(PortalDepotRow {
                    demande_id: row.get(0)?,
                    contact_id: row.get(1)?,
                    filename: row.get(2)?,
                    mime_type: row.get(3)?,
                    size_bytes: row.get(4)?,
                    stored_path: row.get(5)?,
                    content_sha256: row.get(6)?,
                    uploaded_at: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_depot(&self, contact_id: i64, demande_id: i64) -> Result<Option<PortalDepotRow>> {
        self.ensure_demande_tables()?;
        self.conn()
            .query_row(
                "SELECT demande_id, contact_id, filename, mime_type, size_bytes, stored_path,
                        content_sha256, uploaded_at
                 FROM espace_depot
                 WHERE contact_id = ?1 AND demande_id = ?2",
                params![contact_id, demande_id],
                |row| {
                    Ok(PortalDepotRow {
                        demande_id: row.get(0)?,
                        contact_id: row.get(1)?,
                        filename: row.get(2)?,
                        mime_type: row.get(3)?,
                        size_bytes: row.get(4)?,
                        stored_path: row.get(5)?,
                        content_sha256: row.get(6)?,
                        uploaded_at: row.get(7)?,
                    })
                },
            )
            .optional()
    }

    pub fn ack_depot(
        &self,
        contact_id: i64,
        demande_id: i64,
        expected_sha256: &str,
    ) -> Result<Option<PathBuf>, String> {
        self.ensure_demande_tables().map_err(|e| e.to_string())?;
        let statut: Option<String> = self
            .conn()
            .query_row(
                "SELECT statut FROM espace_demande WHERE id = ?1 AND contact_id = ?2",
                params![demande_id, contact_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(statut) = statut else {
            return Ok(None);
        };
        if statut != DEMANDE_RECU {
            return Ok(None);
        }

        let depot = self.get_depot(contact_id, demande_id).map_err(|e| e.to_string())?;
        let Some(depot) = depot else {
            return Ok(None);
        };
        if expected_sha256.is_empty() {
            return Err("Empreinte SHA-256 requise".into());
        }
        if depot.content_sha256 != expected_sha256 {
            return Err("Empreinte SHA-256 incorrecte".into());
        }

        self.conn()
            .execute(
                "DELETE FROM espace_depot WHERE demande_id = ?1",
                params![demande_id],
            )
            .map_err(|e| e.to_string())?;
        self.conn()
            .execute(
                "DELETE FROM espace_demande WHERE id = ?1 AND contact_id = ?2",
                params![demande_id, contact_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(Some(PathBuf::from(depot.stored_path)))
    }

    pub(crate) fn client_email(&self, contact_id: i64) -> Result<Option<String>> {
        let email: Option<String> = self
            .conn()
            .query_row(
                "SELECT email FROM espace_acces WHERE contact_id = ?1",
                params![contact_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        Ok(email.filter(|v| !v.trim().is_empty()))
    }
}

/// Emplacement du dépôt scellé.
///
/// Le nom d'origine n'apparaît pas : `CNI_DUPONT_Jean.pdf` se lirait dans
/// l'arborescence du serveur sans même ouvrir le fichier. Le vrai nom vit en
/// base, et le contenu est chiffré.
pub fn depot_storage_path(data_dir: &Path, contact_id: i64, demande_id: i64) -> PathBuf {
    data_dir
        .join("depots")
        .join(contact_id.to_string())
        .join(format!("{demande_id}.sealed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depot_path_is_scoped_by_contact_and_hides_the_filename() {
        let path = depot_storage_path(Path::new("/data"), 7, 3);
        let rendered = path.to_string_lossy().replace('\\', "/");
        assert!(rendered.contains("depots/7/3.sealed"));
    }

    #[test]
    fn a_client_filename_never_reaches_the_disk() {
        let path = depot_storage_path(Path::new("/data"), 7, 3);
        let rendered = path.to_string_lossy();
        assert!(!rendered.contains("CNI"), "nom d'origine exposé");
    }
}
