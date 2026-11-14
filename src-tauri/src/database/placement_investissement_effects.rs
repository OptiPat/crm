//! Report sur le contrat (fiche placement) des actes de gestion validés par le partenaire :
//! versement complémentaire, versements programmés, arbitrage libre.
//!
//! Appliqué une seule fois, à la transition vers CONFORME (`investissement_applied_at`).
//! Un échec (contrat non relié, montant manquant…) n'annule jamais la validation : il est
//! journalisé sur le pipe pour une mise à jour manuelle de la fiche.

use chrono::{Local, TimeZone};
use rusqlite::{params, OptionalExtension, Result};

use super::arbitrage_alerts::add_months_to_timestamp;
use super::pipe::PIPE_TYPE_AFFAIRE;
use super::pipe_remuneration::{placement_validation_ts, unix_to_souscription_date_rfc3339};
use super::placement_operations::{placement_error_reason, OP_ARBITRAGE, VP_FREQUENCES};

/// Libellé UI Suivi (non Stellium) : ouvre une affaire enfant de versement.
const VERSEMENT_COMPLEMENTAIRE_LABEL: &str = "Versement complémentaire";
/// Seul arbitrage qui fait avancer « dernier / prochain arbitrage » du contrat (revue CGP).
const ARBITRAGE_LIBRE_LABEL: &str = "Arbitrage libre";
/// Prochain arbitrage = validation + 6 mois (même règle que le traitement d'une alerte).
const ARBITRAGE_NEXT_MONTHS: u32 = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConformeContractEffect {
    VersementComplementaire,
    VpMiseEnPlace,
    VpModification,
    VpArret,
    ArbitrageLibre,
}

fn normalize_label(label: &str) -> String {
    label
        .trim()
        .to_lowercase()
        .replace(['é', 'è', 'ê'], "e")
        .replace('à', "a")
}

pub(crate) fn is_vp_stellium_act_label(label: Option<&str>) -> bool {
    label
        .map(|l| normalize_label(l).starts_with("versements programmes"))
        .unwrap_or(false)
}

/// Fréquence d'un acte VP (mise en place / modification de périodicité), normalisée.
pub(crate) fn vp_act_frequence_from_input(
    label: Option<&str>,
    frequence: Option<&str>,
) -> Result<Option<String>> {
    if !is_vp_stellium_act_label(label) {
        return Ok(None);
    }
    let Some(f) = frequence.map(|f| f.trim().to_uppercase()).filter(|f| !f.is_empty()) else {
        return Ok(None);
    };
    if !VP_FREQUENCES.contains(&f.as_str()) {
        return Err(rusqlite::Error::InvalidParameterName(
            "versement programmé : fréquence invalide".into(),
        ));
    }
    Ok(Some(f))
}

pub(crate) fn conforme_contract_effect(
    operation_type: &str,
    stellium_label: Option<&str>,
) -> Option<ConformeContractEffect> {
    let label = stellium_label.map(normalize_label).unwrap_or_default();
    if label == normalize_label(VERSEMENT_COMPLEMENTAIRE_LABEL) {
        return Some(ConformeContractEffect::VersementComplementaire);
    }
    if let Some(rest) = label.strip_prefix("versements programmes") {
        if rest.contains("arret") {
            return Some(ConformeContractEffect::VpArret);
        }
        if rest.contains("mise en place") {
            return Some(ConformeContractEffect::VpMiseEnPlace);
        }
        if rest.contains("modification") {
            return Some(ConformeContractEffect::VpModification);
        }
        return None;
    }
    if operation_type == OP_ARBITRAGE && label == normalize_label(ARBITRAGE_LIBRE_LABEL) {
        return Some(ConformeContractEffect::ArbitrageLibre);
    }
    None
}

