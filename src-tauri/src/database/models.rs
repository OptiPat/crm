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
    pub agenda_link_id: Option<String>,
    /// Template utilisé pour le 2e envoi (À relancer), si défini
    pub relance_template_id: Option<i64>,
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
    #[serde(default)]
    pub agenda_link_id: Option<String>,
    #[serde(default)]
    pub relance_template_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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
pub struct YearlyActivityStats {
    pub year: i32,
    pub clients: i64,
    pub panier_moyen: f64,
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
    /// Dernière valorisation saisie (centimes), si renseignée.
    pub encours_actuel: Option<i64>,
    /// Date de la dernière valorisation (timestamp Unix).
    pub encours_date: Option<i64>,
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
    pub encours_actuel: Option<i64>,
    pub encours_date: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvestissementValorisation {
    pub id: i64,
    pub investissement_id: i64,
    pub montant: i64,
    pub date_valorisation: i64,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewInvestissementValorisation {
    pub investissement_id: i64,
    pub montant: i64,
    pub date_valorisation: Option<String>,
    pub notes: Option<String>,
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
    /// Date/heure Unix campagne à date fixe (tous les contacts)
    pub email_envoi_prevu: Option<i64>,
    /// Heure locale « HH:MM » : envoi le jour de l'éligibilité (règle auto)
    pub email_envoi_heure: Option<String>,
    /// Report au prochain mardi ou jeudi après J+N (`MARDI_JEUDI`), sinon jour calendaire.
    pub email_envoi_jours_semaine: Option<String>,
    pub email_actif: bool,
    // Système
    pub is_default: bool,
    /// false = étiquette désactivée (pas de règle auto ni campagne, tags AUTO retirés)
    pub actif: bool,
    /// Segment réutilisable (règle héritée si renseigné)
    pub segment_id: Option<i64>,
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
    pub email_envoi_heure: Option<String>,
    pub email_envoi_jours_semaine: Option<String>,
    pub email_actif: Option<bool>,      // Défaut: false
    // Système
    pub is_default: Option<bool>, // Défaut: false
    pub actif: Option<bool>,      // Défaut: true
    pub segment_id: Option<i64>,
}

// ==================== SEGMENTS ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Segment {
    pub id: i64,
    pub nom: String,
    pub description: Option<String>,
    pub rule_json: String,
    pub actif: bool,
    pub is_system: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SegmentWithCount {
    pub id: i64,
    pub nom: String,
    pub description: Option<String>,
    pub rule_json: String,
    pub actif: bool,
    pub is_system: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub contact_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewSegment {
    pub nom: String,
    pub description: Option<String>,
    pub rule_json: String,
    pub actif: Option<bool>,
}

fn default_queue_row_kind() -> String {
    "etiquette".to_string()
}

/// Ligne de la file d'envoi manuel (étiquettes ou modèle direct)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EtiquetteEmailQueueItem {
    /// `etiquette` → contact_etiquettes.id ; `template` → contact_template_envois.id
    #[serde(default = "default_queue_row_kind")]
    pub queue_row_kind: String,
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
    pub template_agenda_link_id: Option<String>,
    pub template_variables: Option<String>,
    pub template_categorie: Option<String>,
    /// Raison si file « incomplete » : NO_EMAIL, NO_TEMPLATE, NO_DATE, SCHEDULED
    pub queue_issue: Option<String>,
    /// Réponse client enregistrée (suivi campagne)
    pub email_reponse_at: Option<i64>,
    pub email_reponse_type: Option<String>,
    /// Dernier contact fiche (indice « contacté » après envoi)
    pub contact_date_dernier_contact: Option<i64>,
    /// File « Prêts » après un clic Relancer : utiliser le template de relance lié
    pub email_is_relance: bool,
}

/// Email campagne en attente pour un contact (fiche relation).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContactPendingEmail {
    /// `contact_etiquettes.id` ou `contact_template_envois.id`
    pub contact_etiquette_id: i64,
    /// `etiquette` | `template` — aligné sur `EtiquetteEmailQueueItem`
    #[serde(default = "default_queue_row_kind")]
    pub queue_row_kind: String,
    /// Libellé affiché (nom étiquette ou `Modèle · …`)
    pub etiquette_nom: String,
    pub queue_status: String,
    pub email_date_prevue: Option<i64>,
}

impl ContactPendingEmail {
    pub fn from_queue_item(item: &EtiquetteEmailQueueItem, queue_status: &str) -> Self {
        Self {
            contact_etiquette_id: item.contact_etiquette_id,
            queue_row_kind: item.queue_row_kind.clone(),
            etiquette_nom: item.etiquette_nom.clone(),
            queue_status: queue_status.to_string(),
            email_date_prevue: item.email_date_prevue,
        }
    }
}

/// Synthèse relation client (alertes + file email).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContactRelationStatus {
    pub open_alertes: Vec<Alerte>,
    pub pending_email: Option<ContactPendingEmail>,
}

