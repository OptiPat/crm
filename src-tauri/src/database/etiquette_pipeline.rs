use super::{
    models::{EtiquettePipelineContact, EtiquettePipelineBoard},
    Database,
};
use rusqlite::{params, Result};

pub const PIPELINE_A_TRAITER: &str = "A_TRAITER";
pub const PIPELINE_MAIL_ENVOYE: &str = "MAIL_ENVOYE";
pub const PIPELINE_RDV_PRIS: &str = "RDV_PRIS";
pub const PIPELINE_TERMINE: &str = "TERMINE";

impl Database {
    pub fn set_etiquette_pipeline_actif(&self, etiquette_id: i64, actif: bool) -> Result<()> {
        let flag = if actif { 1 } else { 0 };
        self.conn.execute(
            "UPDATE etiquettes SET pipeline_actif = ?1, updated_at = unixepoch() WHERE id = ?2",
            params![flag, etiquette_id],
        )?;
        if actif {
            self.conn.execute(
                "UPDATE contact_etiquettes SET pipeline_status = ?1
                 WHERE etiquette_id = ?2 AND pipeline_status IS NULL",
                params![PIPELINE_A_TRAITER, etiquette_id],
            )?;
        }
        Ok(())
    }

    pub fn ensure_pipeline_status_on_assignment(
        &self,
        contact_id: i64,
        etiquette_id: i64,
    ) -> Result<()> {
        let actif: i64 = self.conn.query_row(
            "SELECT COALESCE(pipeline_actif, 0) FROM etiquettes WHERE id = ?1",
            params![etiquette_id],
            |row| row.get(0),
        )?;
        if actif == 0 {
            return Ok(());
        }
        self.conn.execute(
            "UPDATE contact_etiquettes SET pipeline_status = ?1
             WHERE contact_id = ?2 AND etiquette_id = ?3 AND pipeline_status IS NULL",
            params![PIPELINE_A_TRAITER, contact_id, etiquette_id],
        )?;
        Ok(())
    }

    pub fn set_contact_pipeline_status(
        &self,
        contact_etiquette_id: i64,
        status: &str,
    ) -> Result<()> {
        let allowed = [
            PIPELINE_A_TRAITER,
            PIPELINE_MAIL_ENVOYE,
            PIPELINE_RDV_PRIS,
            PIPELINE_TERMINE,
        ];
        if !allowed.contains(&status) {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Statut pipeline invalide: {}",
                status
            )));
        }
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET pipeline_status = ?1 WHERE id = ?2",
            params![status, contact_etiquette_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "contact_etiquette introuvable: {}",
                contact_etiquette_id
            )));
        }
        Ok(())
    }

    pub fn advance_pipeline_on_email_sent(&self, contact_etiquette_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_etiquettes SET pipeline_status = ?1
             WHERE id = ?2
               AND pipeline_status IN (?3, ?4)
               AND EXISTS (
                 SELECT 1 FROM etiquettes e
                 WHERE e.id = contact_etiquettes.etiquette_id
                   AND COALESCE(e.pipeline_actif, 0) = 1
               )",
            params![
                PIPELINE_MAIL_ENVOYE,
                contact_etiquette_id,
                PIPELINE_A_TRAITER,
                PIPELINE_MAIL_ENVOYE,
            ],
        )?;
        Ok(())
    }

    pub fn advance_pipeline_on_rdv(&self, contact_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_etiquettes SET pipeline_status = ?1
             WHERE contact_id = ?2
               AND pipeline_status IN (?3, ?4)
               AND EXISTS (
                 SELECT 1 FROM etiquettes e
                 WHERE e.id = contact_etiquettes.etiquette_id
                   AND COALESCE(e.pipeline_actif, 0) = 1
               )",
            params![
                PIPELINE_RDV_PRIS,
                contact_id,
                PIPELINE_A_TRAITER,
                PIPELINE_MAIL_ENVOYE,
            ],
        )?;
        Ok(())
    }

    pub fn get_etiquette_pipeline_board(
        &self,
        etiquette_id: i64,
    ) -> Result<EtiquettePipelineBoard> {
        let mut stmt = self.conn.prepare(
            "SELECT ce.id, ce.contact_id, c.prenom, c.nom, ce.email_envoye,
                    ce.email_date_envoi, COALESCE(ce.pipeline_status, ?1)
             FROM contact_etiquettes ce
             INNER JOIN contacts c ON c.id = ce.contact_id
             WHERE ce.etiquette_id = ?2
             ORDER BY c.nom, c.prenom",
        )?;
        let default_status = PIPELINE_A_TRAITER;
        let rows = stmt.query_map(params![default_status, etiquette_id], |row| {
            Ok(EtiquettePipelineContact {
                contact_etiquette_id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_prenom: row.get(2)?,
                contact_nom: row.get(3)?,
                email_envoye: row.get::<_, i64>(4)? != 0,
                email_date_envoi: row.get(5)?,
                pipeline_status: row.get(6)?,
            })
        })?;
        let contacts: Vec<_> = rows.collect::<Result<Vec<_>, _>>()?;
        Ok(EtiquettePipelineBoard {
            etiquette_id,
            contacts,
        })
    }
}
