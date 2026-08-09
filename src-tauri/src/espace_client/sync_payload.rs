use serde::Serialize;

pub const ESPACE_SYNC_SCHEMA_VERSION: u32 = 1;

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
}
