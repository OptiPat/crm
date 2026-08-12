use serde::Serialize;

/// 7 : chaque ligne annonce si elle est immobilière et si elle est une SCPI,
/// pour que le portail cesse de recopier les listes de types du CRM
/// (6 : historique de valorisation étiqueté).
/// Le portail ne compare pas cette valeur, elle sert de repère de lecture pour
/// les payloads archivés.
pub const ESPACE_SYNC_SCHEMA_VERSION: u32 = 7;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientSyncPayload {
    pub schema_version: u32,
    pub sequence: i64,
    pub generated_at: i64,
    pub contact: EspaceClientContactSnapshot,
    pub acces: EspaceClientAccesSnapshot,
    pub investissements: Vec<EspaceClientInvestissementLine>,
    pub partenaires: Vec<EspaceClientPartenaireLine>,
    pub timeline: Vec<EspaceClientTimelineEvent>,
    /// Historique de valorisation des placements visibles, chaque point portant
    /// sa provenance : le client doit pouvoir distinguer ce qu'il a déclaré de
    /// ce que le cabinet a valorisé.
    pub valorisations: Vec<EspaceClientValorisationPoint>,
    pub demandes: Vec<EspaceClientDemandeLine>,
    /// Adresse du bouton permanent de prise de rendez-vous, choisie par le
    /// conseiller dans ses réglages. Absente = pas de bouton.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rdv_url: Option<String>,
    /// Clé publique de scellement des dépôts. La privée reste sur ce poste.
    pub depot_public_key: Option<String>,
}

/// Lien d'agenda du profil CGP, tel que le CRM le manipule en interne pour
/// résoudre les adresses. Seules les URL résolues partent au portail.
#[derive(Debug, Clone)]
pub struct EspaceClientRdvLien {
    pub id: String,
    pub url: String,
}

/// Provenance d'un point d'historique, telle que l'écran client l'annonce.
pub const VALORISATION_SOURCE_CABINET: &str = "cabinet";
pub const VALORISATION_SOURCE_CLIENT: &str = "client";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientValorisationPoint {
    pub investissement_id: i64,
    pub date_ts: i64,
    pub montant_centimes: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revenu_percu_centimes: Option<i64>,
    /// « cabinet » ou « client » — voir les constantes ci-dessus.
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientDemandeLine {
    pub id: i64,
    pub type_document: String,
    pub template_key: Option<String>,
    pub libelle: String,
    pub statut: String,
    pub demande_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientPartenaireLine {
    pub id: i64,
    pub raison_sociale: String,
    pub url_extranet: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientContactSnapshot {
    pub contact_id: i64,
    pub prenom: String,
    pub nom: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientAccesSnapshot {
    pub statut: String,
    pub email_utilise: Option<String>,
    pub activation_code_hash: Option<String>,
    pub premiere_connexion_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientInvestissementLine {
    pub id: i64,
    pub type_produit: String,
    pub partenaire_id: Option<i64>,
    pub nom_produit: String,
    pub montant_initial: Option<i64>,
    pub encours_actuel: Option<i64>,
    pub encours_date: Option<i64>,
    pub origine: String,
    /// Le portail ne tient aucune liste de types : c'est le CRM qui dit d'une
    /// ligne qu'elle est immobilière, donc qu'elle porte loyer et crédit.
    pub est_immobilier: bool,
    /// De même pour les SCPI, seules à porter un revenu perçu déclarable.
    pub est_scpi: bool,
    pub statut: String,
    pub date_souscription: Option<i64>,
    pub date_fin_demembrement: Option<i64>,
    pub date_fin_pret: Option<i64>,
    pub date_prochain_arbitrage: Option<i64>,
    pub derniere_maj_client: Option<i64>,
    pub mensualite_credit: Option<i64>,
    pub credit_crd: Option<i64>,
    pub loyer_mensuel: Option<i64>,
    pub url_contrat: Option<String>,
    pub versement_programme: bool,
    pub montant_versement_programme: Option<i64>,
    pub frequence_versement: Option<String>,
    pub reinvestissement_dividendes: bool,
    /// Pourcentage extrait des notes CRM (ex. « 100% »), si réinvestissement actif.
    pub reinvestissement_pourcent: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientTimelineEvent {
    pub id: String,
    pub kind: String,
    pub date: i64,
    pub label: String,
    pub detail: Option<String>,
    pub type_produit: Option<String>,
    pub origine: Option<String>,
    /// Adresse déjà résolue plutôt qu'un identifiant de lien : le portail n'a
    /// pas à connaître la liste des agendas pour afficher le bouton.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rdv_url: Option<String>,
}
