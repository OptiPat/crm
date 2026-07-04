//! Filtre patrimoine « TYPE_PRODUIT » (étiquettes auto, déclencheurs modèle email).

use super::investissement_produit_match::nom_produit_matches;
use super::Database;
use rusqlite::{params, Result};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriStateFilter {
    Any,
    Inactive,
    Active,
}

#[derive(Debug, Clone)]
pub struct TypeProduitConditionParsed {
    pub types: Vec<String>,
    pub noms: Vec<String>,
    /// `true` = tous les noms cochés ; `false` = au moins un (défaut si absent).
    pub match_all_noms: bool,
    pub reinvestissement_dividendes: TriStateFilter,
    pub versement_programme: TriStateFilter,
}

struct ScopedInvestmentRow {
    type_produit: String,
    nom_produit: String,
    reinvestissement_dividendes: bool,
    versement_programme: bool,
}

pub fn parse_type_produit_condition_json(parsed: &Value) -> TypeProduitConditionParsed {
    let types: Vec<String> = parsed["types"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let noms: Vec<String> = parsed["noms_produit"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .filter(|s| !s.trim().is_empty())
                .collect()
        })
        .unwrap_or_default();
    let match_all_noms = parsed["produits_match_mode"]
        .as_str()
        .map(|s| s.eq_ignore_ascii_case("all"))
        .unwrap_or(false);
    TypeProduitConditionParsed {
        types,
        noms,
        match_all_noms,
        reinvestissement_dividendes: parse_tri_state(parsed.get("reinvestissement_dividendes")),
        versement_programme: parse_tri_state(parsed.get("versement_programme")),
    }
}

fn parse_tri_state(raw: Option<&Value>) -> TriStateFilter {
    match raw.and_then(|v| v.as_str()) {
        Some(s) if s.eq_ignore_ascii_case("inactive") => TriStateFilter::Inactive,
        Some(s) if s.eq_ignore_ascii_case("active") => TriStateFilter::Active,
        _ => TriStateFilter::Any,
    }
}

impl Database {
    pub(crate) fn contact_matches_type_produit_condition(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
        cfg: &TypeProduitConditionParsed,
    ) -> Result<bool> {
        if cfg.types.is_empty() && cfg.noms.is_empty() {
            return Ok(false);
        }

        let has_extra = cfg.reinvestissement_dividendes != TriStateFilter::Any
            || cfg.versement_programme != TriStateFilter::Any
            || (cfg.noms.len() >= 2 && cfg.match_all_noms);

        if !has_extra {
            return self.contact_has_investment_types_and_noms(
                contact_id,
                foyer_id,
                &cfg.types,
                &cfg.noms,
            );
        }

        let investments = self.load_scoped_investments_for_type_produit(contact_id, foyer_id)?;
        let product_ok = if !cfg.noms.is_empty() {
            if cfg.match_all_noms {
                cfg.noms.iter().all(|nom| {
                    investments.iter().any(|inv| {
                        investment_matches_type_and_nom(inv, &cfg.types, nom)
                    })
                })
            } else {
                cfg.noms.iter().any(|nom| {
                    investments.iter().any(|inv| {
                        investment_matches_type_and_nom(inv, &cfg.types, nom)
                    })
                })
            }
        } else {
            investments
                .iter()
                .any(|inv| cfg.types.iter().any(|t| t == &inv.type_produit))
        };

        if !product_ok {
            return Ok(false);
        }

        let matching: Vec<&ScopedInvestmentRow> = investments
            .iter()
            .filter(|inv| {
                let type_ok = cfg.types.is_empty()
                    || cfg.types.iter().any(|t| t == &inv.type_produit);
                if !type_ok {
                    return false;
                }
                if cfg.noms.is_empty() {
                    return true;
                }
                cfg.noms
                    .iter()
                    .any(|nom| nom_produit_matches(&inv.nom_produit, nom))
            })
            .collect();

        Ok(passes_tri_state(
            &matching,
            cfg.reinvestissement_dividendes,
            |inv| inv.reinvestissement_dividendes,
        ) && passes_tri_state(
            &matching,
            cfg.versement_programme,
            |inv| inv.versement_programme,
        ))
    }

    fn load_scoped_investments_for_type_produit(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
    ) -> Result<Vec<ScopedInvestmentRow>> {
        const SCOPE: &str =
            "(contact_id = ?1 OR (?2 IS NOT NULL AND foyer_id = ?2)) AND COALESCE(statut, 'ACTIF') = 'ACTIF'";
        let sql = format!(
            "SELECT type_produit, TRIM(COALESCE(nom_produit, '')),
                    COALESCE(reinvestissement_dividendes, 0), COALESCE(versement_programme, 0)
             FROM investissements WHERE {SCOPE}"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![contact_id, foyer_id], |row| {
            Ok(ScopedInvestmentRow {
                type_produit: row.get(0)?,
                nom_produit: row.get(1)?,
                reinvestissement_dividendes: row.get::<_, i64>(2)? != 0,
                versement_programme: row.get::<_, i64>(3)? != 0,
            })
        })?;
        rows.collect()
    }
}

fn investment_matches_type_and_nom(
    inv: &ScopedInvestmentRow,
    types: &[String],
    nom: &str,
) -> bool {
    let type_ok = types.is_empty() || types.iter().any(|t| t == &inv.type_produit);
    let nom_ok = nom.trim().is_empty() || nom_produit_matches(&inv.nom_produit, nom);
    type_ok && nom_ok
}

fn passes_tri_state<F>(matching: &[&ScopedInvestmentRow], filter: TriStateFilter, pred: F) -> bool
where
    F: Fn(&ScopedInvestmentRow) -> bool,
{
    match filter {
        TriStateFilter::Any => true,
        TriStateFilter::Inactive => matching.iter().any(|inv| !pred(inv)),
        TriStateFilter::Active => matching.iter().any(|inv| pred(inv)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewInvestissement};
    use crate::database::Database;

    #[test]
    fn type_produit_reinvest_filter() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let cid = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: "Dupont".into(),
                prenom: "Jean".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
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
            reinvestissement_dividendes: Some(false),
            notes: None,
            origine: None,
        })
        .unwrap();
        let cfg = TypeProduitConditionParsed {
            types: vec!["SCPI".into()],
            noms: vec!["Comète".into()],
            match_all_noms: false,
            reinvestissement_dividendes: TriStateFilter::Inactive,
            versement_programme: TriStateFilter::Any,
        };
        assert!(db
            .contact_matches_type_produit_condition(cid, None, &cfg)
            .unwrap());
        let cfg_active = TypeProduitConditionParsed {
            reinvestissement_dividendes: TriStateFilter::Active,
            ..cfg
        };
        assert!(!db
            .contact_matches_type_produit_condition(cid, None, &cfg_active)
            .unwrap());
    }
}
