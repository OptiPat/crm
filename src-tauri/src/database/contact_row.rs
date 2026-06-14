use rusqlite::Row;

use super::models::Contact;

/// Colonnes SELECT communes pour un contact complet.
pub const CONTACT_SELECT: &str = "id, famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, lieu_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    date_dernier_contact_filleul, date_prochain_suivi_filleul,
                    statut_suivi, registre, notes, famille_regroupement_exclu, created_at, updated_at,
                    google_contact_resource_name, google_synced_at";

/// CONTACT_SELECT avec préfixe table (requêtes JOIN sur `contacts`).
pub fn contact_select_prefixed(prefix: &str) -> String {
    CONTACT_SELECT
        .split(',')
        .map(|col| format!("{prefix}.{}", col.trim()))
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn normalize_contact_registre(value: Option<&str>) -> String {
    match value.map(str::trim).filter(|s| !s.is_empty()) {
        Some(v) if v.eq_ignore_ascii_case("TU") => "TU".to_string(),
        _ => "VOUS".to_string(),
    }
}

pub fn map_contact_row(row: &Row<'_>) -> rusqlite::Result<Contact> {
    Ok(Contact {
        id: row.get(0)?,
        famille_id: row.get(1)?,
        foyer_id: row.get(2)?,
        role_foyer: row.get(3)?,
        role_famille: row.get(4)?,
        categorie: row.get(5)?,
        filleul_categorie: row.get(6)?,
        parrain_id: row.get(7)?,
        prescripteur_id: row.get(8)?,
        civilite: row.get(9)?,
        nom: row.get(10)?,
        prenom: row.get(11)?,
        email: row.get(12)?,
        telephone: row.get(13)?,
        adresse: row.get(14)?,
        code_postal: row.get(15)?,
        ville: row.get(16)?,
        date_naissance: row.get(17)?,
        lieu_naissance: row.get(18)?,
        profession: row.get(19)?,
        situation_familiale: row.get(20)?,
        source_lead: row.get(21)?,
        profil_risque_sri: row.get(22)?,
        date_dernier_contact: row.get(23)?,
        date_prochain_suivi: row.get(24)?,
        date_dernier_contact_filleul: row.get(25)?,
        date_prochain_suivi_filleul: row.get(26)?,
        statut_suivi: row.get(27)?,
        registre: row.get(28)?,
        notes: row.get(29)?,
        famille_regroupement_exclu: row.get::<_, i64>(30)? != 0,
        created_at: row.get(31)?,
        updated_at: row.get(32)?,
        google_contact_resource_name: row.get(33)?,
        google_synced_at: row.get(34)?,
    })
}
