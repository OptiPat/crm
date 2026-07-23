use super::{
    models::{Contact, NewContact},
    Database,
};
use rusqlite::{params, Result};

/// Présence explicite des champs dans un payload JSON `update_contact`.
/// Les champs absents ne doivent pas écraser la fiche existante (import partiel, etc.).
#[derive(Debug, Clone, Copy, Default)]
pub struct UpdateContactFieldPresence {
    pub birthday: bool,
    pub date_invitation_filleul: bool,
    pub date_inscription_filleul: bool,
    pub filleul_titre: bool,
    pub filleul_qualification: bool,
    pub filleul_volume: bool,
    pub filleul_volume_manager: bool,
}

fn merge_optional_string(
    in_payload: bool,
    incoming: &Option<String>,
    existing: &Option<String>,
) -> Option<String> {
    if in_payload || incoming.is_some() {
        incoming.clone()
    } else {
        existing.clone()
    }
}

fn merge_optional_f64(
    in_payload: bool,
    incoming: Option<f64>,
    existing: Option<f64>,
) -> Option<f64> {
    if in_payload || incoming.is_some() {
        incoming
    } else {
        existing
    }
}

fn parse_optional_date_iso(date_str: &str) -> Option<i64> {
    use chrono::{DateTime, NaiveDate, TimeZone, Utc};
    if let Ok(dt) = DateTime::parse_from_rfc3339(date_str) {
        return Some(dt.timestamp());
    }
    NaiveDate::parse_from_str(date_str.trim(), "%Y-%m-%d")
        .ok()
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|ndt| Utc.from_utc_datetime(&ndt).timestamp())
}

fn parse_optional_date_field(date_str: &Option<String>) -> Option<i64> {
    date_str
        .as_ref()
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| parse_optional_date_iso(s))
}

fn normalize_invitation_type(value: &Option<String>) -> Option<String> {
    match value.as_deref().map(str::trim) {
        Some("JD") => Some("JD".into()),
        Some("PO") => Some("PO".into()),
        _ => None,
    }
}

fn normalize_presence(value: Option<i64>) -> Option<i64> {
    match value {
        Some(0) => Some(0),
        Some(1) => Some(1),
        _ => None,
    }
}

/// R1 → prospect client ; invitation JD/PO → prospect filleul.
fn apply_funnel_side_effects(contact: &mut NewContact) {
    let has_r1 = contact
        .date_r1
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    if has_r1 && (contact.categorie == "AUCUN" || contact.categorie == "SUSPECT_CLIENT") {
        contact.categorie = "PROSPECT_CLIENT".into();
    }

    let has_invitation = contact
        .date_invitation_filleul
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        && normalize_invitation_type(&contact.type_invitation_filleul).is_some();
    if has_invitation {
        if contact.filleul_categorie.as_deref() == Some("SUSPECT_FILLEUL") {
            contact.filleul_categorie = Some("PROSPECT_FILLEUL".into());
        }
    }
}

