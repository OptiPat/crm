//! Config « événement : nouvelle souscription » (étiquettes + déclencheurs modèle email).

use super::models::Investissement;
use super::type_produit_condition::TriStateFilter;
use serde_json::Value;

#[derive(Debug, Clone, Default)]
pub struct SouscriptionEventConditionParsed {
    pub types: Vec<String>,
    pub a_chaque_souscription: bool,
    pub reinvestissement_dividendes: TriStateFilter,
}

fn parse_tri_state(raw: Option<&Value>) -> TriStateFilter {
    match raw.and_then(|v| v.as_str()) {
        Some(s) if s.eq_ignore_ascii_case("inactive") => TriStateFilter::Inactive,
        Some(s) if s.eq_ignore_ascii_case("active") => TriStateFilter::Active,
        _ => TriStateFilter::Any,
    }
}

pub fn parse_souscription_event_condition_json(parsed: &Value) -> SouscriptionEventConditionParsed {
    let types: Vec<String> = parsed["types"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    SouscriptionEventConditionParsed {
        types,
        a_chaque_souscription: parsed["a_chaque_souscription"].as_bool().unwrap_or(true),
        reinvestissement_dividendes: parse_tri_state(parsed.get("reinvestissement_dividendes")),
    }
}

pub fn parse_souscription_event_condition_str(
    cfg: Option<&str>,
) -> SouscriptionEventConditionParsed {
    let Some(raw) = cfg.filter(|s| !s.trim().is_empty()) else {
        return SouscriptionEventConditionParsed {
            a_chaque_souscription: true,
            ..Default::default()
        };
    };
    serde_json::from_str::<Value>(raw)
        .map(|v| parse_souscription_event_condition_json(&v))
        .unwrap_or_default()
}

fn investissement_matches_reinvest_filter(
    reinvestissement_dividendes: bool,
    filter: TriStateFilter,
) -> bool {
    match filter {
        TriStateFilter::Any => true,
        TriStateFilter::Inactive => !reinvestissement_dividendes,
        TriStateFilter::Active => reinvestissement_dividendes,
    }
}

/// Filtre type produit + réinvestissement sur l'investissement déclencheur.
pub fn investissement_matches_souscription_event_condition(
    inv: &Investissement,
    cfg: &SouscriptionEventConditionParsed,
) -> bool {
    if !cfg.types.is_empty() && !cfg.types.iter().any(|t| t == &inv.type_produit) {
        return false;
    }
    investissement_matches_reinvest_filter(
        inv.reinvestissement_dividendes,
        cfg.reinvestissement_dividendes,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_inv(type_produit: &str, reinvest: bool) -> Investissement {
        Investissement {
            id: 1,
            contact_id: Some(1),
            foyer_id: None,
            type_produit: type_produit.into(),
            partenaire_id: None,
            nom_produit: "Test".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: Some(1_700_000_000),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: false,
            prevoyance_pro: false,
            prevoyance_versement_mensuel: None,
            versement_programme: false,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: reinvest,
            notes: None,
            origine: "MON_CONSEIL".into(),
            statut: "ACTIF".into(),
            date_cloture: None,
            encours_actuel: None,
            encours_date: None,
            montant_investi_total: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn reinvest_inactive_filter_excludes_reinvesting_scpi() {
        let cfg = SouscriptionEventConditionParsed {
            types: vec!["SCPI".into()],
            a_chaque_souscription: true,
            reinvestissement_dividendes: TriStateFilter::Inactive,
        };
        assert!(investissement_matches_souscription_event_condition(
            &sample_inv("SCPI", false),
            &cfg
        ));
        assert!(!investissement_matches_souscription_event_condition(
            &sample_inv("SCPI", true),
            &cfg
        ));
    }
}
