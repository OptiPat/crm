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

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryStats {
    pub clients: i64,
    pub prospect_client: i64,
    pub prospect_filleul: i64,
    pub suspect_client: i64,
    pub suspect_filleul: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthlyStats {
    pub month: String,      // Format: "Jan 2026"
    pub nouveaux: i64,      // Nombre de nouveaux contacts ce mois
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductStats {
    pub type_produit: String,   // Type de produit
    pub montant: f64,           // Montant total en euros
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PipelineStats {
    pub suspects: i64,    // Nombre total de suspects
    pub prospects: i64,   // Nombre total de prospects
    pub clients: i64,     // Nombre total de clients
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AlerteWithContact {
    pub alerte_id: i64,
    pub contact_id: i64,
    pub contact_nom: String,
    pub contact_prenom: String,
    pub contact_categorie: String,
    pub date_dernier_contact: Option<i64>,
    pub type_alerte: String,
    pub message: String,
    pub date_alerte: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Investissement {
    pub id: i64,
    pub contact_id: i64,
    pub foyer_id: Option<i64>,
    pub type_produit: String,
    pub partenaire_id: Option<i64>,
    pub nom_produit: String,
    pub montant_initial: Option<i64>,
    pub date_souscription: Option<i64>,
    pub date_fin_demembrement: Option<i64>,
    pub versement_programme: bool,
    pub montant_versement_programme: Option<i64>,
    pub frequence_versement: Option<String>,
    pub reinvestissement_dividendes: bool,
    pub notes: Option<String>,
    pub origine: String, // "MON_CONSEIL" ou "EXISTANT_CLIENT"
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewInvestissement {
    pub contact_id: i64,
    pub foyer_id: Option<i64>,
    pub type_produit: String,
    pub partenaire_id: Option<i64>,
    pub nom_produit: String,
    pub montant_initial: Option<i64>,
    pub date_souscription: Option<String>, // ISO string
    pub date_fin_demembrement: Option<String>, // ISO string
    pub versement_programme: Option<bool>,
    pub montant_versement_programme: Option<i64>,
    pub frequence_versement: Option<String>,
    pub reinvestissement_dividendes: Option<bool>,
    pub notes: Option<String>,
    pub origine: Option<String>, // "MON_CONSEIL" (défaut) ou "EXISTANT_CLIENT"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvestissementWithDetails {
    pub id: i64,
    pub contact_id: i64,
    pub contact_nom: String,
    pub contact_prenom: String,
    pub foyer_id: Option<i64>,
    pub foyer_nom: Option<String>,
    pub type_produit: String,
    pub partenaire_id: Option<i64>,
    pub partenaire_nom: Option<String>,
    pub nom_produit: String,
    pub montant_initial: Option<i64>,
    pub date_souscription: Option<i64>,
    pub date_fin_demembrement: Option<i64>,
    pub versement_programme: bool,
    pub montant_versement_programme: Option<i64>,
    pub frequence_versement: Option<String>,
    pub reinvestissement_dividendes: bool,
    pub notes: Option<String>,
    pub origine: String, // "MON_CONSEIL" ou "EXISTANT_CLIENT"
    pub created_at: i64,
    pub updated_at: i64,
}