impl Database {
    fn validate_contact_identity(nom: &str, prenom: &str) -> Result<()> {
        if nom.trim().is_empty() || prenom.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le nom et le prénom sont obligatoires".to_string(),
            ));
        }
        Ok(())
    }

    pub fn get_all_contacts(&self) -> Result<Vec<Contact>> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT} FROM contacts ORDER BY created_at DESC"
        ))?;

        let contacts = stmt.query_map([], map_contact_row)?;

        contacts.collect()
    }

    pub fn get_contacts_by_foyer(&self, foyer_id: i64) -> Result<Vec<Contact>> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT} FROM contacts WHERE foyer_id = ?1 ORDER BY nom, prenom"
        ))?;

        let contacts = stmt.query_map(params![foyer_id], map_contact_row)?;

        contacts.collect()
    }

    pub fn create_contact(&self, new_contact: NewContact) -> Result<Contact> {
        use chrono::DateTime;

        let mut new_contact = new_contact;
        Self::validate_contact_identity(&new_contact.nom, &new_contact.prenom)?;
        apply_funnel_side_effects(&mut new_contact);

        let statut = new_contact.statut_suivi.unwrap_or("ACTIF".to_string());

        // Convertir les dates ISO string en timestamps Unix - CLIENTS
        let date_dernier_contact_timestamp =
            new_contact.date_dernier_contact.and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_prochain_suivi_timestamp = new_contact.date_prochain_suivi.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        // Convertir les dates ISO string en timestamps Unix - FILLEULS
        let date_dernier_contact_filleul_timestamp = new_contact
            .date_dernier_contact_filleul
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_prochain_suivi_filleul_timestamp = new_contact
            .date_prochain_suivi_filleul
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_r1_timestamp = parse_optional_date_field(&new_contact.date_r1);
        let date_invitation_filleul_timestamp =
            parse_optional_date_field(&new_contact.date_invitation_filleul);
        let date_inscription_filleul_timestamp =
            parse_optional_date_field(&new_contact.date_inscription_filleul);
        let type_invitation_filleul = normalize_invitation_type(&new_contact.type_invitation_filleul);
        let presence_invitation_filleul =
            normalize_presence(new_contact.presence_invitation_filleul);

        let date_naissance_timestamp = new_contact
            .date_naissance
            .as_ref()
            .and_then(|date_str| parse_optional_date_iso(date_str));

        let registre = super::contact_row::normalize_contact_registre(new_contact.registre.as_deref());

        self.conn.execute(
            "INSERT INTO contacts (
                famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                adresse, code_postal, ville, pays, date_naissance, lieu_naissance, profession, situation_familiale,
                regime_matrimonial, revenus_annuels, charges_emprunts, objectifs_patrimoniaux,
                source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                date_dernier_contact_filleul, date_prochain_suivi_filleul,
                date_r1, type_invitation_filleul, date_invitation_filleul, date_inscription_filleul,
                presence_invitation_filleul,
                filleul_titre, filleul_qualification, filleul_volume, filleul_volume_manager,
                statut_suivi, registre, notes, epargne_precaution_souhaitee, statut_occupation_logement
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?42, ?43, ?44, ?45)",
            params![
                new_contact.famille_id,
                new_contact.foyer_id,
                new_contact.role_foyer,
                new_contact.role_famille,
                new_contact.categorie,
                new_contact.filleul_categorie,
                new_contact.parrain_id,
                new_contact.prescripteur_id,
                new_contact.civilite,
                new_contact.nom,
                new_contact.prenom,
                new_contact.email,
                new_contact.telephone,
                new_contact.adresse,
                new_contact.code_postal,
                new_contact.ville,
                new_contact.pays,
                date_naissance_timestamp,
                new_contact.lieu_naissance,
                new_contact.profession,
                new_contact.situation_familiale,
                new_contact.regime_matrimonial,
                new_contact.revenus_annuels,
                new_contact.charges_emprunts,
                new_contact.objectifs_patrimoniaux,
                new_contact.source_lead,
                new_contact.profil_risque_sri,
                date_dernier_contact_timestamp,
                date_prochain_suivi_timestamp,
                date_dernier_contact_filleul_timestamp,
                date_prochain_suivi_filleul_timestamp,
                date_r1_timestamp,
                type_invitation_filleul,
                date_invitation_filleul_timestamp,
                date_inscription_filleul_timestamp,
                presence_invitation_filleul,
                new_contact.filleul_titre,
                new_contact.filleul_qualification,
                new_contact.filleul_volume,
                new_contact.filleul_volume_manager,
                statut,
                registre,
                new_contact.notes,
                new_contact.epargne_precaution_souhaitee,
                new_contact.statut_occupation_logement,
            ],
        )?;

        let id = self.conn.last_insert_rowid();

        // Récupérer le contact créé
        self.get_contact_by_id(id)
    }

    pub fn create_contacts_bulk(&self, new_contacts: Vec<NewContact>) -> Result<Vec<Contact>> {
        let mut out = Vec::with_capacity(new_contacts.len());
        for nc in new_contacts {
            out.push(self.create_contact(nc)?);
        }
        Ok(out)
    }

    pub fn get_contact_by_id(&self, id: i64) -> Result<Contact> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        self.conn.query_row(
            &format!("SELECT {CONTACT_SELECT} FROM contacts WHERE id = ?1"),
            params![id],
            map_contact_row,
        )
    }

    pub fn delete_contact(&self, id: i64) -> Result<()> {
        // 1. Récupérer le foyer_id du contact avant suppression
        let foyer_id: Option<i64> = self
            .conn
            .query_row(
                "SELECT foyer_id FROM contacts WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .ok();

        // 2. Supprimer les investissements liés directement au contact
        self.conn.execute(
            "DELETE FROM investissements WHERE contact_id = ?1",
            params![id],
        )?;

        // 3. 🔥 Nettoyer les références prescripteur_id (mettre à NULL)
        self.conn.execute(
            "UPDATE contacts SET prescripteur_id = NULL WHERE prescripteur_id = ?1",
            params![id],
        )?;

        // 4. 🔥 Nettoyer les références parrain_id (mettre à NULL)
        self.conn.execute(
            "UPDATE contacts SET parrain_id = NULL WHERE parrain_id = ?1",
            params![id],
        )?;

        // 5. Supprimer le contact
        self.conn
            .execute("DELETE FROM contacts WHERE id = ?1", params![id])?;

        // 6. Si le contact avait un foyer, vérifier s'il reste des membres
        if let Some(fid) = foyer_id {
            let remaining_members: i64 = self
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM contacts WHERE foyer_id = ?1",
                    params![fid],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            // Si plus aucun membre, supprimer le foyer (et ses investissements)
            if remaining_members == 0 {
                self.delete_foyer(fid)?;
            }
        }

        Ok(())
    }

    pub fn find_contact_by_email(&self, email: &str) -> Result<Option<Contact>> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        match self.conn.query_row(
            &format!("SELECT {CONTACT_SELECT} FROM contacts WHERE email = ?1"),
            params![email],
            map_contact_row,
        ) {
            Ok(contact) => Ok(Some(contact)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn delete_all_contacts(&self) -> Result<usize> {
        // 1. Supprimer tous les investissements (liés aux contacts ET aux foyers)
        self.conn.execute("DELETE FROM investissements", [])?;

        // 2. Supprimer tous les foyers
        self.conn.execute("DELETE FROM foyers", [])?;

        // 3. Supprimer tous les contacts
        let count = self.conn.execute("DELETE FROM contacts", [])?;
        Ok(count)
    }

    /// 🔥 Nettoyer les investissements orphelins (sans contact ni foyer valide)
    pub fn cleanup_orphaned_investments(&self) -> Result<usize> {
        // Supprimer les investissements dont le contact_id n'existe plus
        let deleted_contact = self.conn.execute(
            "DELETE FROM investissements WHERE contact_id IS NOT NULL AND contact_id NOT IN (SELECT id FROM contacts)",
            []
        )?;

        // Supprimer les investissements dont le foyer_id n'existe plus
        let deleted_foyer = self.conn.execute(
            "DELETE FROM investissements WHERE foyer_id IS NOT NULL AND foyer_id NOT IN (SELECT id FROM foyers)",
            []
        )?;

        println!("🧹 Nettoyage: {} investissements contact orphelins, {} investissements foyer orphelins supprimés", 
            deleted_contact, deleted_foyer);

        Ok(deleted_contact + deleted_foyer)
    }

    /// 🔥 Nettoyer les foyers orphelins (sans membres)
    pub fn cleanup_orphaned_foyers(&self) -> Result<usize> {
        // D'abord supprimer les investissements liés à ces foyers orphelins
        self.conn.execute(
            "DELETE FROM investissements WHERE foyer_id IN (
                SELECT f.id FROM foyers f 
                WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.foyer_id = f.id)
            )",
            [],
        )?;

        // Puis supprimer les foyers sans membres
        let deleted = self.conn.execute(
            "DELETE FROM foyers WHERE id NOT IN (SELECT DISTINCT foyer_id FROM contacts WHERE foyer_id IS NOT NULL)",
            []
        )?;

        println!("🧹 Nettoyage: {} foyers orphelins supprimés", deleted);

        Ok(deleted)
    }

    /// 🔥 Nettoyage complet des données orphelines
    pub fn cleanup_all_orphaned_data(&self) -> Result<(usize, usize)> {
        let foyers = self.cleanup_orphaned_foyers()?;
        let investments = self.cleanup_orphaned_investments()?;
        Ok((foyers, investments))
    }

pub fn update_contact(
        &self,
        id: i64,
        contact: &NewContact,
        field_presence: UpdateContactFieldPresence,
    ) -> Result<Contact> {
        use chrono::DateTime;

        let mut contact = contact.clone();
        Self::validate_contact_identity(&contact.nom, &contact.prenom)?;
        apply_funnel_side_effects(&mut contact);

        // Convertir les dates ISO string en timestamps Unix - CLIENTS
        let date_dernier_contact_timestamp =
            contact.date_dernier_contact.as_ref().and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_prochain_suivi_timestamp =
            contact.date_prochain_suivi.as_ref().and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        // Convertir les dates ISO string en timestamps Unix - FILLEULS
        let date_dernier_contact_filleul_timestamp = contact
            .date_dernier_contact_filleul
            .as_ref()
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_prochain_suivi_filleul_timestamp = contact
            .date_prochain_suivi_filleul
            .as_ref()
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_r1_timestamp = parse_optional_date_field(&contact.date_r1);
        let type_invitation_filleul = normalize_invitation_type(&contact.type_invitation_filleul);
        let presence_invitation_filleul =
            normalize_presence(contact.presence_invitation_filleul);

        // 🔥 statut_suivi est NOT NULL, donc on met une valeur par défaut
        let statut_suivi = contact
            .statut_suivi
            .clone()
            .unwrap_or_else(|| "ACTIF".to_string());

        let existing = self.get_contact_by_id(id)?;
        let date_invitation_filleul_timestamp = if field_presence.date_invitation_filleul {
            parse_optional_date_field(&contact.date_invitation_filleul)
        } else {
            existing.date_invitation_filleul
        };
        let date_inscription_filleul_timestamp = if field_presence.date_inscription_filleul {
            parse_optional_date_field(&contact.date_inscription_filleul)
        } else {
            existing.date_inscription_filleul
        };
        let date_naissance_timestamp = if field_presence.birthday {
            match contact.date_naissance.as_deref() {
                None | Some("") => None,
                Some(date_str) => parse_optional_date_iso(date_str),
            }
        } else {
            existing.date_naissance
        };

        let filleul_titre = merge_optional_string(
            field_presence.filleul_titre,
            &contact.filleul_titre,
            &existing.filleul_titre,
        );
        let filleul_qualification = merge_optional_string(
            field_presence.filleul_qualification,
            &contact.filleul_qualification,
            &existing.filleul_qualification,
        );
        let filleul_volume = merge_optional_f64(
            field_presence.filleul_volume,
            contact.filleul_volume,
            existing.filleul_volume,
        );
        let filleul_volume_manager = merge_optional_f64(
            field_presence.filleul_volume_manager,
            contact.filleul_volume_manager,
            existing.filleul_volume_manager,
        );

        self.conn.execute(
            "UPDATE contacts SET 
                famille_id = ?1,
                foyer_id = ?2,
                categorie = ?3,
                filleul_categorie = ?4,
                parrain_id = ?5,
                prescripteur_id = ?6,
                civilite = ?7,
                nom = ?8,
                prenom = ?9,
                email = ?10,
                telephone = ?11,
                adresse = ?12,
                code_postal = ?13,
                ville = ?14,
                pays = ?15,
                date_naissance = ?16,
                lieu_naissance = ?17,
                profession = ?18,
                situation_familiale = ?19,
                regime_matrimonial = ?20,
                revenus_annuels = ?21,
                charges_emprunts = ?22,
                objectifs_patrimoniaux = ?23,
                source_lead = ?24,
                profil_risque_sri = ?25,
                date_dernier_contact = ?26,
                date_prochain_suivi = ?27,
                date_dernier_contact_filleul = ?28,
                date_prochain_suivi_filleul = ?29,
                date_r1 = ?30,
                type_invitation_filleul = ?31,
                date_invitation_filleul = ?32,
                date_inscription_filleul = ?33,
                presence_invitation_filleul = ?34,
                filleul_titre = ?35,
                filleul_qualification = ?36,
                filleul_volume = ?37,
                filleul_volume_manager = ?38,
                statut_suivi = ?39,
                registre = ?40,
                notes = ?41,
                role_foyer = ?42,
                role_famille = ?43,
                famille_regroupement_exclu = ?44,
                epargne_precaution_souhaitee = ?45,
                statut_occupation_logement = ?46,
                updated_at = unixepoch()
            WHERE id = ?47",
            params![
                &contact.famille_id,
                &contact.foyer_id,
                &contact.categorie,
                &contact.filleul_categorie,
                &contact.parrain_id,
                &contact.prescripteur_id,
                &contact.civilite,
                &contact.nom,
                &contact.prenom,
                &contact.email,
                &contact.telephone,
                &contact.adresse,
                &contact.code_postal,
                &contact.ville,
                &contact.pays,
                date_naissance_timestamp,
                &contact.lieu_naissance,
                &contact.profession,
                &contact.situation_familiale,
                &contact.regime_matrimonial,
                &contact.revenus_annuels,
                &contact.charges_emprunts,
                &contact.objectifs_patrimoniaux,
                &contact.source_lead,
                &contact.profil_risque_sri,
                date_dernier_contact_timestamp,
                date_prochain_suivi_timestamp,
                date_dernier_contact_filleul_timestamp,
                date_prochain_suivi_filleul_timestamp,
                date_r1_timestamp,
                type_invitation_filleul,
                date_invitation_filleul_timestamp,
                date_inscription_filleul_timestamp,
                presence_invitation_filleul,
                &filleul_titre,
                &filleul_qualification,
                &filleul_volume,
                &filleul_volume_manager,
                &statut_suivi,
                super::contact_row::normalize_contact_registre(contact.registre.as_deref()),
                &contact.notes,
                &contact.role_foyer,
                &contact.role_famille,
                if contact.famille_regroupement_exclu.unwrap_or(false) {
                    1i64
                } else {
                    0i64
                },
                &contact.epargne_precaution_souhaitee,
                &contact.statut_occupation_logement,
                id
            ],
        )?;

        self.auto_close_obsolete_suivi_alertes_for_contact(id)?;
        self.get_contact_by_id(id)
    }

    /// Met à jour uniquement la fiscalité d'un contact (TMI, parts, RBG, IR net).
    /// Utilisé pour la fiscalité d'une personne seule (sans foyer) et pour
    /// synchroniser chaque membre quand la fiscalité est éditée sur le foyer.
    pub fn update_contact_fiscal(
        &self,
        id: i64,
        tranche_imposition: Option<String>,
        nombre_parts_fiscales: Option<f64>,
        revenu_fiscal_reference: Option<f64>,
        ir_net_a_payer: Option<f64>,
    ) -> Result<Contact> {
        self.conn.execute(
            "UPDATE contacts SET
                tranche_imposition = ?1,
                nombre_parts_fiscales = ?2,
                revenu_fiscal_reference = ?3,
                ir_net_a_payer = ?4,
                updated_at = unixepoch()
            WHERE id = ?5",
            params![
                tranche_imposition,
                nombre_parts_fiscales,
                revenu_fiscal_reference,
                ir_net_a_payer,
                id
            ],
        )?;
        self.get_contact_by_id(id)
    }

    pub fn set_google_contact_link(&self, contact_id: i64, resource_name: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE contacts SET google_contact_resource_name = ?1, google_synced_at = unixepoch(), updated_at = unixepoch() WHERE id = ?2",
            params![resource_name, contact_id],
        )?;
        Ok(())
    }

    pub fn enrich_contact_email_if_empty(&self, contact_id: i64, email: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE contacts SET email = ?1, updated_at = unixepoch() WHERE id = ?2 AND (email IS NULL OR trim(email) = '')",
            params![email.trim(), contact_id],
        )?;
        Ok(())
    }

    pub fn enrich_contact_phone_if_empty(&self, contact_id: i64, telephone: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE contacts SET telephone = ?1, updated_at = unixepoch() WHERE id = ?2 AND (telephone IS NULL OR trim(telephone) = '')",
            params![telephone.trim(), contact_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::Database;
    use super::UpdateContactFieldPresence;
    use rusqlite::params;

    fn insert_contact(db: &Database, nom: &str) -> i64 {
        db.get_connection()
            .execute(
                "INSERT INTO contacts (categorie, nom, prenom, statut_suivi) VALUES ('CLIENT', ?1, 'Jean', 'ACTIF')",
                params![nom],
            )
            .unwrap();
        db.get_connection().last_insert_rowid()
    }

    fn sample_contact(nom: &str, prenom: &str) -> crate::database::models::NewContact {
        crate::database::models::NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            statut_suivi: Some("ACTIF".into()),
            ..Default::default()
        }
    }

    #[test]
    fn update_contact_preserves_birthday_when_not_in_payload() {
        use crate::database::models::NewContact;

        let db = Database::open_in_memory_for_tests().unwrap();
        let created = db
            .create_contact(NewContact {
                date_naissance: Some("1990-07-01T00:00:00.000Z".into()),
                ..sample_contact("Dupont", "Jean")
            })
            .unwrap();
        let id = created.id.unwrap();
        let birthday = created.date_naissance;

        db.update_contact(
            id,
            &NewContact {
                email: Some("jean@example.com".into()),
                ..sample_contact("Dupont", "Jean")
            },
            UpdateContactFieldPresence::default(),
        )
        .unwrap();

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert_eq!(reloaded.date_naissance, birthday);
        assert_eq!(reloaded.email.as_deref(), Some("jean@example.com"));
    }

    #[test]
    fn update_contact_clears_birthday_when_empty_string_in_payload() {
        use crate::database::models::NewContact;

        let db = Database::open_in_memory_for_tests().unwrap();
        let created = db
            .create_contact(NewContact {
                date_naissance: Some("1990-07-01T00:00:00.000Z".into()),
                ..sample_contact("Martin", "Paul")
            })
            .unwrap();
        let id = created.id.unwrap();

        db.update_contact(
            id,
            &NewContact {
                date_naissance: Some("".into()),
                ..sample_contact("Martin", "Paul")
            },
            UpdateContactFieldPresence {
                birthday: true,
                ..Default::default()
            },
        )
        .unwrap();

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert_eq!(reloaded.date_naissance, None);
    }

    #[test]
    fn update_contact_fiscal_persists_and_is_isolated() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let id = insert_contact(&db, "Dupont");

        let updated = db
            .update_contact_fiscal(id, Some("30 %".into()), Some(2.0), Some(50_000.0), Some(1_200.0))
            .unwrap();
        assert_eq!(updated.tranche_imposition.as_deref(), Some("30 %"));
        assert_eq!(updated.nombre_parts_fiscales, Some(2.0));
        assert_eq!(updated.revenu_fiscal_reference, Some(50_000.0));
        assert_eq!(updated.ir_net_a_payer, Some(1_200.0));

        // Relecture indépendante
        let reread = db.get_contact_by_id(id).unwrap();
        assert_eq!(reread.tranche_imposition.as_deref(), Some("30 %"));

        // Effacement possible (None remet à NULL)
        let cleared = db.update_contact_fiscal(id, None, None, None, None).unwrap();
        assert_eq!(cleared.tranche_imposition, None);
        assert_eq!(cleared.nombre_parts_fiscales, None);
    }

    #[test]
    fn update_contact_preserves_filleul_organisation_when_not_in_payload() {
        use crate::database::models::NewContact;

        let db = Database::open_in_memory_for_tests().unwrap();
        let created = db
            .create_contact(NewContact {
                filleul_titre: Some("SENIOR".into()),
                filleul_qualification: Some("QUALIFIE".into()),
                filleul_volume: Some(120_000.0),
                filleul_volume_manager: Some(450_000.0),
                ..sample_contact("Dupont", "Jean")
            })
            .unwrap();
        let id = created.id.unwrap();

        db.update_contact(
            id,
            &NewContact {
                email: Some("jean@example.com".into()),
                ..sample_contact("Dupont", "Jean")
            },
            UpdateContactFieldPresence::default(),
        )
        .unwrap();

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert_eq!(reloaded.email.as_deref(), Some("jean@example.com"));
        assert_eq!(reloaded.filleul_titre.as_deref(), Some("SENIOR"));
        assert_eq!(reloaded.filleul_qualification.as_deref(), Some("QUALIFIE"));
        assert_eq!(reloaded.filleul_volume, Some(120_000.0));
        assert_eq!(reloaded.filleul_volume_manager, Some(450_000.0));
    }

    #[test]
    fn update_contact_preserves_filleul_network_dates_when_not_in_payload() {
        use crate::database::models::NewContact;

        let db = Database::open_in_memory_for_tests().unwrap();
        let created = db
            .create_contact(NewContact {
                date_invitation_filleul: Some("2024-01-15T00:00:00Z".into()),
                date_inscription_filleul: Some("2024-02-01T00:00:00Z".into()),
                filleul_categorie: Some("FILLEUL".into()),
                ..sample_contact("Dupont", "Jean")
            })
            .unwrap();
        let id = created.id.unwrap();

        db.update_contact(
            id,
            &NewContact {
                email: Some("jean@example.com".into()),
                ..sample_contact("Dupont", "Jean")
            },
            UpdateContactFieldPresence::default(),
        )
        .unwrap();

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert_eq!(reloaded.email.as_deref(), Some("jean@example.com"));
        assert!(reloaded.date_invitation_filleul.is_some());
        assert!(reloaded.date_inscription_filleul.is_some());
    }

    #[test]
    fn update_contact_clears_filleul_organisation_when_null_in_payload() {
        use crate::database::models::NewContact;

        let db = Database::open_in_memory_for_tests().unwrap();
        let created = db
            .create_contact(NewContact {
                filleul_titre: Some("SENIOR".into()),
                filleul_qualification: Some("QUALIFIE".into()),
                filleul_volume: Some(120_000.0),
                filleul_volume_manager: Some(450_000.0),
                ..sample_contact("Martin", "Paul")
            })
            .unwrap();
        let id = created.id.unwrap();

        db.update_contact(
            id,
            &NewContact {
                filleul_titre: None,
                filleul_qualification: None,
                filleul_volume: None,
                filleul_volume_manager: None,
                ..sample_contact("Martin", "Paul")
            },
            UpdateContactFieldPresence {
                filleul_titre: true,
                filleul_qualification: true,
                filleul_volume: true,
                filleul_volume_manager: true,
                ..Default::default()
            },
        )
        .unwrap();

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert_eq!(reloaded.filleul_titre, None);
        assert_eq!(reloaded.filleul_qualification, None);
        assert_eq!(reloaded.filleul_volume, None);
        assert_eq!(reloaded.filleul_volume_manager, None);
    }
}
