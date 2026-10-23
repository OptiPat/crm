//! Rémunération pipe : placement auto à la validation partenaire (CONFORME) + lecture des lignes.

use chrono::{Local, TimeZone, Utc};
use rusqlite::{params, OptionalExtension, Result};

use super::placement_operations::{OP_SOUSCRIPTION, OP_VERSEMENT, STATUS_CONFORME};
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

/// Types acceptant un versement programmé (aligné sur `acceptsVersementProgramme` côté front).
fn type_produit_accepts_versement_programme(type_produit: &str) -> bool {
    matches!(
        type_produit,
        "ASSURANCE_VIE" | "CONTRAT_CAPITALISATION" | "PER" | "EPARGNE_SALARIALE" | "SCPI"
    )
}

/// Types acceptant le réinvestissement des dividendes (aligné sur le front).
fn type_produit_accepts_reinvestissement(type_produit: &str) -> bool {
    matches!(type_produit, "SCPI" | "SCPI_FISCALE")
}

/// Date de souscription comme le formulaire investissement : jour calendaire local,
/// stocké à minuit UTC (cf. `dateFieldToIso`).
fn unix_to_souscription_date_rfc3339(ts: i64) -> String {
    let local_day = Local
        .timestamp_opt(ts, 0)
        .single()
        .unwrap_or_else(Local::now)
        .date_naive();
    local_day
        .and_hms_opt(0, 0, 0)
        .map(|dt| dt.and_utc().to_rfc3339())
        .unwrap_or_else(|| Utc::now().to_rfc3339())
}

