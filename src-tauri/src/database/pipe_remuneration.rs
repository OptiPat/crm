//! Rémunération pipe : investissement auto à la Gagnée + lecture des lignes.

use chrono::{TimeZone, Utc};
use rusqlite::{params, Result};

use super::placement_operations::{OP_SOUSCRIPTION, OP_VERSEMENT};
use super::pipe::{PIPE_STAGE_GAGNEE, PIPE_TYPE_AFFAIRE};

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn infer_type_produit_from_product_label(product_label: &str) -> String {
    let upper = product_label
        .trim()
        .to_uppercase()
        .replace('É', "E")
        .replace('È', "E")
        .replace('Ê', "E")
        .replace('Ë', "E");
    if upper.is_empty() {
        return "AUTRE".into();
    }
    if upper.contains("SCPI") && upper.contains("DEMEMBR") {
        return "SCPI_DEMEMBREMENT".into();
    }
    if upper.contains("G3F") {
        return "G3F".into();
    }
    if upper.contains("SCPI") {
        return "SCPI".into();
    }
    if upper.contains("FCPR") || upper.contains("FPCI") {
        return "FCPR".into();
    }
    if upper.contains("FIP") || upper.contains("FCPI") {
        return "FIP_FCPI".into();
    }
    if upper.contains("ASSURANCE") || upper.contains(" VIE") || upper == "AV" {
        return "ASSURANCE_VIE".into();
    }
    if upper.contains("PERISSOL") {
        return "PERISSOL".into();
    }
    if upper.contains("PER") {
        return "PER".into();
    }
    if upper.contains("CAPITALISATION") || upper.contains("CAPI") {
        return "CONTRAT_CAPITALISATION".into();
    }
    if upper.contains("LMNP") {
        return "LMNP".into();
    }
    if upper.contains("PINEL") {
        return "PINEL".into();
    }
    if upper.contains("MALRAUX") {
        return "MALRAUX".into();
    }
    if upper.contains("DENORMANDIE") {
        return "DENORMANDIE".into();
    }
    if upper.contains("IMMOBILIER")
        || upper.contains("VILLA")
        || upper.contains("APPARTEMENT")
        || upper.contains("MAISON")
        || upper.contains("IMMEUBLE")
    {
        return "IMMOBILIER".into();
    }
    "AUTRE".into()
}

fn type_produit_allows_pv_manual(type_produit: &str) -> bool {
    let t = type_produit.trim().to_uppercase();
    if t.is_empty() {
        return false;
    }
    const AUTO_ONLY: &[&str] = &[
        "G3F",
        "ASSURANCE_VIE",
        "PER",
        "CONTRAT_CAPITALISATION",
        "PREVOYANCE",
        "EPARGNE_SALARIALE",
        "SCPI",
        "SCPI_FISCALE",
        "SCPI_DEMEMBREMENT",
        "FIP_FCPI",
        "FCPR",
        "FPCI",
        "FPCR",
    ];
    !AUTO_ONLY.iter().any(|allowed| *allowed == t)
}

fn unix_to_rfc3339_local(ts: i64) -> String {
    Utc.timestamp_opt(ts, 0)
        .single()
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| Utc::now().to_rfc3339())
}

