use serde::Serialize;

/// 5 : ajout des liens de prise de rendez-vous. Le portail ne compare pas
/// cette valeur, elle sert de repère de lecture pour les payloads archivés.
pub const ESPACE_SYNC_SCHEMA_VERSION: u32 = 5;

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
    pub demandes: Vec<EspaceClientDemandeLine>,
    /// Prises de rendez-vous proposées au client. Vide = pas de bouton.
    pub rdv_liens: Vec<EspaceClientRdvLien>,
    /// Clé publique de scellement des dépôts. La privée reste sur ce poste.
    pub depot_public_key: Option<String>,
}

/// Lien de rendez-vous tel que le client le voit : un libellé, une adresse.
/// Reprend les liens Google Agenda du profil CGP — ceux-là mêmes qui servent
/// aux emails. L'identifiant suit pour qu'une échéance puisse en désigner un.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientRdvLien {
    pub id: String,
    pub libelle: String,
    pub url: String,
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