/// Date de validation partenaire d'une souscription CONFORME.
/// `conforme_at` (mail CONFORME ou validation manuelle) ; pour une validation antérieure à
/// cette colonne : date du dernier mail s'il est postérieur au dernier « non conforme ».
fn placement_validation_ts(op: &super::models::PlacementOperation) -> Option<i64> {
    if let Some(ts) = op.conforme_at.filter(|t| *t > 0) {
        return Some(ts);
    }
    let mail = op.email_received_at.filter(|t| *t > 0)?;
    let has_gmail = op
        .gmail_message_id
        .as_ref()
        .map(|id| !id.trim().is_empty())
        .unwrap_or(false);
    let after_nc = op.non_conforme_at.map(|nc| mail > nc).unwrap_or(true);
    (op.status == STATUS_CONFORME && has_gmail && after_nc).then_some(mail)
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

    /// Propriétaire investissement auto : couple même foyer → investissement commun (`foyer_id`, pas de `contact_id`).
    fn resolve_pipe_affaire_investissement_owner(
        &self,
        pipe: &super::models::Pipe,
    ) -> Result<(Option<i64>, Option<i64>)> {
        if pipe
            .secondary_contact_id
            .filter(|id| *id > 0)
            .is_none()
        {
            return Ok((Some(pipe.contact_id), None));
        }
        let primary = self.get_contact_by_id(pipe.contact_id)?;
        let Some(foyer_id) = primary.foyer_id.filter(|id| *id > 0) else {
            return Ok((Some(pipe.contact_id), None));
        };
        let secondary_id = pipe.secondary_contact_id.unwrap();
        let secondary = self.get_contact_by_id(secondary_id)?;
        if secondary.foyer_id == Some(foyer_id) {
            return Ok((None, Some(foyer_id)));
        }
        Ok((Some(pipe.contact_id), None))
    }

    /// Souscription affaire validée par le partenaire (CONFORME) : crée le placement dans le
    /// patrimoine du client, une seule fois (`investissement_id` déjà renseigné → rien).
    /// Appelé uniquement à la transition vers CONFORME (pas de création rétroactive).
    /// Titulaire déclaré, revalidé à la création : le contact / foyer doit exister et appartenir
    /// à l'affaire (contact principal, co-contact ou foyer de l'un d'eux). `None` = règle par défaut.
    fn validated_souscription_holder(
        &self,
        pipe: &super::models::Pipe,
        op: &super::models::PlacementOperation,
    ) -> Result<Option<(Option<i64>, Option<i64>)>> {
        let mut participants = vec![pipe.contact_id];
        if let Some(secondary) = pipe.secondary_contact_id.filter(|id| *id > 0) {
            participants.push(secondary);
        }
        if let Some(holder) = op.holder_contact_id.filter(|id| *id > 0) {
            let exists = self.get_contact_by_id(holder).optional()?.is_some();
            return Ok((exists && participants.contains(&holder)).then_some((Some(holder), None)));
        }
        if let Some(foyer_id) = op.holder_foyer_id.filter(|id| *id > 0) {
            if self.get_foyer_by_id(foyer_id).optional()?.is_none() {
                return Ok(None);
            }
            let allowed = match self.souscription_commun_foyer_allowed(pipe, foyer_id) {
                Ok(allowed) => allowed,
                Err(rusqlite::Error::QueryReturnedNoRows) => false,
                Err(err) => return Err(err),
            };
            return Ok(allowed.then_some((None, Some(foyer_id))));
        }
        Ok(None)
    }

    /// « Créer le placement » (action manuelle) : souscription d'affaire CONFORME sans placement,
    /// sans condition de transition. Idempotent : renvoie le placement déjà lié s'il existe.
    pub fn create_investissement_from_conforme_souscription(
        &self,
        op_id: i64,
    ) -> Result<super::models::Investissement> {
        let op = self.get_placement_operation_by_id(op_id)?;
        if let Some(inv_id) = self.linked_investissement_id(&op)? {
            return self.get_investissement_by_id(inv_id);
        }
        if op.dismissed_at.map(|t| t > 0).unwrap_or(false) {
            return Err(rusqlite::Error::InvalidParameterName(
                "souscription retirée du suivi".into(),
            ));
        }
        if op.status != STATUS_CONFORME {
            return Err(rusqlite::Error::InvalidParameterName(
                "souscription pas encore validée par le partenaire".into(),
            ));
        }
        let is_affaire = match op.pipe_id.filter(|id| *id > 0) {
            Some(pipe_id) => self.get_pipe_by_id(pipe_id)?.pipe_type == PIPE_TYPE_AFFAIRE,
            None => false,
        };
        if op.operation_type != OP_SOUSCRIPTION || !is_affaire {
            return Err(rusqlite::Error::InvalidParameterName(
                "réservé à la souscription d'une affaire".into(),
            ));
        }
        self.with_placement_savepoint(|| {
            self.maybe_create_investissement_from_conforme_souscription(op_id)?
                .ok_or_else(|| {
                    rusqlite::Error::InvalidParameterName(
                        "placement non créé : montant souscrit manquant".into(),
                    )
                })
        })
    }

    pub fn maybe_create_investissement_from_conforme_souscription(
        &self,
        op_id: i64,
    ) -> Result<Option<super::models::Investissement>> {
        let op = self.get_placement_operation_by_id(op_id)?;
        if op.status != STATUS_CONFORME || op.operation_type != OP_SOUSCRIPTION {
            return Ok(None);
        }
        if self.linked_investissement_id(&op)?.is_some() {
            return Ok(None);
        }
        if op.dismissed_at.map(|t| t > 0).unwrap_or(false) {
            return Ok(None);
        }
        let Some(pipe_id) = op.pipe_id.filter(|id| *id > 0) else {
            return Ok(None);
        };
        let pipe = self.get_pipe_by_id(pipe_id)?;
        if pipe.pipe_type != PIPE_TYPE_AFFAIRE || pipe.contact_id <= 0 {
            return Ok(None);
        }
        let Some(montant) = op.montant_centimes.filter(|m| *m > 0) else {
            return Ok(None);
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

        let (contact_id, foyer_id) = match self.validated_souscription_holder(&pipe, &op)? {
            Some(owner) => owner,
            None => {
                if op.holder_contact_id.filter(|id| *id > 0).is_some()
                    || op.holder_foyer_id.filter(|id| *id > 0).is_some()
                {
                    self.journal_placement_note(
                        &op,
                        "Titulaire par défaut",
                        "Titulaire déclaré introuvable ou hors de l'affaire : placement créé avec le titulaire par défaut.".into(),
                    )?;
                }
                self.resolve_pipe_affaire_investissement_owner(&pipe)?
            }
        };

        let souscription_ts = placement_validation_ts(&op).unwrap_or_else(now_unix);

        let vp = match (
            op.vp_montant_centimes.filter(|m| *m > 0),
            op.vp_frequence.as_ref().filter(|f| !f.trim().is_empty()),
        ) {
            (Some(m), Some(f)) if type_produit_accepts_versement_programme(&type_produit) => {
                Some((m, f.clone()))
            }
            _ => None,
        };
        let reinvest_pct = op
            .reinvest_dividendes_pct
            .filter(|p| (1..=100).contains(p))
            .filter(|_| type_produit_accepts_reinvestissement(&type_produit));

        let origin_note = format!("Créé depuis le pipe #{}", pipe_id);
        // Même encodage que le formulaire investissement : « Réinv. X% » en tête des notes.
        let notes = match reinvest_pct {
            Some(pct) => format!("Réinv. {}%\n{}", pct, origin_note),
            None => origin_note,
        };

        let inv = self.create_investissement(super::models::NewInvestissement {
            contact_id,
            foyer_id,
            type_produit,
            partenaire_id: None,
            nom_produit,
            numero_contrat: None,
            montant_initial: Some(montant),
            date_souscription: Some(unix_to_souscription_date_rfc3339(souscription_ts)),
            date_fin_demembrement: None,
            date_fin_pret: None,
            date_dernier_arbitrage: None,
            date_prochain_arbitrage: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: Some(vp.is_some()),
            montant_versement_programme: vp.as_ref().map(|(m, _)| *m),
            frequence_versement: vp.map(|(_, f)| f),
            reinvestissement_dividendes: Some(reinvest_pct.is_some()),
            notes: Some(notes),
            origine: Some("MON_CONSEIL".into()),
        })?;

        let now = now_unix();
        let linked = self.conn.execute(
            "UPDATE placement_operations SET investissement_id = ?1, updated_at = ?2
             WHERE id = ?3 AND (
               investissement_id IS NULL OR investissement_id <= 0
               OR NOT EXISTS (
                 SELECT 1 FROM investissements i
                 WHERE i.id = placement_operations.investissement_id AND i.id <> ?1
               )
             )",
            params![inv.id, now, op.id],
        )?;
        if linked == 0 {
            // Lié entre-temps (autre poste en mode équipe) : l'appelant annule le placement créé
            // via son SAVEPOINT. Risque résiduel : deux postes qui valident la même souscription
            // avant toute synchronisation créent chacun un placement (doublon à supprimer à la main).
            return Err(rusqlite::Error::InvalidParameterName(
                "placement déjà lié à cette souscription (autre poste ?)".into(),
            ));
        }
        // Même post-traitement que la commande create_investissement (étiquettes auto).
        let _ = self.sync_auto_etiquettes_after_investissement(
            inv.contact_id,
            inv.foyer_id,
            Some(inv.id),
        );
        Ok(Some(inv))
    }

    /// Exercice de rémunération (`date_exercice`) = date de validation partenaire :
    /// `date_souscription` du placement lié, sinon `conforme_at` (mail CONFORME ou validation
    /// manuelle), sinon le dernier mail s'il est postérieur au « non conforme » (validations
    /// antérieures à `conforme_at`), sinon la date du jalon Gagnée.
    pub fn list_pipe_remuneration_rows(&self) -> Result<Vec<super::models::PipeRemunerationRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.titre, p.contact_id, c.prenom, c.nom,
                    po.id, po.montant_centimes, po.type_produit, po.pv_manual, po.product_label,
                    po.investissement_id, i.date_souscription,
                    COALESCE(
                        i.date_souscription,
                        po.conforme_at,
                        CASE
                          WHEN po.status = 'CONFORME'
                           AND po.gmail_message_id IS NOT NULL AND TRIM(po.gmail_message_id) <> ''
                           AND po.email_received_at > 0
                           AND (po.non_conforme_at IS NULL OR po.email_received_at > po.non_conforme_at)
                          THEN po.email_received_at
                        END,
                        (SELECT MAX(t.occurred_at) FROM pipe_timeline_entries t
                          WHERE t.pipe_id = p.id AND t.entry_type = 'AVANCEMENT' AND t.titre = ?2)
                    )
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
             ORDER BY COALESCE(i.date_souscription, po.conforme_at, po.updated_at) DESC, p.id DESC",
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
                    date_exercice: row.get(12)?,
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
    use crate::database::models::{
        NewContact, NewFoyer, NewPipe, NewPlacementOperation, PlacementSouscriptionDetailsInput,
    };
    use crate::database::pipe::{
        PIPE_STAGE_GAGNEE, PIPE_STAGE_R3, PIPE_TYPE_ACTE_GESTION, PIPE_TYPE_AFFAIRE,
    };
    use crate::database::placement_operations::{
        OP_ARBITRAGE, OP_SOUSCRIPTION, OP_VERSEMENT, STATUS_CONFORME,
    };
    use crate::database::Database;
    use rusqlite::params;

    fn seed_contact(db: &Database) -> i64 {
        seed_named_contact(db, "DUPONT", "Jean", None)
    }

    fn seed_named_contact(db: &Database, nom: &str, prenom: &str, foyer_id: Option<i64>) -> i64 {
        db.create_contact(NewContact {
            nom: nom.into(),
            prenom: prenom.into(),
            categorie: "PROSPECT_CLIENT".into(),
            foyer_id,
            ..Default::default()
        })
        .unwrap()
        .id
        .expect("contact id")
    }

    fn seed_foyer(db: &Database) -> i64 {
        db.create_foyer(NewFoyer {
            nom: "Foyer couple".into(),
            type_foyer: "COUPLE".into(),
            nombre_parts_fiscales: None,
            tranche_imposition: None,
            revenu_fiscal_reference: None,
            ir_net_a_payer: None,
            situation_patrimoniale: None,
            objectifs_patrimoniaux: None,
            notes: None,
        })
        .unwrap()
        .id
    }

    /// Couple même foyer : (foyer_id, contact principal, co-contact).
    fn seed_couple(db: &Database) -> (i64, i64, i64) {
        let foyer_id = seed_foyer(db);
        let main_id = seed_named_contact(db, "DUPONT", "Jean", Some(foyer_id));
        let co_id = seed_named_contact(db, "LEGRAND", "Marie", Some(foyer_id));
        (foyer_id, main_id, co_id)
    }

    fn seed_affaire(db: &Database, contact_id: i64, secondary: Option<i64>, stage: &str) -> i64 {
        db.create_pipe(NewPipe {
            contact_id,
            secondary_contact_id: secondary,
            pipe_type: PIPE_TYPE_AFFAIRE.into(),
            parent_pipe_id: None,
            titre: "Affaire".into(),
            stage: Some(stage.into()),
            notes: None,
        })
        .unwrap()
        .id
    }

    fn souscription(
        contact_id: i64,
        pipe_id: i64,
        product: &str,
        type_produit: &str,
        montant: i64,
    ) -> NewPlacementOperation {
        NewPlacementOperation {
            contact_id,
            pipe_id: Some(pipe_id),
            operation_type: OP_SOUSCRIPTION.into(),
            product_label: Some(product.into()),
            stellium_label: Some("Souscription".into()),
            montant_centimes: Some(montant),
            type_produit: Some(type_produit.into()),
            ..Default::default()
        }
    }

    #[test]
    fn affaire_gagnee_no_longer_creates_investissement() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(souscription(
                contact_id,
                affaire,
                "Corum Origin",
                "SCPI",
                5_000_000,
            ))
            .unwrap();
        db.set_pipe_stage(affaire, PIPE_STAGE_GAGNEE, None, None)
            .unwrap();
        let after = db.get_placement_operation_by_id(op.id).unwrap();
        assert!(after.investissement_id.is_none());
        assert!(db.get_investissements_by_contact(contact_id).unwrap().is_empty());
        // La rémunération reste calculée sur l'opération.
        let rows = db.list_pipe_remuneration_rows().unwrap();
        assert!(rows.iter().any(|r| r.pipe_id == affaire && r.montant_centimes == 5_000_000));
    }

    #[test]
    fn manual_conforme_creates_investissement_once() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(souscription(
                contact_id,
                affaire,
                "Corum Origin",
                "SCPI",
                5_000_000,
            ))
            .unwrap();
        let today = local_midnight(chrono::Utc::now().timestamp());
        let updated = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        let inv_id = updated.investissement_id.expect("placement créé");
        let inv = db.get_investissement_by_id(inv_id).unwrap();
        assert_eq!(inv.montant_initial, Some(5_000_000));
        assert_eq!(inv.type_produit, "SCPI");
        assert_eq!(inv.nom_produit, "Corum Origin");
        assert_eq!(inv.contact_id, Some(contact_id));
        assert!(inv.foyer_id.is_none());
        assert_eq!(inv.origine, "MON_CONSEIL");
        assert_eq!(inv.statut, "ACTIF");
        assert_eq!(inv.notes.as_deref(), Some(format!("Créé depuis le pipe #{affaire}").as_str()));
        assert!(!inv.versement_programme);
        assert!(!inv.reinvestissement_dividendes);
        // Sans mail partenaire : date de souscription = maintenant.
        assert_eq!(inv.date_souscription, Some(today));

        // Idempotent : re-marquer conforme ne recrée rien.
        let again = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        assert_eq!(again.investissement_id, Some(inv_id));
        assert_eq!(db.get_investissements_by_contact(contact_id).unwrap().len(), 1);
        // Plus d'effet à la Gagnée.
        db.set_pipe_stage(affaire, PIPE_STAGE_GAGNEE, None, None)
            .unwrap();
        assert_eq!(db.get_investissements_by_contact(contact_id).unwrap().len(), 1);
    }

    #[test]
    fn email_conforme_uses_partner_date_and_copies_vp_reinvest() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(NewPlacementOperation {
                vp_montant_centimes: Some(20_000),
                vp_frequence: Some("mensuel".into()),
                reinvest_dividendes_pct: Some(50),
                ..souscription(contact_id, affaire, "Comète", "SCPI", 1_000_000)
            })
            .unwrap();
        assert_eq!(op.vp_frequence.as_deref(), Some("MENSUEL"));
        let received_at = op.created_at + 3_600;
        let (updated, changed) = db
            .apply_placement_email_update(
                contact_id,
                OP_SOUSCRIPTION,
                STATUS_CONFORME,
                Some("Souscription"),
                Some("Comète"),
                "msg-conforme",
                Some("Conforme"),
                received_at,
                Some(affaire),
            )
            .unwrap();
        assert!(changed);
        let inv = db
            .get_investissement_by_id(updated.investissement_id.expect("placement créé"))
            .unwrap();
        assert_eq!(inv.date_souscription, Some(local_midnight(received_at)));
        assert!(inv.versement_programme);
        assert_eq!(inv.montant_versement_programme, Some(20_000));
        assert_eq!(inv.frequence_versement.as_deref(), Some("MENSUEL"));
        assert!(inv.reinvestissement_dividendes);
        assert_eq!(
            inv.notes.as_deref(),
            Some(format!("Réinv. 50%\nCréé depuis le pipe #{affaire}").as_str())
        );
    }

    #[test]
    fn reinvest_ignored_for_assurance_vie_but_vp_kept() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(NewPlacementOperation {
                vp_montant_centimes: Some(10_000),
                vp_frequence: Some("TRIMESTRIEL".into()),
                reinvest_dividendes_pct: Some(100),
                ..souscription(contact_id, affaire, "Cristalliance Evoluvie", "ASSURANCE_VIE", 500_000)
            })
            .unwrap();
        let updated = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        let inv = db
            .get_investissement_by_id(updated.investissement_id.unwrap())
            .unwrap();
        assert!(inv.versement_programme);
        assert_eq!(inv.frequence_versement.as_deref(), Some("TRIMESTRIEL"));
        assert!(!inv.reinvestissement_dividendes);
    }

    #[test]
    fn couple_default_holder_is_foyer() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (foyer_id, main_id, co_id) = seed_couple(&db);
        let affaire = seed_affaire(&db, main_id, Some(co_id), PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(souscription(main_id, affaire, "Comete", "SCPI", 725_000))
            .unwrap();
        let updated = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        let inv = db
            .get_investissement_by_id(updated.investissement_id.unwrap())
            .unwrap();
        assert!(inv.contact_id.is_none());
        assert_eq!(inv.foyer_id, Some(foyer_id));
        assert_eq!(db.get_investissements_by_foyer(foyer_id).unwrap().len(), 1);
        assert_eq!(db.get_investissements_by_contact(co_id).unwrap().len(), 0);
    }

    #[test]
    fn explicit_holder_contact_or_foyer_is_used() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (foyer_id, main_id, co_id) = seed_couple(&db);
        let affaire = seed_affaire(&db, main_id, Some(co_id), PIPE_STAGE_R3);

        // Mme (co-contact) titulaire seule.
        let op_mme = db
            .create_placement_operation(NewPlacementOperation {
                holder_contact_id: Some(co_id),
                ..souscription(main_id, affaire, "Comete", "SCPI", 100_000)
            })
            .unwrap();
        let inv_mme = db
            .get_investissement_by_id(
                db.update_placement_operation_status(op_mme.id, STATUS_CONFORME)
                    .unwrap()
                    .investissement_id
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(inv_mme.contact_id, Some(co_id));
        assert!(inv_mme.foyer_id.is_none());

        // M. (contact principal) choisi via la modification de l'acte avant validation.
        let op_m = db
            .create_placement_operation(souscription(main_id, affaire, "Corum Origin", "SCPI", 200_000))
            .unwrap();
        db.update_placement_souscription_details(
            op_m.id,
            PlacementSouscriptionDetailsInput {
                holder_contact_id: Some(main_id),
                montant_centimes: Some(250_000),
                ..Default::default()
            },
        )
        .unwrap();
        let inv_m = db
            .get_investissement_by_id(
                db.update_placement_operation_status(op_m.id, STATUS_CONFORME)
                    .unwrap()
                    .investissement_id
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(inv_m.contact_id, Some(main_id));
        assert_eq!(inv_m.montant_initial, Some(250_000));

        // Commun explicite.
        let op_commun = db
            .create_placement_operation(NewPlacementOperation {
                holder_foyer_id: Some(foyer_id),
                ..souscription(main_id, affaire, "Activimmo", "SCPI", 300_000)
            })
            .unwrap();
        let inv_commun = db
            .get_investissement_by_id(
                db.update_placement_operation_status(op_commun.id, STATUS_CONFORME)
                    .unwrap()
                    .investissement_id
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(inv_commun.foyer_id, Some(foyer_id));
        assert!(inv_commun.contact_id.is_none());
    }

    #[test]
    fn souscription_details_validation() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (_, main_id, co_id) = seed_couple(&db);
        let outsider = seed_named_contact(&db, "MARTIN", "Paul", None);
        let affaire = seed_affaire(&db, main_id, Some(co_id), PIPE_STAGE_R3);
        assert!(db
            .create_placement_operation(NewPlacementOperation {
                holder_contact_id: Some(outsider),
                ..souscription(main_id, affaire, "Comete", "SCPI", 100_000)
            })
            .is_err());
        assert!(db
            .create_placement_operation(NewPlacementOperation {
                vp_montant_centimes: Some(10_000),
                ..souscription(main_id, affaire, "Comete", "SCPI", 100_000)
            })
            .is_err());
        assert!(db
            .create_placement_operation(NewPlacementOperation {
                reinvest_dividendes_pct: Some(150),
                ..souscription(main_id, affaire, "Comete", "SCPI", 100_000)
            })
            .is_err());

        let op = db
            .create_placement_operation(souscription(main_id, affaire, "Comete", "SCPI", 100_000))
            .unwrap();
        db.update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        assert!(
            db.update_placement_souscription_details(
                op.id,
                PlacementSouscriptionDetailsInput {
                    holder_contact_id: Some(co_id),
                    ..Default::default()
                },
            )
            .is_err(),
            "souscription validée : plus modifiable"
        );
    }

    #[test]
    fn already_conforme_operation_is_not_backfilled() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_GAGNEE);
        let op = db
            .create_placement_operation(souscription(
                contact_id,
                affaire,
                "Corum Origin",
                "SCPI",
                3_000_000,
            ))
            .unwrap();
        // Opération validée avant cette version (aucune transition déclenchée).
        db.conn
            .execute(
                "UPDATE placement_operations SET status = 'CONFORME' WHERE id = ?1",
                params![op.id],
            )
            .unwrap();
        let again = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        assert!(again.investissement_id.is_none());
        assert!(db.get_investissements_by_contact(contact_id).unwrap().is_empty());
    }

    #[test]
    fn conforme_on_suivi_or_versement_does_not_create_investissement() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let suivi = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let arbitrage = db
            .create_placement_operation(NewPlacementOperation {
                contact_id,
                pipe_id: Some(suivi.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: Some("Cristalliance Avenir".into()),
                stellium_label: Some("Arbitrage libre".into()),
                ..Default::default()
            })
            .unwrap();
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let versement = db
            .create_placement_operation(NewPlacementOperation {
                contact_id,
                pipe_id: Some(affaire),
                operation_type: OP_VERSEMENT.into(),
                product_label: Some("Cristalliance Avenir".into()),
                stellium_label: Some("Versement complémentaire".into()),
                montant_centimes: Some(100_000),
                ..Default::default()
            })
            .unwrap();
        for id in [arbitrage.id, versement.id] {
            let updated = db
                .update_placement_operation_status(id, STATUS_CONFORME)
                .unwrap();
            assert!(updated.investissement_id.is_none());
        }
        assert!(db.get_investissements_by_contact(contact_id).unwrap().is_empty());
    }

    #[test]
    fn list_pipe_remuneration_rows_deduplicates_per_pipe() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_GAGNEE);
        db.create_placement_operation(NewPlacementOperation {
            contact_id,
            pipe_id: Some(affaire),
            operation_type: OP_VERSEMENT.into(),
            product_label: Some("Versement".into()),
            stellium_label: Some("Versement complémentaire".into()),
            montant_centimes: Some(1_000_000),
            type_produit: Some("SCPI".into()),
            ..Default::default()
        })
        .unwrap();
        db.create_placement_operation(souscription(
            contact_id,
            affaire,
            "Corum Origin",
            "SCPI",
            5_000_000,
        ))
        .unwrap();

        let rows = db.list_pipe_remuneration_rows().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].pipe_id, affaire);
        assert_eq!(rows[0].montant_centimes, 5_000_000);
    }

    #[test]
    fn archived_placement_still_counts_for_remuneration() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(souscription(
                contact_id,
                affaire,
                "Corum Origin",
                "SCPI",
                3_000_000,
            ))
            .unwrap();
        let conforme = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        assert!(conforme.investissement_id.unwrap_or(0) > 0, "placement créé");
        db.conn
            .execute(
                "UPDATE placement_operations SET client_notified_at = 1700000000 WHERE id = ?1",
                params![op.id],
            )
            .unwrap();
        let archived = db.archive_placement_operation(op.id).unwrap();
        assert!(archived.archived_at.unwrap_or(0) > 0);

        let found = db
            .find_remuneration_placement_for_pipe(affaire)
            .unwrap()
            .expect("archivé toujours trouvé");
        assert_eq!(found.id, op.id);

        db.set_pipe_stage(affaire, PIPE_STAGE_GAGNEE, None, None)
            .unwrap();
        let after = db.get_placement_operation_by_id(op.id).unwrap();
        assert_eq!(after.investissement_id, conforme.investissement_id);
        assert!(after.archived_at.unwrap_or(0) > 0, "reste archivé");

        let rows = db.list_pipe_remuneration_rows().unwrap();
        assert!(rows.iter().any(|r| r.pipe_id == affaire));
    }

    fn journal_titles(db: &Database, pipe_id: i64) -> Vec<String> {
        db.list_pipe_timeline_entries(pipe_id)
            .unwrap()
            .into_iter()
            .filter_map(|e| e.titre)
            .collect()
    }

    #[test]
    fn deleted_holder_keeps_conforme_without_placement_and_journals() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (_, main_id, co_id) = seed_couple(&db);
        let affaire = seed_affaire(&db, main_id, Some(co_id), PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(NewPlacementOperation {
                holder_contact_id: Some(co_id),
                ..souscription(main_id, affaire, "Comete", "SCPI", 100_000)
            })
            .unwrap();
        // Co-contact (titulaire) supprimé après la déclaration.
        db.conn
            .execute("DELETE FROM contacts WHERE id = ?1", params![co_id])
            .unwrap();
        let updated = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .expect("la validation n'échoue pas");
        assert_eq!(updated.status, STATUS_CONFORME);
        assert!(updated.investissement_id.is_none());
        assert!(db.get_investissements_by_contact(main_id).unwrap().is_empty());
        assert!(journal_titles(&db, affaire)
            .iter()
            .any(|t| t == "Placement non créé"));
    }

    #[test]
    fn holder_outside_affaire_falls_back_to_default_and_journals() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (foyer_id, main_id, co_id) = seed_couple(&db);
        let affaire = seed_affaire(&db, main_id, Some(co_id), PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(NewPlacementOperation {
                holder_foyer_id: Some(foyer_id),
                ..souscription(main_id, affaire, "Comete", "SCPI", 100_000)
            })
            .unwrap();
        // Le couple quitte le foyer avant la validation partenaire.
        db.conn
            .execute("UPDATE contacts SET foyer_id = NULL", [])
            .unwrap();
        let updated = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        let inv = db
            .get_investissement_by_id(updated.investissement_id.expect("placement créé"))
            .unwrap();
        assert_eq!(inv.contact_id, Some(main_id));
        assert!(inv.foyer_id.is_none());
        assert!(journal_titles(&db, affaire)
            .iter()
            .any(|t| t == "Titulaire par défaut"));
    }

    #[test]
    fn manual_create_placement_is_idempotent_and_guarded() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_GAGNEE);
        let op = db
            .create_placement_operation(souscription(
                contact_id,
                affaire,
                "Corum Origin",
                "SCPI",
                3_000_000,
            ))
            .unwrap();
        assert!(
            db.create_investissement_from_conforme_souscription(op.id).is_err(),
            "pas encore conforme"
        );
        // Cas réel : validée sans placement (échec ou antérieure à cette version).
        db.conn
            .execute(
                "UPDATE placement_operations SET status = 'CONFORME', conforme_at = 1700000000 WHERE id = ?1",
                params![op.id],
            )
            .unwrap();
        let inv = db.create_investissement_from_conforme_souscription(op.id).unwrap();
        // Date de validation enregistrée, pas la date du clic.
        assert_eq!(inv.date_souscription, Some(local_midnight(1_700_000_000)));
        let again = db.create_investissement_from_conforme_souscription(op.id).unwrap();
        assert_eq!(again.id, inv.id);
        assert_eq!(db.get_investissements_by_contact(contact_id).unwrap().len(), 1);
        assert_eq!(
            db.get_placement_operation_by_id(op.id).unwrap().investissement_id,
            Some(inv.id)
        );
    }

    #[test]
    fn edit_refused_when_placement_already_created() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_GAGNEE);
        let other = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let first = db
            .create_placement_operation(souscription(contact_id, other, "Comete", "SCPI", 100_000))
            .unwrap();
        let inv_id = db
            .update_placement_operation_status(first.id, STATUS_CONFORME)
            .unwrap()
            .investissement_id
            .unwrap();
        // Ancienne affaire Gagnée : souscription PENDING mais placement déjà lié.
        let op = db
            .create_placement_operation(NewPlacementOperation {
                investissement_id: Some(inv_id),
                ..souscription(contact_id, affaire, "Comete", "SCPI", 100_000)
            })
            .unwrap();
        let err = db
            .update_placement_souscription_details(
                op.id,
                PlacementSouscriptionDetailsInput {
                    montant_centimes: Some(200_000),
                    ..Default::default()
                },
            )
            .unwrap_err();
        assert!(err.to_string().contains("déjà été créé"));
    }

    /// Jour calendaire local, minuit UTC (même stockage que le formulaire investissement).
    fn local_midnight(ts: i64) -> i64 {
        use chrono::TimeZone;
        chrono::Local
            .timestamp_opt(ts, 0)
            .unwrap()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp()
    }

    #[test]
    fn validation_date_ignores_non_conforme_mail() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(souscription(contact_id, affaire, "Comète", "SCPI", 100_000))
            .unwrap();
        let nc_at = op.created_at + 60;
        let conforme_at = op.created_at + 40 * 86_400;
        db.apply_placement_email_update(
            contact_id,
            OP_SOUSCRIPTION,
            "NON_CONFORME",
            Some("Souscription"),
            Some("Comète"),
            "msg-nc",
            None,
            nc_at,
            Some(affaire),
        )
        .unwrap();
        let (updated, _) = db
            .apply_placement_email_update(
                contact_id,
                OP_SOUSCRIPTION,
                STATUS_CONFORME,
                Some("Souscription"),
                Some("Comète"),
                "msg-ok",
                None,
                conforme_at,
                Some(affaire),
            )
            .unwrap();
        assert_eq!(updated.conforme_at, Some(conforme_at));
        let inv = db
            .get_investissement_by_id(updated.investissement_id.unwrap())
            .unwrap();
        assert_eq!(inv.date_souscription, Some(local_midnight(conforme_at)));

        // Validation manuelle après un « non conforme » : date du jour, pas la date du mail NC.
        let op2 = db
            .create_placement_operation(souscription(contact_id, affaire, "Corum Origin", "SCPI", 100_000))
            .unwrap();
        db.apply_placement_email_update(
            contact_id,
            OP_SOUSCRIPTION,
            "NON_CONFORME",
            Some("Souscription"),
            Some("Corum Origin"),
            "msg-nc-2",
            None,
            op2.created_at + 60,
            Some(affaire),
        )
        .unwrap();
        let manual = db
            .update_placement_operation_status(op2.id, STATUS_CONFORME)
            .unwrap();
        assert!(manual.conforme_at.unwrap() >= op2.created_at);
        let inv2 = db
            .get_investissement_by_id(manual.investissement_id.unwrap())
            .unwrap();
        assert_eq!(
            inv2.date_souscription,
            Some(local_midnight(chrono::Utc::now().timestamp()))
        );
    }

    #[test]
    fn deleted_placement_unlinks_and_can_be_recreated() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(souscription(contact_id, affaire, "Comete", "SCPI", 100_000))
            .unwrap();
        let inv_id = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap()
            .investissement_id
            .unwrap();
        db.delete_investissement(inv_id).unwrap();
        assert!(db
            .get_placement_operation_by_id(op.id)
            .unwrap()
            .investissement_id
            .is_none());
        let recreated = db.create_investissement_from_conforme_souscription(op.id).unwrap();
        assert_ne!(recreated.id, inv_id);
    }

    #[test]
    fn orphan_investissement_link_is_repaired_by_migration() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_GAGNEE);
        let op = db
            .create_placement_operation(souscription(contact_id, affaire, "Comete", "SCPI", 100_000))
            .unwrap();
        db.conn
            .execute(
                "UPDATE placement_operations SET status = 'CONFORME', investissement_id = 99999 WHERE id = ?1",
                params![op.id],
            )
            .unwrap();
        // Lien pendant : traité comme non lié (création manuelle possible).
        assert!(db.linked_investissement_id(&db.get_placement_operation_by_id(op.id).unwrap())
            .unwrap()
            .is_none());
        db.migrate_placement_operations_table().unwrap();
        assert!(db
            .get_placement_operation_by_id(op.id)
            .unwrap()
            .investissement_id
            .is_none());
        db.migrate_placement_operations_table().unwrap();
    }

    #[test]
    fn concurrent_link_rolls_back_created_placement() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let affaire = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let other = seed_affaire(&db, contact_id, None, PIPE_STAGE_R3);
        let first = db
            .create_placement_operation(souscription(contact_id, other, "Comete", "SCPI", 100_000))
            .unwrap();
        let existing_inv = db
            .update_placement_operation_status(first.id, STATUS_CONFORME)
            .unwrap()
            .investissement_id
            .unwrap();
        let op = db
            .create_placement_operation(souscription(contact_id, affaire, "Corum Origin", "SCPI", 200_000))
            .unwrap();
        // Simule un autre poste qui lie la souscription pendant la création.
        db.conn
            .execute_batch(&format!(
                "CREATE TRIGGER other_post AFTER INSERT ON investissements
                 BEGIN UPDATE placement_operations SET investissement_id = {existing_inv} WHERE id = {}; END;",
                op.id
            ))
            .unwrap();
        let updated = db
            .update_placement_operation_status(op.id, STATUS_CONFORME)
            .unwrap();
        assert_eq!(updated.status, STATUS_CONFORME);
        // Le savepoint annule le placement créé (et ici l'écriture simulée, faite dans la même
        // transaction) : aucun doublon.
        assert!(updated.investissement_id.is_none());
        assert_eq!(db.get_investissements_by_contact(contact_id).unwrap().len(), 1);
        assert!(journal_titles(&db, affaire)
            .iter()
            .any(|t| t == "Placement non créé"));
    }

    #[test]
    fn commun_requires_shared_foyer() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let foyer_a = seed_foyer(&db);
        let foyer_b = seed_foyer(&db);
        let main_id = seed_named_contact(&db, "DUPONT", "Jean", Some(foyer_a));
        let co_id = seed_named_contact(&db, "LEGRAND", "Marie", Some(foyer_b));
        let couple = seed_affaire(&db, main_id, Some(co_id), PIPE_STAGE_R3);
        assert!(
            db.create_placement_operation(NewPlacementOperation {
                holder_foyer_id: Some(foyer_a),
                ..souscription(main_id, couple, "Comete", "SCPI", 100_000)
            })
            .is_err(),
            "co-contact d'un autre foyer : pas de commun"
        );
        // Sans co-contact : commun seulement si le foyer compte au moins 2 membres.
        let seul = seed_affaire(&db, main_id, None, PIPE_STAGE_R3);
        assert!(db
            .create_placement_operation(NewPlacementOperation {
                holder_foyer_id: Some(foyer_a),
                ..souscription(main_id, seul, "Comete", "SCPI", 100_000)
            })
            .is_err());
        seed_named_contact(&db, "DUPONT", "Lucie", Some(foyer_a));
        assert!(db
            .create_placement_operation(NewPlacementOperation {
                holder_foyer_id: Some(foyer_a),
                ..souscription(main_id, seul, "Corum Origin", "SCPI", 100_000)
            })
            .is_ok());
    }

    #[test]
    fn details_on_already_conforme_souscription_are_rejected() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (_, main_id, co_id) = seed_couple(&db);
        let affaire = seed_affaire(&db, main_id, Some(co_id), PIPE_STAGE_R3);
        let op = db
            .create_placement_operation(souscription(main_id, affaire, "Comete", "SCPI", 100_000))
            .unwrap();
        db.conn
            .execute(
                "UPDATE placement_operations SET status = 'CONFORME' WHERE id = ?1",
                params![op.id],
            )
            .unwrap();
        let entry = db
            .create_pipe_timeline_entry(crate::database::models::NewPipeTimelineEntry {
                pipe_id: affaire,
                entry_type: "NOTE".into(),
                titre: Some("Souscription — Comete".into()),
                contenu: None,
                occurred_at: None,
            })
            .unwrap();
        let err = db
            .create_placement_operation(NewPlacementOperation {
                pipe_timeline_entry_id: Some(entry.id),
                holder_contact_id: Some(co_id),
                ..souscription(main_id, affaire, "Comete", "SCPI", 100_000)
            })
            .unwrap_err();
        assert!(err.to_string().contains("déjà validée"));
    }
}