/// Jour calendaire local de `ts`, stocké à minuit UTC (convention des dates contrat).
fn local_day_midnight_utc(ts: i64) -> i64 {
    let day = Local
        .timestamp_opt(ts, 0)
        .single()
        .unwrap_or_else(Local::now)
        .date_naive();
    day.and_hms_opt(0, 0, 0)
        .map(|dt| dt.and_utc().timestamp())
        .unwrap_or(ts)
}

fn format_euros(centimes: i64) -> String {
    let euros = centimes / 100;
    let cents = centimes % 100;
    if cents == 0 {
        format!("{euros} €")
    } else {
        format!("{euros},{cents:02} €")
    }
}

fn invalid(message: &str) -> rusqlite::Error {
    rusqlite::Error::InvalidParameterName(message.into())
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

impl super::Database {
    /// Applique l'effet contrat et journalise le résultat (succès ou échec) sur le pipe.
    /// Ne renvoie jamais d'erreur : la validation partenaire reste acquise.
    pub(crate) fn apply_conforme_effects_to_investissement_journaled(&self, op_id: i64) {
        let result = self.with_named_savepoint("placement_inv_effect", || {
            self.apply_conforme_effects_to_investissement(op_id)
        });
        let journal = match result {
            Ok(None) => return,
            Ok(Some(message)) => ("Fiche placement mise à jour", message),
            Err(err) => {
                let reason = placement_error_reason(&err);
                eprintln!("Fiche placement non mise à jour (opération #{op_id}) : {reason}");
                (
                    "Fiche placement non mise à jour",
                    format!("Fiche placement non mise à jour : {reason}. Mettez-la à jour à la main."),
                )
            }
        };
        let journaled = self
            .get_placement_operation_by_id(op_id)
            .and_then(|op| self.journal_placement_note(&op, journal.0, journal.1));
        if let Err(err) = journaled {
            eprintln!("Journal fiche placement (opération #{op_id}) : {err}");
        }
    }

    /// `Ok(None)` : acte sans effet contrat ou déjà appliqué ; `Ok(Some(msg))` : appliqué.
    pub(crate) fn apply_conforme_effects_to_investissement(&self, op_id: i64) -> Result<Option<String>> {
        let op = self.get_placement_operation_by_id(op_id)?;
        let Some(effect) =
            conforme_contract_effect(&op.operation_type, op.stellium_label.as_deref())
        else {
            return Ok(None);
        };
        if op.dismissed_at.map(|t| t > 0).unwrap_or(false) {
            return Ok(None);
        }
        // Versement complémentaire : seule l'opération de l'affaire enfant crédite le contrat
        // (un brouillon resté sur le Suivi ne doit pas créer un second versement).
        if effect == ConformeContractEffect::VersementComplementaire {
            let on_affaire = match op.pipe_id.filter(|id| *id > 0) {
                Some(pipe_id) => self.get_pipe_by_id(pipe_id)?.pipe_type == PIPE_TYPE_AFFAIRE,
                None => false,
            };
            if !on_affaire {
                return Ok(None);
            }
        }
        let applied_at: Option<i64> = self
            .conn
            .query_row(
                "SELECT investissement_applied_at FROM placement_operations WHERE id = ?1",
                params![op_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        if applied_at.map(|t| t > 0).unwrap_or(false) {
            return Ok(None);
        }
        let Some(inv_id) = self.linked_investissement_id(&op)? else {
            return Err(invalid("contrat non relié à l'acte"));
        };
        let inv = self.get_investissement_by_id(inv_id)?;
        if !self.investissement_belongs_to_placement_contact(&inv, op.contact_id)? {
            return Err(invalid("le contrat relié n'appartient pas au client de l'acte"));
        }
        let validated_at = placement_validation_ts(&op).unwrap_or_else(now_unix);
        let montant = op.montant_centimes.filter(|m| *m > 0);
        let frequence = op
            .vp_frequence
            .as_ref()
            .map(|f| f.trim().to_uppercase())
            .filter(|f| VP_FREQUENCES.contains(&f.as_str()));

        let message = match effect {
            ConformeContractEffect::VersementComplementaire => {
                let Some(montant) = montant else {
                    return Err(invalid("montant du versement manquant"));
                };
                let note = match op.pipe_id.filter(|id| *id > 0) {
                    Some(pipe_id) => format!("Versement complémentaire validé (pipe #{pipe_id})"),
                    None => "Versement complémentaire validé".to_string(),
                };
                self.create_investissement_versement(super::models::NewInvestissementVersement {
                    investissement_id: inv_id,
                    montant,
                    date_versement: Some(unix_to_souscription_date_rfc3339(validated_at)),
                    notes: Some(note),
                })
                .map_err(|err| match placement_error_reason(&err).as_str() {
                    "versement_complementaire_ineligible" => invalid(
                        "versement complémentaire réservé aux assurance-vie, PER et contrats de capitalisation",
                    ),
                    _ => err,
                })?;
                format!("Versement complémentaire de {} ajouté au contrat.", format_euros(montant))
            }
            ConformeContractEffect::VpMiseEnPlace => {
                let Some(montant) = montant else {
                    return Err(invalid("montant du versement programmé manquant"));
                };
                let frequence = frequence.unwrap_or_else(|| "MENSUEL".to_string());
                self.conn.execute(
                    "UPDATE investissements SET versement_programme = 1,
                       montant_versement_programme = ?1, frequence_versement = ?2,
                       updated_at = unixepoch()
                     WHERE id = ?3",
                    params![montant, frequence, inv_id],
                )?;
                format!(
                    "Versement programmé mis en place : {} ({}).",
                    format_euros(montant),
                    frequence.to_lowercase()
                )
            }
            ConformeContractEffect::VpModification => {
                if montant.is_none() && frequence.is_none() {
                    // Modification d'allocation seule : rien à reporter sur la fiche.
                    self.mark_investissement_effect_applied(op_id)?;
                    return Ok(None);
                }
                self.conn.execute(
                    "UPDATE investissements SET versement_programme = 1,
                       montant_versement_programme = COALESCE(?1, montant_versement_programme),
                       frequence_versement = COALESCE(?2, frequence_versement, 'MENSUEL'),
                       updated_at = unixepoch()
                     WHERE id = ?3",
                    params![montant, frequence, inv_id],
                )?;
                let mut parts = Vec::new();
                if let Some(m) = montant {
                    parts.push(format!("montant {}", format_euros(m)));
                }
                if let Some(f) = frequence.as_ref() {
                    parts.push(format!("fréquence {}", f.to_lowercase()));
                }
                format!("Versement programmé modifié : {}.", parts.join(", "))
            }
            ConformeContractEffect::VpArret => {
                self.conn.execute(
                    "UPDATE investissements SET versement_programme = 0, updated_at = unixepoch()
                     WHERE id = ?1",
                    params![inv_id],
                )?;
                "Versement programmé arrêté sur le contrat.".to_string()
            }
            ConformeContractEffect::ArbitrageLibre => {
                let dernier = local_day_midnight_utc(validated_at);
                let prochain = add_months_to_timestamp(dernier, ARBITRAGE_NEXT_MONTHS);
                self.advance_investissement_arbitrage_dates(inv_id, Some(dernier), Some(prochain))?;
                self.close_obsolete_arbitrage_alerts_for_investissement(inv_id)?;
                let fmt = |ts: i64| {
                    chrono::DateTime::from_timestamp(ts, 0)
                        .map(|d| d.format("%d/%m/%Y").to_string())
                        .unwrap_or_default()
                };
                format!(
                    "Arbitrage enregistré : dernier le {}, prochain le {}.",
                    fmt(dernier),
                    fmt(prochain)
                )
            }
        };
        self.mark_investissement_effect_applied(op_id)?;
        Ok(Some(message))
    }

    fn mark_investissement_effect_applied(&self, op_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE placement_operations SET investissement_applied_at = ?1 WHERE id = ?2",
            params![now_unix(), op_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewInvestissement, NewPipe, NewPlacementOperation};
    use crate::database::pipe::{PIPE_STAGE_PROSPECTION, PIPE_TYPE_ACTE_GESTION};
    use rusqlite::params;
    use crate::database::placement_operations::{OP_VERSEMENT, STATUS_CONFORME, STATUS_NON_CONFORME};
    use crate::database::Database;

    fn setup(type_produit: &str) -> (Database, i64, i64, i64) {
        let db = Database::open_in_memory_for_tests().expect("db");
        let contact_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();
        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: type_produit.into(),
                partenaire_id: None,
                nom_produit: "Contrat test".into(),
                numero_contrat: None,
                montant_initial: Some(1_000_000),
                date_souscription: None,
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
                versement_programme: Some(true),
                montant_versement_programme: Some(10_000),
                frequence_versement: Some("MENSUEL".into()),
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();
        let pipe = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi".into(),
                stage: Some(PIPE_STAGE_PROSPECTION.into()),
                notes: None,
            })
            .unwrap();
        (db, contact_id, inv.id, pipe.id)
    }

    fn op(
        db: &Database,
        contact_id: i64,
        pipe_id: i64,
        inv_id: Option<i64>,
        operation_type: &str,
        label: &str,
        montant: Option<i64>,
        frequence: Option<&str>,
    ) -> i64 {
        db.create_placement_operation(NewPlacementOperation {
            contact_id,
            pipe_id: Some(pipe_id),
            operation_type: operation_type.into(),
            stellium_label: Some(label.into()),
            product_label: Some("Contrat test".into()),
            montant_centimes: montant,
            investissement_id: inv_id,
            vp_frequence: frequence.map(Into::into),
            ..Default::default()
        })
        .unwrap()
        .id
    }

    /// Affaire enfant « Versement complémentaire » du Suivi.
    fn versement_affaire(db: &Database, contact_id: i64, suivi_id: i64) -> i64 {
        db.create_pipe(NewPipe {
            contact_id,
            secondary_contact_id: None,
            pipe_type: PIPE_TYPE_AFFAIRE.into(),
            parent_pipe_id: Some(suivi_id),
            titre: "Versement complémentaire — Jean DUPONT".into(),
            stage: Some(PIPE_STAGE_PROSPECTION.into()),
            notes: None,
        })
        .unwrap()
        .id
    }

    fn inv_vp(db: &Database, inv_id: i64) -> (bool, Option<i64>, Option<String>) {
        let inv = db.get_investissement_by_id(inv_id).unwrap();
        (inv.versement_programme, inv.montant_versement_programme, inv.frequence_versement)
    }

    fn journal_titles(db: &Database, pipe_id: i64) -> Vec<String> {
        db.list_pipe_timeline_entries(pipe_id)
            .unwrap()
            .into_iter()
            .filter_map(|e| e.titre)
            .collect()
    }

    #[test]
    fn effect_mapping() {
        assert_eq!(
            conforme_contract_effect(OP_VERSEMENT, Some("Versement complémentaire")),
            Some(ConformeContractEffect::VersementComplementaire)
        );
        assert_eq!(
            conforme_contract_effect(OP_VERSEMENT, Some("Versements programmés : Arrêt")),
            Some(ConformeContractEffect::VpArret)
        );
        assert_eq!(
            conforme_contract_effect(OP_ARBITRAGE, Some("Arbitrage libre")),
            Some(ConformeContractEffect::ArbitrageLibre)
        );
        assert_eq!(
            conforme_contract_effect(OP_ARBITRAGE, Some("Arbitrages programmés : Mise en place")),
            None
        );
        assert_eq!(conforme_contract_effect("AUTRE", Some("Rachat partiel")), None);
    }

    #[test]
    fn versement_complementaire_ajoute_un_versement_une_seule_fois() {
        let (db, contact_id, inv_id, suivi_id) = setup("ASSURANCE_VIE");
        let pipe_id = versement_affaire(&db, contact_id, suivi_id);
        let id = op(
            &db, contact_id, pipe_id, Some(inv_id), OP_VERSEMENT,
            "Versement complémentaire", Some(500_000), None,
        );
        db.update_placement_operation_status(id, STATUS_CONFORME).unwrap();
        let versements = db.get_versements_by_investissement(inv_id).unwrap();
        assert_eq!(versements.len(), 1);
        assert_eq!(versements[0].montant, 500_000);
        assert!(journal_titles(&db, pipe_id).contains(&"Fiche placement mise à jour".to_string()));

        // Non conforme puis de nouveau conforme : pas de doublon.
        db.update_placement_operation_status(id, STATUS_NON_CONFORME).unwrap();
        db.update_placement_operation_status(id, STATUS_CONFORME).unwrap();
        assert_eq!(db.get_versements_by_investissement(inv_id).unwrap().len(), 1);
    }

    #[test]
    fn vp_modification_et_arret_mettent_a_jour_le_contrat() {
        let (db, contact_id, inv_id, pipe_id) = setup("PER");
        let modif = op(
            &db, contact_id, pipe_id, Some(inv_id), OP_VERSEMENT,
            "Versements programmés : Modification", Some(25_000), Some("trimestriel"),
        );
        db.update_placement_operation_status(modif, STATUS_CONFORME).unwrap();
        assert_eq!(inv_vp(&db, inv_id), (true, Some(25_000), Some("TRIMESTRIEL".into())));

        let arret = op(
            &db, contact_id, pipe_id, Some(inv_id), OP_VERSEMENT,
            "Versements programmés : Arrêt", None, None,
        );
        db.update_placement_operation_status(arret, STATUS_CONFORME).unwrap();
        assert!(!inv_vp(&db, inv_id).0);
    }

    #[test]
    fn arbitrage_libre_avance_les_dates() {
        let (db, contact_id, inv_id, pipe_id) = setup("ASSURANCE_VIE");
        let id = op(
            &db, contact_id, pipe_id, Some(inv_id), OP_ARBITRAGE, "Arbitrage libre", None, None,
        );
        db.update_placement_operation_status(id, STATUS_CONFORME).unwrap();
        let inv = db.get_investissement_by_id(inv_id).unwrap();
        let dernier = inv.date_dernier_arbitrage.expect("dernier arbitrage");
        let prochain = inv.date_prochain_arbitrage.expect("prochain arbitrage");
        assert_eq!(prochain, add_months_to_timestamp(dernier, ARBITRAGE_NEXT_MONTHS));
    }

    #[test]
    fn contrat_non_relie_journalise_sans_annuler_la_validation() {
        let (db, contact_id, inv_id, pipe_id) = setup("ASSURANCE_VIE");
        let id = op(
            &db, contact_id, pipe_id, None, OP_VERSEMENT,
            "Versements programmés : Mise en place", Some(10_000), Some("MENSUEL"),
        );
        let updated = db.update_placement_operation_status(id, STATUS_CONFORME).unwrap();
        assert_eq!(updated.status, STATUS_CONFORME);
        assert!(journal_titles(&db, pipe_id)
            .contains(&"Fiche placement non mise à jour".to_string()));
        assert_eq!(inv_vp(&db, inv_id), (true, Some(10_000), Some("MENSUEL".into())));
    }

    #[test]
    fn frequence_vp_invalide_refusee() {
        let (db, contact_id, _inv_id, pipe_id) = setup("PER");
        let err = db.create_placement_operation(NewPlacementOperation {
            contact_id,
            pipe_id: Some(pipe_id),
            operation_type: OP_VERSEMENT.into(),
            stellium_label: Some("Versements programmés : Modification".into()),
            vp_frequence: Some("HEBDO".into()),
            ..Default::default()
        });
        assert!(err.is_err());
    }

    #[test]
    fn brouillon_versement_sur_le_suivi_ne_credite_pas_le_contrat() {
        let (db, contact_id, inv_id, suivi_id) = setup("ASSURANCE_VIE");
        let id = op(
            &db, contact_id, suivi_id, Some(inv_id), OP_VERSEMENT,
            "Versement complémentaire", Some(500_000), None,
        );
        db.update_placement_operation_status(id, STATUS_CONFORME).unwrap();
        assert!(db.get_versements_by_investissement(inv_id).unwrap().is_empty());
    }

    #[test]
    fn contrat_d_un_autre_client_refuse() {
        let (db, _contact_id, inv_id, _suivi_id) = setup("PER");
        let other = db
            .create_contact(NewContact {
                nom: "MARTIN".into(),
                prenom: "Paul".into(),
                categorie: "CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();
        let other_suivi = db
            .create_pipe(NewPipe {
                contact_id: other,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi".into(),
                stage: Some(PIPE_STAGE_PROSPECTION.into()),
                notes: None,
            })
            .unwrap()
            .id;
        // Lien direct en base (contourne la vérification de création) : l'effet doit refuser.
        let id = op(
            &db, other, other_suivi, None, OP_VERSEMENT,
            "Versements programmés : Arrêt", None, None,
        );
        db.conn
            .execute(
                "UPDATE placement_operations SET investissement_id = ?1 WHERE id = ?2",
                params![inv_id, id],
            )
            .unwrap();
        db.update_placement_operation_status(id, STATUS_CONFORME).unwrap();
        assert!(inv_vp(&db, inv_id).0, "le VP du contrat d'un autre client reste actif");
        assert!(journal_titles(&db, other_suivi)
            .contains(&"Fiche placement non mise à jour".to_string()));
    }

    #[test]
    fn actes_anterieurs_a_la_fonctionnalite_ignores() {
        let (db, contact_id, inv_id, suivi_id) = setup("PER");
        // Acte créé avant la mise à jour de l'application (déjà reporté à la main).
        let id = op(
            &db, contact_id, suivi_id, Some(inv_id), OP_VERSEMENT,
            "Versements programmés : Arrêt", None, None,
        );
        // Schéma d'avant la fonctionnalité (triggers de synchro équipe retirés le temps du DROP).
        let triggers: Vec<String> = {
            let mut stmt = db
                .conn
                .prepare(
                    "SELECT name FROM sqlite_master
                     WHERE type = 'trigger' AND tbl_name = 'placement_operations'",
                )
                .unwrap();
            let names = stmt.query_map([], |row| row.get(0)).unwrap();
            names.map(|n| n.unwrap()).collect()
        };
        for name in triggers {
            db.conn.execute_batch(&format!("DROP TRIGGER \"{name}\"")).unwrap();
        }
        db.conn
            .execute_batch(
                "ALTER TABLE placement_operations DROP COLUMN investissement_applied_at",
            )
            .unwrap();
        db.migrate_placement_operations_table().unwrap();

        db.update_placement_operation_status(id, STATUS_CONFORME).unwrap();
        assert!(inv_vp(&db, inv_id).0, "fiche inchangée pour un acte ancien");
        assert!(!journal_titles(&db, suivi_id)
            .iter()
            .any(|t| t.starts_with("Fiche placement")));

        // Un acte créé après la migration est bien appliqué.
        let nouveau = op(
            &db, contact_id, suivi_id, Some(inv_id), OP_VERSEMENT,
            "Versements programmés : Arrêt", None, None,
        );
        db.update_placement_operation_status(nouveau, STATUS_CONFORME).unwrap();
        assert!(!inv_vp(&db, inv_id).0);
    }
}
