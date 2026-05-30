use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Contact {
    pub id: Option<i64>,
    pub famille_id: Option<i64>,
    pub foyer_id: Option<i64>,
    pub role_foyer: Option<String>,
    pub role_famille: Option<String>,
    pub categorie: String,
    pub filleul_categorie: Option<String>, // 🔥 Catégorie filleul indépendante
    pub parrain_id: Option<i64>,
    pub prescripteur_id: Option<i64>, // 🔥 Qui a recommandé ce client
    pub civilite: Option<String>,
    pub nom: String,
    pub prenom: String,
    pub email: Option<String>,
    pub telephone: Option<String>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
    pub date_naissance: Option<i64>,
    pub profession: Option<String>,
    pub situation_familiale: Option<String>,
    pub source_lead: Option<String>,
    pub profil_risque_sri: Option<i64>,
    // 🔥 Dates de suivi CLIENT (indépendantes des filleuls)
    pub date_dernier_contact: Option<i64>,
    pub date_prochain_suivi: Option<i64>,
    // 🔥 Dates de suivi FILLEUL (indépendantes des clients)
    pub date_dernier_contact_filleul: Option<i64>,
    pub date_prochain_suivi_filleul: Option<i64>,
    pub statut_suivi: String,
    pub notes: Option<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewContact {
    pub famille_id: Option<i64>,
    pub foyer_id: Option<i64>,
    pub role_foyer: Option<String>,
    pub role_famille: Option<String>,
    pub categorie: String,
    pub filleul_categorie: Option<String>, // 🔥 Catégorie filleul indépendante
    pub parrain_id: Option<i64>,
    pub prescripteur_id: Option<i64>, // 🔥 Qui a recommandé ce client
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
    // 🔥 Dates de suivi CLIENT (indépendantes des filleuls)
    pub date_dernier_contact: Option<String>,
    pub date_prochain_suivi: Option<String>,
    // 🔥 Dates de suivi FILLEUL (indépendantes des clients)
    pub date_dernier_contact_filleul: Option<String>,
    pub date_prochain_suivi_filleul: Option<String>,
    pub statut_suivi: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Famille {
    pub id: i64,
    pub nom: String,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewFamille {
    pub nom: String,
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
    pub encours_placements: f64,
    pub versements_programmes_annuels: f64,
    pub nombre_biens_immobiliers: i64,
    pub panier_moyen: f64,
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
    pub month: String, // Format: "Jan 2026"
    pub nouveaux: i64, // Nombre de nouveaux contacts ce mois
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductStats {
    pub type_produit: String, // Type de produit
    pub montant: f64,         // Montant total en euros
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PipelineStats {
    pub suspects: i64,  // Nombre total de suspects
    pub prospects: i64, // Nombre total de prospects
    pub clients: i64,   // Nombre total de clients
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
    pub date_alerte: String,
    pub statut: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Investissement {
    pub id: i64,
    pub contact_id: Option<i64>, // Optionnel pour les investissements de foyer
    pub foyer_id: Option<i64>,
    pub type_produit: String,
    pub partenaire_id: Option<i64>,
    pub nom_produit: String,
    pub montant_initial: Option<i64>,
    pub date_souscription: Option<i64>,
    pub date_fin_demembrement: Option<i64>,
    pub date_fin_pret: Option<i64>,
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
    pub contact_id: Option<i64>, // Optionnel pour les investissements de foyer
    pub foyer_id: Option<i64>,
    pub type_produit: String,
    pub partenaire_id: Option<i64>,
    pub nom_produit: String,
    pub montant_initial: Option<i64>,
    pub date_souscription: Option<String>,     // ISO string
    pub date_fin_demembrement: Option<String>, // ISO string
    pub date_fin_pret: Option<String>,         // ISO string
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
    pub contact_id: Option<i64>, // Optionnel pour les investissements de foyer
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
    pub date_fin_pret: Option<i64>,
    pub versement_programme: bool,
    pub montant_versement_programme: Option<i64>,
    pub frequence_versement: Option<String>,
    pub reinvestissement_dividendes: bool,
    pub notes: Option<String>,
    pub origine: String, // "MON_CONSEIL" ou "EXISTANT_CLIENT"
    pub created_at: i64,
    pub updated_at: i64,
}

// ==================== ETIQUETTES ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Etiquette {
    pub id: i64,
    pub nom: String,
    pub couleur: String,
    pub icone: Option<String>,
    pub description: Option<String>,
    pub priorite: i64,
    // Attribution automatique
    /// DELAI_SANS_CONTACT, DATE_APPROCHE (champs fiche contact uniquement),
    /// DATE_APPROCHE_INVESTISSEMENT (ex. date_fin_demembrement sur investissement/foyer),
    /// PERIODE_ANNEE, TYPE_PRODUIT, AGE_APPROCHE
    pub auto_condition_type: Option<String>,
    pub auto_condition_config: Option<String>, // JSON avec les paramètres
    pub auto_categories: Option<String>,     // JSON array des catégories concernées
    // Action email
    pub email_template_id: Option<i64>,
    pub email_delai_jours: i64,
    /// Date/heure Unix de la campagne d'envoi (file d'attente)
    pub email_envoi_prevu: Option<i64>,
    pub email_actif: bool,
    // Système
    pub is_default: bool,
    /// false = étiquette désactivée (pas de règle auto ni campagne, tags AUTO retirés)
    pub actif: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewEtiquette {
    pub nom: String,
    pub couleur: Option<String>, // Défaut: #3B82F6
    pub icone: Option<String>,
    pub description: Option<String>,
    pub priorite: Option<i64>, // Défaut: 0
    // Attribution automatique
    pub auto_condition_type: Option<String>,
    pub auto_condition_config: Option<String>,
    pub auto_categories: Option<String>,
    // Action email
    pub email_template_id: Option<i64>,
    pub email_delai_jours: Option<i64>, // Défaut: 0 (legacy)
    pub email_envoi_prevu: Option<i64>,
    pub email_actif: Option<bool>,      // Défaut: false
    // Système
    pub is_default: Option<bool>, // Défaut: false
    pub actif: Option<bool>,      // Défaut: true
}

/// Ligne de la file d'envoi manuel (étiquettes + email)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EtiquetteEmailQueueItem {
    pub contact_etiquette_id: i64,
    pub contact_id: i64,
    pub contact_nom: String,
    pub contact_prenom: String,
    pub contact_email: Option<String>,
    pub contact_telephone: Option<String>,
    pub etiquette_id: i64,
    pub etiquette_nom: String,
    pub etiquette_couleur: String,
    pub email_date_prevue: Option<i64>,
    pub email_date_envoi: Option<i64>,
    pub template_sujet: String,
    pub template_corps: String,
    /// Raison si file « incomplete » : NO_EMAIL, NO_TEMPLATE, NO_DATE, SCHEDULED
    pub queue_issue: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContactEtiquette {
    pub id: i64,
    pub contact_id: i64,
    pub etiquette_id: i64,
    pub date_attribution: i64,
    pub attribue_par: String, // "AUTO" ou "MANUEL"
    // Suivi email
    pub email_envoye: bool,
    pub email_date_prevue: Option<i64>,
    pub email_date_envoi: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewContactEtiquette {
    pub contact_id: i64,
    pub etiquette_id: i64,
    pub attribue_par: Option<String>, // Défaut: "AUTO"
    pub email_date_prevue: Option<i64>,
    pub notes: Option<String>,
}

// Étiquette enrichie avec le compteur de contacts
#[derive(Debug, Serialize, Deserialize)]
pub struct EtiquetteWithCount {
    pub id: i64,
    pub nom: String,
    pub couleur: String,
    pub icone: Option<String>,
    pub description: Option<String>,
    pub priorite: i64,
    pub auto_condition_type: Option<String>,
    pub auto_condition_config: Option<String>,
    pub auto_categories: Option<String>,
    pub email_template_id: Option<i64>,
    pub email_delai_jours: i64,
    pub email_envoi_prevu: Option<i64>,
    pub email_actif: bool,
    pub is_default: bool,
    pub actif: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub contact_count: i64, // Nombre de contacts avec cette étiquette
}

// Détails d'une étiquette sur un contact
#[derive(Debug, Serialize, Deserialize)]
pub struct ContactEtiquetteDetails {
    pub id: i64,
    pub contact_id: i64,
    pub etiquette_id: i64,
    pub etiquette_nom: String,
    pub etiquette_couleur: String,
    pub etiquette_icone: Option<String>,
    pub date_attribution: i64,
    pub attribue_par: String,
    pub email_envoye: bool,
    pub email_date_prevue: Option<i64>,
    pub notes: Option<String>,
}

// ==================== INTERACTIONS ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct Interaction {
    pub id: i64,
    pub contact_id: i64,
    pub type_interaction: String,
    pub sujet: Option<String>,
    pub contenu: Option<String>,
    pub date_interaction: i64,
    pub email_id: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewInteraction {
    pub contact_id: i64,
    pub type_interaction: String,
    pub sujet: Option<String>,
    pub contenu: Option<String>,
    pub date_interaction: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InteractionWithContact {
    pub id: i64,
    pub contact_id: i64,
    pub contact_nom: String,
    pub contact_prenom: String,
    pub type_interaction: String,
    pub sujet: Option<String>,
    pub contenu: Option<String>,
    pub date_interaction: i64,
    pub created_at: i64,
}

// ==================== SETTINGS ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

/// Configuration du CGP (stockée en JSON dans settings)
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CgpConfig {
    pub nom: Option<String>,
    pub prenom: Option<String>,
    pub cabinet: Option<String>,
    pub email: Option<String>,
    pub telephone: Option<String>,
    pub lien_calendly: Option<String>,
    pub logo_path: Option<String>,
    pub wizard_completed: bool,
    pub wizard_step: i64,
}
