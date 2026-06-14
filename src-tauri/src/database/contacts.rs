use super::{
    models::{Contact, NewContact},
    Database,
};
use rusqlite::{params, Result};

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

        Self::validate_contact_identity(&new_contact.nom, &new_contact.prenom)?;

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

        let date_naissance_timestamp = new_contact.date_naissance.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        let registre = super::contact_row::normalize_contact_registre(new_contact.registre.as_deref());

        self.conn.execute(
            "INSERT INTO contacts (
                famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                adresse, code_postal, ville, date_naissance, lieu_naissance, profession, situation_familiale,
                source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                date_dernier_contact_filleul, date_prochain_suivi_filleul,
                statut_suivi, registre, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29)",
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
                date_naissance_timestamp,
                new_contact.lieu_naissance,
                new_contact.profession,
                new_contact.situation_familiale,
                new_contact.source_lead,
                new_contact.profil_risque_sri,
                date_dernier_contact_timestamp,
                date_prochain_suivi_timestamp,
                date_dernier_contact_filleul_timestamp,
                date_prochain_suivi_filleul_timestamp,
                statut,
                registre,
                new_contact.notes,
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

    pub fn update_contact(&self, id: i64, contact: &NewContact) -> Result<Contact> {
        use chrono::DateTime;

        Self::validate_contact_identity(&contact.nom, &contact.prenom)?;

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

        // 🔥 statut_suivi est NOT NULL, donc on met une valeur par défaut
        let statut_suivi = contact
            .statut_suivi
            .clone()
            .unwrap_or_else(|| "ACTIF".to_string());

        let date_naissance_timestamp = contact.date_naissance.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

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
                date_naissance = ?15,
                lieu_naissance = ?16,
                profession = ?17,
                situation_familiale = ?18,
                source_lead = ?19,
                profil_risque_sri = ?20,
                date_dernier_contact = ?21,
                date_prochain_suivi = ?22,
                date_dernier_contact_filleul = ?23,
                date_prochain_suivi_filleul = ?24,
                statut_suivi = ?25,
                registre = ?26,
                notes = ?27,
                role_foyer = ?28,
                role_famille = ?29,
                famille_regroupement_exclu = ?30,
                updated_at = unixepoch()
            WHERE id = ?31",
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
                date_naissance_timestamp,
                &contact.lieu_naissance,
                &contact.profession,
                &contact.situation_familiale,
                &contact.source_lead,
                &contact.profil_risque_sri,
                date_dernier_contact_timestamp,
                date_prochain_suivi_timestamp,
                date_dernier_contact_filleul_timestamp,
                date_prochain_suivi_filleul_timestamp,
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
                id
            ],
        )?;

        self.auto_close_obsolete_suivi_alertes_for_contact(id)?;
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
