use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Contact {
    pub id: Option<i64>,
    pub foyer_id: Option<i64>,
    pub categorie: String,
    pub civilite: Option<String>,
    pub nom: String,
    pub prenom: String,
    pub email: Option<String>,
    pub telephone: Option<String>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
    pub date_naissance: Option<String>,
    pub profession: Option<String>,
    pub situation_familiale: Option<String>,
    pub source_lead: Option<String>,
    pub profil_risque_sri: Option<i64>,
    pub date_dernier_contact: Option<String>,
    pub date_prochain_suivi: Option<String>,
    pub statut_suivi: String,
    pub notes: Option<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewContact {
    pub foyer_id: Option<i64>,
    pub categorie: String,
    pub civilite: Option<String>,
    pub nom: String,
    pub prenom: String,
    pub email: Option<String>,
    pub telephone: Option<String>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
    pub date_naissance: Option<String>,
    pub profession: Option<String>,
    pub situation_familiale: Option<String>,
    pub source_lead: Option<String>,
    pub profil_risque_sri: Option<i64>,
    pub date_dernier_contact: Option<String>,
    pub date_prochain_suivi: Option<String>,
    pub statut_suivi: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Foyer {
    pub id: i64,
    pub nom: String,
    pub type_foyer: String,
    pub nombre_parts_fiscales: Option<f64>,
    pub tranche_imposition: Option<String>,
    pub revenu_fiscal_reference: Option<f64>,
    pub situation_patrimoniale: Option<String>,
    pub objectifs_patrimoniaux: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewFoyer {
    pub nom: String,
    pub type_foyer: String,
    pub nombre_parts_fiscales: Option<f64>,
    pub tranche_imposition: Option<String>,
    pub revenu_fiscal_reference: Option<f64>,
    pub situation_patrimoniale: Option<String>,
    pub objectifs_patrimoniaux: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Partenaire {
    pub id: i64,
    pub type_partenaire: String,
    pub raison_sociale: String,
    pub nom_contact: Option<String>,
    pub prenom_contact: Option<String>,
    pub email: Option<String>,
    pub telephone: Option<String>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
    pub specialite: Option<String>,
    pub zone_geo: Option<String>,
    pub niveau_collaboration: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewPartenaire {
    pub type_partenaire: String,
    pub raison_sociale: String,
    pub nom_contact: Option<String>,
    pub prenom_contact: Option<String>,
    pub email: Option<String>,
    pub telephone: Option<String>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
    pub specialite: Option<String>,
    pub zone_geo: Option<String>,
    pub niveau_collaboration: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: i64,
    pub contact_id: Option<i64>,
    pub foyer_id: Option<i64>,
    pub type_document: String,
    pub nom_fichier: String,
    pub chemin_fichier: String,
    pub taille_fichier: i64,
    pub mime_type: Option<String>,
    pub date_document: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewDocument {
    pub contact_id: Option<i64>,
    pub foyer_id: Option<i64>,
    pub type_document: String,
    pub nom_fichier: String,
    pub chemin_fichier: String,
    pub taille_fichier: i64,
    pub mime_type: Option<String>,
    pub date_document: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateEmail {
    pub id: i64,
    pub nom: String,
    pub sujet: String,
    pub corps: String,
    pub categorie: String,
    pub variables: Option<String>, // JSON string
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewTemplateEmail {
    pub nom: String,
    pub sujet: String,
    pub corps: String,
    pub categorie: String,
    pub variables: Option<String>, // JSON string
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Alerte {
    pub id: i64,
    pub contact_id: i64,
    pub type_alerte: String,
    pub message: String,
    pub date_alerte: i64,
    pub lue: bool,
    pub traitee: bool,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewAlerte {
    pub contact_id: i64,
    pub type_alerte: String,
    pub message: String,
    pub date_alerte: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_clients: i64,
    pub total_prospects: i64,
    pub total_suspects: i64,
    pub encours_total: f64,
    pub alertes_non_traitees: i64,
}