/// Ligne à contrôler pour détection auto réponse mail / RDV.
#[derive(Debug, Clone)]
pub struct PendingCampaignResponseCheck {
    pub contact_etiquette_id: i64,
    pub contact_email: String,
    pub email_date_envoi: i64,
    pub email_gmail_thread_id: Option<String>,
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
    pub email_envoi_heure: Option<String>,
    pub email_envoi_jours_semaine: Option<String>,
    pub email_actif: bool,
    pub is_default: bool,
    pub actif: bool,
    pub segment_id: Option<i64>,
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

/// Une ligne du journal : échange manuel ou fil email campagne (envoi + réponse éventuelle).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExchangeHistoryEntry {
    pub entry_kind: String,
    pub sort_date: i64,
    pub contact_id: i64,
    pub contact_nom: String,
    pub contact_prenom: String,
    pub contact_email: Option<String>,
    pub contact_telephone: Option<String>,
    pub contact_etiquette_id: Option<i64>,
    pub etiquette_nom: Option<String>,
    pub sent_at: Option<i64>,
    pub sent_subject: Option<String>,
    pub sent_body: Option<String>,
    pub sent_template_nom: Option<String>,
    pub template_sujet: Option<String>,
    pub template_corps: Option<String>,
    pub template_agenda_link_id: Option<String>,
    pub email_gmail_message_id: Option<String>,
    pub email_gmail_thread_id: Option<String>,
    pub email_reponse_at: Option<i64>,
    pub email_reponse_type: Option<String>,
    pub email_reponse_body: Option<String>,
    pub email_reponse_gmail_message_id: Option<String>,
    pub interaction_id: Option<i64>,
    pub type_interaction: Option<String>,
    pub sujet: Option<String>,
    pub contenu: Option<String>,
    pub created_at: Option<i64>,
}

// ==================== SETTINGS ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

/// Lien Google Agenda (page de réservation) — plusieurs par CGP.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgendaLink {
    pub id: String,
    pub label: String,
    pub url: String,
}

/// Configuration du CGP (stockée en JSON dans settings)
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CgpConfig {
    pub nom: Option<String>,
    pub prenom: Option<String>,
    pub cabinet: Option<String>,
    pub email: Option<String>,
    pub telephone: Option<String>,
    #[serde(default)]
    pub agenda_links: Vec<AgendaLink>,
    /// Champs legacy (lecture seule, migrés vers agenda_links).
    #[serde(default, skip_serializing)]
    #[serde(alias = "lien_calendly")]
    pub lien_agenda: Option<String>,
    pub logo_path: Option<String>,
    pub wizard_completed: bool,
    pub wizard_step: i64,
    /// Signature ajoutée en fin de chaque email (texte brut, aperçu / édition).
    #[serde(default)]
    pub email_signature: Option<String>,
    /// Signature HTML (logo, mise en forme) — utilisée à l'envoi si présente.
    #[serde(default)]
    pub email_signature_html: Option<String>,
    /// Délai avant proposition de relance après envoi (jours, défaut 5).
    #[serde(default)]
    pub email_suivi_delai_jours: Option<i64>,
}

/// Message boîte mail synchronisé pour un contact (hors logique campagne / en attente de réponse).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContactGmailMessage {
    pub id: i64,
    pub contact_id: i64,
    pub gmail_message_id: String,
    pub gmail_thread_id: Option<String>,
    /// `inbound` (client → vous), `outbound` (vous → client), `unknown`
    pub direction: String,
    pub subject: Option<String>,
    pub snippet: Option<String>,
    pub body_text: Option<String>,
    pub body_fetched: bool,
    pub provider: String,
    pub attachments_json: Option<String>,
    pub sent_at: i64,
    pub synced_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContactMailSyncState {
    pub contact_id: i64,
    pub last_sync_at: Option<i64>,
    pub last_message_sent_at: Option<i64>,
    pub initial_sync_complete: bool,
    /// Tous les messages (5 ans) ont été parcourus au moins une fois.
    pub backfill_complete: bool,
    /// Reprise de la liste Gmail si l'import a été interrompu.
    pub list_page_token: Option<String>,
}
