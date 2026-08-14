//! Catalogue des avoirs déclarables par le client.
//!
//! Doit rester identique à `src/lib/espace-client/client-avoir-catalogue.ts`
//! et à `src-tauri/src/espace_client/avoir_catalogue.rs`.

pub const AVOIR_TYPES_AUTORISES: [&str; 31] = [
    "ASSURANCE_VIE",
    "AUTRE",
    "BIJOUX",
    "CAT",
    "CEL",
    "COMPTE_COURANT",
    "COMPTE_TITRE",
    "CONTRAT_CAPITALISATION",
    "CSL",
    "DENORMANDIE",
    "EPARGNE_BANCAIRE",
    "EPARGNE_SALARIALE",
    "FONDS_COMMERCE",
    "IMMOBILIER",
    "LDDS",
    "LEP",
    "LIVRET_A",
    "LMNP",
    "LOCATIF_CLASSIQUE",
    "OBJET_ART",
    "PARTS_SOCIETE",
    "PEA",
    "PEAC",
    "PEL",
    "PER",
    "PINEL",
    "RESIDENCE_PRINCIPALE",
    "RESIDENCE_SECONDAIRE",
    "SCPI",
    "SCPI_DEMEMBREMENT",
    "VOITURE_COLLECTION",
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
        "meubles" => matches!(
            type_produit,
            "BIJOUX"
                | "OBJET_ART"
                | "VOITURE_COLLECTION"
                | "PARTS_SOCIETE"
                | "FONDS_COMMERCE"
        ),
        _ => false,
    }
}

pub fn panier_est_immobilier(panier: &str) -> bool {
    panier == "immobilier"
}

pub fn panier_est_scpi(panier: &str) -> bool {
    panier == "scpi"
}

pub fn normaliser_nom_produit(nom: &str) -> String {
    nom.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
