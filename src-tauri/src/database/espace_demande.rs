//! Demandes de documents espace client (phase 2).

use rusqlite::{params, OptionalExtension, Result};

use super::models::EspaceDemande;

pub const ESPACE_DEMANDE_EN_ATTENTE: &str = "en_attente";
pub const ESPACE_DEMANDE_RECU: &str = "recu";
pub const ESPACE_DEMANDE_IMPORT_EN_COURS: &str = "import_en_cours";
pub const ESPACE_DEMANDE_VALIDE: &str = "valide";
pub const ESPACE_DEMANDE_ANNULE: &str = "annule";

pub enum EspaceDepotImportLock {
    Proceed(EspaceDemande),
    AlreadyImported(i64),
    Refused(String),
}

// Debug manuel pour éviter d'exiger Debug sur EspaceDemande dans les tests.
impl std::fmt::Debug for EspaceDepotImportLock {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Proceed(d) => write!(f, "Proceed({})", d.id),
            Self::AlreadyImported(id) => write!(f, "AlreadyImported({id})"),
            Self::Refused(msg) => write!(f, "Refused({msg})"),
        }
    }
}

fn map_espace_demande(row: &rusqlite::Row<'_>) -> Result<EspaceDemande> {
    Ok(EspaceDemande {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        type_document: row.get(2)?,
        template_key: row.get(3)?,
        libelle: row.get(4)?,
        statut: row.get(5)?,
        demande_at: row.get(6)?,
        recu_at: row.get(7)?,
        valide_at: row.get(8)?,
        annule_at: row.get(9)?,
        ged_document_id: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const DEMANDE_SELECT: &str =
    "SELECT id, contact_id, type_document, template_key, libelle, statut,
            demande_at, recu_at, valide_at, annule_at, ged_document_id,
            created_at, updated_at
     FROM espace_demande";

impl super::Database {
    pub fn list_espace_demandes_by_contact(&self, contact_id: i64) -> Result<Vec<EspaceDemande>> {
        let mut stmt = self.conn.prepare(&format!(
            "{DEMANDE_SELECT} WHERE contact_id = ?1 ORDER BY demande_at DESC, id DESC"
        ))?;
        let rows = stmt
            .query_map(params![contact_id], map_espace_demande)?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn list_espace_demandes_for_sync(&self, contact_id: i64) -> Result<Vec<EspaceDemande>> {
        let mut stmt = self.conn.prepare(&format!(
            "{DEMANDE_SELECT}
             WHERE contact_id = ?1
               AND statut IN (?2, ?3, ?4)
             ORDER BY demande_at ASC, id ASC"
        ))?;
        let rows = stmt
            .query_map(
                params![
                    contact_id,
                    ESPACE_DEMANDE_EN_ATTENTE,
                    ESPACE_DEMANDE_RECU,
                    ESPACE_DEMANDE_ANNULE
                ],
                map_espace_demande,
            )?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_espace_demande_by_id(&self, id: i64) -> Result<Option<EspaceDemande>> {
        self.conn
            .query_row(
                &format!("{DEMANDE_SELECT} WHERE id = ?1"),
                params![id],
                map_espace_demande,
            )
            .optional()
    }

    pub fn create_espace_demande(
        &self,
        contact_id: i64,
        type_document: &str,
        template_key: Option<&str>,
        libelle: &str,
    ) -> std::result::Result<EspaceDemande, String> {
        let libelle = libelle.trim();
        if libelle.is_empty() {
            return Err("Libellé de la demande requis".into());
        }
        let type_document = type_document.trim();
        if type_document.is_empty() {
            return Err("Type de document requis".into());
        }

        self.get_contact_by_id(contact_id)
            .map_err(|e| e.to_string())?;

        let acces = self
            .get_espace_acces_by_contact(contact_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Aucun accès espace client pour ce contact".to_string())?;
        if acces.statut != super::espace_client::ESPACE_STATUT_ACTIF {
            return Err("L'accès espace client n'est pas actif".into());
        }

        self.conn
            .execute(
                "INSERT INTO espace_demande (
                    contact_id, type_document, template_key, libelle, statut, demande_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, unixepoch(), unixepoch())",
                params![
                    contact_id,
                    type_document,
                    template_key,
                    libelle,
                    ESPACE_DEMANDE_EN_ATTENTE
                ],
            )
            .map_err(|e| e.to_string())?;

        let id = self.conn.last_insert_rowid();
        self.get_espace_demande_by_id(id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Demande introuvable après création".to_string())
    }

    pub fn cancel_espace_demande(&self, demande_id: i64) -> std::result::Result<EspaceDemande, String> {
        let existing = self
            .get_espace_demande_by_id(demande_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Demande introuvable".to_string())?;

        if existing.statut == ESPACE_DEMANDE_ANNULE {
            return Ok(existing);
        }
        if existing.statut == ESPACE_DEMANDE_VALIDE {
            return Err("Une demande déjà importée ne peut pas être annulée".into());
        }

        self.conn
            .execute(
                "UPDATE espace_demande
                 SET statut = ?1, annule_at = unixepoch(), updated_at = unixepoch()
                 WHERE id = ?2",
                params![ESPACE_DEMANDE_ANNULE, demande_id],
            )
            .map_err(|e| e.to_string())?;

        self.get_espace_demande_by_id(demande_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Demande introuvable après annulation".to_string())
    }

    pub fn mark_espace_demande_recu(
        &self,
        demande_id: i64,
    ) -> std::result::Result<EspaceDemande, String> {
        self.conn
            .execute(
                "UPDATE espace_demande
                 SET statut = ?1, recu_at = COALESCE(recu_at, unixepoch()), updated_at = unixepoch()
                 WHERE id = ?2 AND statut = ?3",
                params![
                    ESPACE_DEMANDE_RECU,
                    demande_id,
                    ESPACE_DEMANDE_EN_ATTENTE
                ],
            )
            .map_err(|e| e.to_string())?;

        self.get_espace_demande_by_id(demande_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Demande introuvable".to_string())
    }

    pub fn try_lock_espace_depot_import(
        &self,
        demande_id: i64,
        contact_id: i64,
    ) -> std::result::Result<EspaceDepotImportLock, String> {
        let demande = self
            .get_espace_demande_by_id(demande_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Demande introuvable".to_string())?;

        if demande.contact_id != contact_id {
            return Ok(EspaceDepotImportLock::Refused(
                "demande ne correspond pas au contact".into(),
            ));
        }

        match demande.statut.as_str() {
            ESPACE_DEMANDE_ANNULE => {
                return Ok(EspaceDepotImportLock::Refused("demande annulée".into()));
            }
            ESPACE_DEMANDE_VALIDE => {
                if let Some(doc_id) = demande.ged_document_id {
                    return Ok(EspaceDepotImportLock::AlreadyImported(doc_id));
                }
                return Ok(EspaceDepotImportLock::Refused("déjà importée".into()));
            }
            ESPACE_DEMANDE_IMPORT_EN_COURS => {
                return Ok(EspaceDepotImportLock::Refused(
                    "import déjà en cours".into(),
                ));
            }
            ESPACE_DEMANDE_EN_ATTENTE | ESPACE_DEMANDE_RECU => {}
            other => {
                return Ok(EspaceDepotImportLock::Refused(format!(
                    "statut incompatible ({other})"
                )));
            }
        }

        let updated = self
            .conn
            .execute(
                "UPDATE espace_demande
                 SET statut = ?1, updated_at = unixepoch()
                 WHERE id = ?2 AND contact_id = ?3 AND statut IN (?4, ?5)",
                params![
                    ESPACE_DEMANDE_IMPORT_EN_COURS,
                    demande_id,
                    contact_id,
                    ESPACE_DEMANDE_EN_ATTENTE,
                    ESPACE_DEMANDE_RECU
                ],
            )
            .map_err(|e| e.to_string())?;

        if updated == 0 {
            let refreshed = self
                .get_espace_demande_by_id(demande_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Demande introuvable".to_string())?;
            return match refreshed.statut.as_str() {
                ESPACE_DEMANDE_VALIDE => {
                    if let Some(doc_id) = refreshed.ged_document_id {
                        Ok(EspaceDepotImportLock::AlreadyImported(doc_id))
                    } else {
                        Ok(EspaceDepotImportLock::Refused("déjà importée".into()))
                    }
                }
                ESPACE_DEMANDE_IMPORT_EN_COURS => Ok(EspaceDepotImportLock::Refused(
                    "import déjà en cours".into(),
                )),
                ESPACE_DEMANDE_ANNULE => {
                    Ok(EspaceDepotImportLock::Refused("demande annulée".into()))
                }
                _ => Ok(EspaceDepotImportLock::Refused(
                    "verrouillage concurrent, réessayez".into(),
                )),
            };
        }

        self.get_espace_demande_by_id(demande_id)
            .map_err(|e| e.to_string())?
            .map(EspaceDepotImportLock::Proceed)
            .ok_or_else(|| "Demande introuvable après verrouillage".to_string())
    }

    pub fn complete_espace_depot_import(
        &self,
        demande_id: i64,
        document_id: i64,
    ) -> std::result::Result<EspaceDemande, String> {
        self.conn
            .execute(
                "UPDATE espace_demande
                 SET statut = ?1,
                     ged_document_id = ?2,
                     recu_at = COALESCE(recu_at, unixepoch()),
                     valide_at = unixepoch(),
                     updated_at = unixepoch()
                 WHERE id = ?3 AND statut = ?4",
                params![
                    ESPACE_DEMANDE_VALIDE,
                    document_id,
                    demande_id,
                    ESPACE_DEMANDE_IMPORT_EN_COURS
                ],
            )
            .map_err(|e| e.to_string())?;

        self.get_espace_demande_by_id(demande_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Demande introuvable après import".to_string())
    }

    pub fn release_espace_depot_import_lock(
        &self,
        demande_id: i64,
    ) -> std::result::Result<(), String> {
        self.conn
            .execute(
                "UPDATE espace_demande
                 SET statut = CASE
                        WHEN recu_at IS NOT NULL THEN ?1
                        ELSE ?2
                     END,
                     updated_at = unixepoch()
                 WHERE id = ?3 AND statut = ?4",
                params![
                    ESPACE_DEMANDE_RECU,
                    ESPACE_DEMANDE_EN_ATTENTE,
                    demande_id,
                    ESPACE_DEMANDE_IMPORT_EN_COURS
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::espace_client::ESPACE_STATUT_ACTIF;
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
        let id = contact.id.unwrap();
        db.activate_espace_acces(id, "jean@example.com", "hash-test")
            .unwrap();
        assert_eq!(
            db.get_espace_acces_by_contact(id).unwrap().unwrap().statut,
            ESPACE_STATUT_ACTIF
        );
        id
    }

    #[test]
    fn create_and_cancel_demande() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let contact_id = sample_contact(&db);

        let demande = db
            .create_espace_demande(contact_id, "IDENTITE", Some("R1:cni"), "CNI")
            .unwrap();
        assert_eq!(demande.statut, ESPACE_DEMANDE_EN_ATTENTE);
        assert_eq!(demande.template_key.as_deref(), Some("R1:cni"));

        let cancelled = db.cancel_espace_demande(demande.id).unwrap();
        assert_eq!(cancelled.statut, ESPACE_DEMANDE_ANNULE);
        assert!(cancelled.annule_at.is_some());
    }

    #[test]
    fn sync_list_includes_annule_but_not_valide() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let contact_id = sample_contact(&db);
        let d1 = db
            .create_espace_demande(contact_id, "FISCAL", None, "Avis")
            .unwrap();
        let d2 = db
            .create_espace_demande(contact_id, "AUTRE", None, "Autre")
            .unwrap();
        db.cancel_espace_demande(d2.id).unwrap();
        // Statut posé directement : en production c'est l'import en GED qui le
        // pose, avec l'identifiant du document.
        db.conn
            .execute(
                "UPDATE espace_demande
                 SET statut = ?1, valide_at = unixepoch()
                 WHERE id = ?2",
                params![ESPACE_DEMANDE_VALIDE, d1.id],
            )
            .unwrap();

        let sync_rows = db.list_espace_demandes_for_sync(contact_id).unwrap();
        assert_eq!(sync_rows.len(), 1);
        assert_eq!(sync_rows[0].id, d2.id);
        assert_eq!(sync_rows[0].statut, ESPACE_DEMANDE_ANNULE);
    }

    #[test]
    fn import_lock_is_idempotent_when_already_imported() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let contact_id = sample_contact(&db);
        let demande = db
            .create_espace_demande(contact_id, "IDENTITE", None, "CNI")
            .unwrap();
        db.conn
            .execute(
                "UPDATE espace_demande
                 SET statut = ?1, ged_document_id = 42, valide_at = unixepoch()
                 WHERE id = ?2",
                params![ESPACE_DEMANDE_VALIDE, demande.id],
            )
            .unwrap();

        match db
            .try_lock_espace_depot_import(demande.id, contact_id)
            .unwrap()
        {
            EspaceDepotImportLock::AlreadyImported(doc_id) => assert_eq!(doc_id, 42),
            other => panic!("unexpected lock result: {other:?}"),
        }
    }
}
