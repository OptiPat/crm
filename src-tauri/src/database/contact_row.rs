use rusqlite::Row;

use super::models::Contact;

/// Colonnes SELECT communes pour un contact complet.
pub const CONTACT_SELECT: &str = "id, famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, pays, date_naissance, lieu_naissance, profession, situation_familiale,
                    regime_matrimonial, revenus_annuels, charges_emprunts, objectifs_patrimoniaux,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    date_dernier_contact_filleul, date_prochain_suivi_filleul,
                    statut_suivi, registre, notes, famille_regroupement_exclu, created_at, updated_at,
                    google_contact_resource_name, google_synced_at, epargne_precaution_souhaitee,
                    tranche_imposition, nombre_parts_fiscales, revenu_fiscal_reference, ir_net_a_payer,
                    date_r1, type_invitation_filleul, date_invitation_filleul, presence_invitation_filleul,
                    filleul_titre, filleul_qualification, filleul_volume, filleul_volume_manager";

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
        pays: row.get(17)?,
        date_naissance: row.get(18)?,
        lieu_naissance: row.get(19)?,
        profession: row.get(20)?,
        situation_familiale: row.get(21)?,
        regime_matrimonial: row.get(22)?,
        revenus_annuels: row.get(23)?,
        charges_emprunts: row.get(24)?,
        objectifs_patrimoniaux: row.get(25)?,
        source_lead: row.get(26)?,
        profil_risque_sri: row.get(27)?,
        date_dernier_contact: row.get(28)?,
        date_prochain_suivi: row.get(29)?,
        date_dernier_contact_filleul: row.get(30)?,
        date_prochain_suivi_filleul: row.get(31)?,
        statut_suivi: row.get(32)?,
        registre: row.get(33)?,
        notes: row.get(34)?,
        famille_regroupement_exclu: row.get::<_, i64>(35)? != 0,
        created_at: row.get(36)?,
        updated_at: row.get(37)?,
        google_contact_resource_name: row.get(38)?,
        google_synced_at: row.get(39)?,
        epargne_precaution_souhaitee: row.get(40)?,
        tranche_imposition: row.get(41)?,
        nombre_parts_fiscales: row.get(42)?,
        revenu_fiscal_reference: row.get(43)?,
        ir_net_a_payer: row.get(44)?,
        date_r1: row.get(45)?,
        type_invitation_filleul: row.get(46)?,
        date_invitation_filleul: row.get(47)?,
        presence_invitation_filleul: row.get(48)?,
        filleul_titre: row.get(49)?,
        filleul_qualification: row.get(50)?,
        filleul_volume: row.get(51)?,
        filleul_volume_manager: row.get(52)?,
    })
}
