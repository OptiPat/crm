//! Catalogue des avoirs déclarables par le client.
//!
//! Doit rester identique à `src/lib/espace-client/client-avoir-catalogue.ts`
//! et à `espace-portail/src/avoir_catalogue.rs`. Le test
//! `client-avoir-catalogue.test.ts` compare les trois.

pub const AVOIR_TYPES_AUTORISES: [&str; 26] = [
    "ASSURANCE_VIE",
    "AUTRE",
    "CAT",
    "CEL",
    "COMPTE_COURANT",
    "COMPTE_TITRE",
    "CONTRAT_CAPITALISATION",
    "CSL",
    "DENORMANDIE",
    "EPARGNE_BANCAIRE",
    "EPARGNE_SALARIALE",
    "IMMOBILIER",
    "LDDS",
    "LEP",
    "LIVRET_A",
    "LMNP",
    "LOCATIF_CLASSIQUE",
    "PEA",
    "PEAC",
    "PEL",
    "PER",
    "PINEL",
    "RESIDENCE_PRINCIPALE",
    "RESIDENCE_SECONDAIRE",
    "SCPI",
    "SCPI_DEMEMBREMENT",
];

pub fn type_autorise_pour_panier(panier: &str, type_produit: &str) -> bool {
    if !AVOIR_TYPES_AUTORISES.contains(&type_produit) {
        return false;
    }
    match panier {
        "immobilier" => matches!(
            type_produit,
            "RESIDENCE_PRINCIPALE"
                | "RESIDENCE_SECONDAIRE"
                | "LMNP"
                | "LOCATIF_CLASSIQUE"
                | "PINEL"
                | "DENORMANDIE"
                | "IMMOBILIER"
        ),
        "scpi" => matches!(type_produit, "SCPI" | "SCPI_DEMEMBREMENT"),
        "placements" => matches!(
            type_produit,
            "PEA"
                | "COMPTE_TITRE"
                | "ASSURANCE_VIE"
                | "CONTRAT_CAPITALISATION"
                | "PER"
                | "EPARGNE_SALARIALE"
                | "AUTRE"
        ),
        "epargne" => matches!(
            type_produit,
            "COMPTE_COURANT"
                | "LDDS"
                | "LIVRET_A"
                | "LEP"
                | "PEAC"
                | "CEL"
                | "PEL"
                | "CAT"
                | "CSL"
                | "EPARGNE_BANCAIRE"
        ),
        _ => false,
    }
}

#[cfg(test)]
pub fn panier_est_immobilier(panier: &str) -> bool {
    panier == "immobilier"
}

#[cfg(test)]
pub fn panier_est_scpi(panier: &str) -> bool {
    panier == "scpi"
}

pub fn normaliser_nom_produit(nom: &str) -> String {
    nom.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_a_type_from_the_wrong_basket() {
        assert!(type_autorise_pour_panier("placements", "PER"));
        assert!(!type_autorise_pour_panier("immobilier", "PER"));
        assert!(type_autorise_pour_panier("epargne", "CAT"));
    }

    #[test]
    fn unique_list_is_sorted_and_complete() {
        let mut sorted = AVOIR_TYPES_AUTORISES.to_vec();
        sorted.sort_unstable();
        assert_eq!(sorted, AVOIR_TYPES_AUTORISES);
        assert_eq!(AVOIR_TYPES_AUTORISES.len(), 26);
    }

    #[test]
    fn panier_flags_and_name_normalisation() {
        assert!(panier_est_immobilier("immobilier"));
        assert!(panier_est_scpi("scpi"));
        assert_eq!(normaliser_nom_produit("  Swiss  Life "), "swiss life");
    }
}