impl super::Database {
    pub fn find_remuneration_placement_for_pipe(
        &self,
        pipe_id: i64,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM placement_operations
             WHERE pipe_id = ?1
               AND dismissed_at IS NULL
               AND montant_centimes IS NOT NULL
               AND montant_centimes > 0
               AND operation_type IN (?2, ?3)
             ORDER BY CASE operation_type WHEN ?2 THEN 0 WHEN ?3 THEN 1 ELSE 2 END, id DESC
             LIMIT 1",
        )?;
        let mut rows = stmt.query_map(
            params![pipe_id, OP_SOUSCRIPTION, OP_VERSEMENT],
            |row| row.get::<_, i64>(0),
        )?;
        if let Some(id) = rows.next().transpose()? {
            return self.get_placement_operation_by_id(id).map(Some);
        }
        Ok(None)
    }

    pub fn maybe_create_investissement_from_gagnee_affaire(
        &self,
        pipe_id: i64,
        closing_date_unix: Option<i64>,
    ) -> Result<()> {
        let pipe = self.get_pipe_by_id(pipe_id)?;
        if pipe.pipe_type != PIPE_TYPE_AFFAIRE || pipe.stage != PIPE_STAGE_GAGNEE {
            return Ok(());
        }
        if pipe.contact_id <= 0 {
            return Ok(());
        }

        let Some(op) = self.find_remuneration_placement_for_pipe(pipe_id)? else {
            return Ok(());
        };
        if op.investissement_id.map(|id| id > 0).unwrap_or(false) {
            return Ok(());
        }
        let montant = match op.montant_centimes.filter(|m| *m > 0) {
            Some(m) => m,
            None => return Ok(()),
        };

        let type_produit = op
            .type_produit
            .as_ref()
            .filter(|s| !s.trim().is_empty())
            .cloned()
            .unwrap_or_else(|| {
                infer_type_produit_from_product_label(
                    op.product_label.as_deref().unwrap_or(""),
                )
            });
        let nom_produit = op
            .product_label
            .as_ref()
            .filter(|s| !s.trim().is_empty())
            .cloned()
            .unwrap_or_else(|| "Souscription".to_string());

        let closing_ts = closing_date_unix.filter(|t| *t > 0).unwrap_or_else(now_unix);
        let inv = self.create_investissement(super::models::NewInvestissement {
            contact_id: Some(pipe.contact_id),
            foyer_id: None,
            type_produit,
            partenaire_id: None,
            nom_produit,
            numero_contrat: None,
            montant_initial: Some(montant),
            date_souscription: Some(unix_to_rfc3339_local(closing_ts)),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: Some(format!("Créé depuis le pipe #{}", pipe_id)),
            origine: Some("MON_CONSEIL".into()),
        })?;

        let now = now_unix();
        self.conn.execute(
            "UPDATE placement_operations SET investissement_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![inv.id, now, op.id],
        )?;
        Ok(())
    }

    pub fn list_pipe_remuneration_rows(&self) -> Result<Vec<super::models::PipeRemunerationRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.titre, p.contact_id, c.prenom, c.nom,
                    po.id, po.montant_centimes, po.type_produit, po.pv_manual, po.product_label,
                    po.investissement_id, i.date_souscription
             FROM pipes p
             INNER JOIN contacts c ON c.id = p.contact_id
             INNER JOIN placement_operations po ON po.id = (
                 SELECT po2.id FROM placement_operations po2
                 WHERE po2.pipe_id = p.id
                   AND po2.dismissed_at IS NULL
                   AND po2.montant_centimes IS NOT NULL
                   AND po2.montant_centimes > 0
                   AND po2.operation_type IN (?3, ?4)
                 ORDER BY CASE po2.operation_type WHEN ?3 THEN 0 WHEN ?4 THEN 1 ELSE 2 END,
                          po2.id DESC
                 LIMIT 1
             )
             LEFT JOIN investissements i ON i.id = po.investissement_id
             WHERE p.pipe_type = ?1
               AND p.stage = ?2
             ORDER BY COALESCE(i.date_souscription, po.updated_at) DESC, p.id DESC",
        )?;
        let rows = stmt.query_map(
            params![PIPE_TYPE_AFFAIRE, PIPE_STAGE_GAGNEE, OP_SOUSCRIPTION, OP_VERSEMENT],
            |row| {
                Ok(super::models::PipeRemunerationRow {
                    pipe_id: row.get(0)?,
                    pipe_titre: row.get(1)?,
                    contact_id: row.get(2)?,
                    contact_prenom: row.get(3)?,
                    contact_nom: row.get(4)?,
                    placement_operation_id: row.get(5)?,
                    montant_centimes: row.get(6)?,
                    type_produit: row.get(7)?,
                    pv_manual: row.get(8)?,
                    product_label: row.get(9)?,
                    investissement_id: row.get(10)?,
                    date_souscription: row.get(11)?,
                })
            },
        )?;
        rows.collect()
    }

    pub fn update_placement_operation_pv_manual(
        &self,
        id: i64,
        pv_manual: Option<f64>,
    ) -> Result<super::models::PlacementOperation> {
        if let Some(pv) = pv_manual {
            if !pv.is_finite() || pv <= 0.0 {
                return Err(rusqlite::Error::InvalidParameterName(
                    "pv_manual invalide".into(),
                ));
            }
            let op = self.get_placement_operation_by_id(id)?;
            let type_produit = op
                .type_produit
                .as_ref()
                .filter(|s| !s.trim().is_empty())
                .cloned()
                .unwrap_or_else(|| {
                    infer_type_produit_from_product_label(
                        op.product_label.as_deref().unwrap_or(""),
                    )
                });
            if !type_produit_allows_pv_manual(&type_produit) {
                return Err(rusqlite::Error::InvalidParameterName(
                    "pv_manual réservé aux produits immobiliers".into(),
                ));
            }
        }
        let now = now_unix();
        let updated = self.conn.execute(
            "UPDATE placement_operations SET pv_manual = ?1, updated_at = ?2 WHERE id = ?3",
            params![pv_manual, now, id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.get_placement_operation_by_id(id)
    }
}

#[cfg(test)]
mod tests {
    use crate::database::models::{NewContact, NewPipe, NewPlacementOperation};
    use crate::database::pipe::{PIPE_STAGE_GAGNEE, PIPE_STAGE_R3, PIPE_TYPE_AFFAIRE};
    use crate::database::placement_operations::{OP_SOUSCRIPTION, OP_VERSEMENT};
    use crate::database::Database;

    fn seed_contact(db: &Database) -> i64 {
        db.create_contact(NewContact {
            nom: "DUPONT".into(),
            prenom: "Jean".into(),
            categorie: "PROSPECT_CLIENT".into(),
            ..Default::default()
        })
        .unwrap()
        .id
        .expect("contact id")
    }

    #[test]
    fn create_investissement_when_affaire_gagnee() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "SCPI Corum".into(),
                stage: Some(PIPE_STAGE_R3.into()),
                notes: None,
            })
            .unwrap();
        db.create_placement_operation(NewPlacementOperation {
            contact_id,
            pipe_id: Some(affaire.id),
            pipe_timeline_entry_id: None,
            operation_type: OP_SOUSCRIPTION.into(),
            product_label: Some("Corum Origin".into()),
            stellium_label: Some("Souscription".into()),
            montant_centimes: Some(5_000_000),
            type_produit: Some("SCPI".into()),
        })
        .unwrap();
        db.set_pipe_stage(affaire.id, PIPE_STAGE_GAGNEE, None, None)
            .unwrap();
        let op = db
            .find_remuneration_placement_for_pipe(affaire.id)
            .unwrap()
            .unwrap();
        assert!(op.investissement_id.unwrap_or(0) > 0);
        let inv = db
            .get_investissement_by_id(op.investissement_id.unwrap())
            .unwrap();
        assert_eq!(inv.montant_initial, Some(5_000_000));
        assert_eq!(inv.type_produit, "SCPI");
    }

    #[test]
    fn list_pipe_remuneration_rows_deduplicates_per_pipe() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Double op".into(),
                stage: Some(PIPE_STAGE_GAGNEE.into()),
                notes: None,
            })
            .unwrap();
        db.create_placement_operation(NewPlacementOperation {
            contact_id,
            pipe_id: Some(affaire.id),
            pipe_timeline_entry_id: None,
            operation_type: OP_VERSEMENT.into(),
            product_label: Some("Versement".into()),
            stellium_label: Some("Versement complémentaire".into()),
            montant_centimes: Some(1_000_000),
            type_produit: Some("SCPI".into()),
        })
        .unwrap();
        db.create_placement_operation(NewPlacementOperation {
            contact_id,
            pipe_id: Some(affaire.id),
            pipe_timeline_entry_id: None,
            operation_type: OP_SOUSCRIPTION.into(),
            product_label: Some("Corum Origin".into()),
            stellium_label: Some("Souscription".into()),
            montant_centimes: Some(5_000_000),
            type_produit: Some("SCPI".into()),
        })
        .unwrap();

        let rows = db.list_pipe_remuneration_rows().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].pipe_id, affaire.id);
        assert_eq!(rows[0].montant_centimes, 5_000_000);
    }

    #[test]
    fn create_investissement_when_gagnee_affaire_gets_montant_later() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Late montant".into(),
                stage: Some(PIPE_STAGE_GAGNEE.into()),
                notes: None,
            })
            .unwrap();
        db.create_placement_operation(NewPlacementOperation {
            contact_id,
            pipe_id: Some(affaire.id),
            pipe_timeline_entry_id: None,
            operation_type: OP_SOUSCRIPTION.into(),
            product_label: Some("Corum Origin".into()),
            stellium_label: Some("Souscription".into()),
            montant_centimes: Some(3_000_000),
            type_produit: Some("SCPI".into()),
        })
        .unwrap();
        let op = db
            .find_remuneration_placement_for_pipe(affaire.id)
            .unwrap()
            .unwrap();
        assert!(op.investissement_id.unwrap_or(0) > 0);
    }
}
