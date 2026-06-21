//! Investissements, valorisations et alertes de fin de démembrement.
//! Extrait de `operations.rs` (découpage par domaine). Comportement inchangé.

use rusqlite::{params, OptionalExtension, Result};

const INVESTISSEMENT_SELECT_COLS: &str = "id, contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
    numero_contrat,
    montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
    mensualite_credit, credit_crd, loyer_mensuel,
    versement_programme, montant_versement_programme, frequence_versement,
    reinvestissement_dividendes, notes, origine, created_at, updated_at";

fn normalize_numero_contrat(value: Option<String>) -> Option<String> {
    value.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    })
}

use super::operations::{investissement_encours_select_cols, investissement_encours_select_cols_i};

impl super::Database {
    fn map_investissement_row(
        row: &rusqlite::Row<'_>,
    ) -> rusqlite::Result<super::models::Investissement> {
        Ok(super::models::Investissement {
            id: row.get(0)?,
            contact_id: row.get(1)?,
            foyer_id: row.get(2)?,
            type_produit: row.get(3)?,
            partenaire_id: row.get(4)?,
            nom_produit: row.get(5)?,
            numero_contrat: row.get(6)?,
            montant_initial: row.get(7)?,
            date_souscription: row.get(8)?,
            date_fin_demembrement: row.get(9)?,
            date_fin_pret: row.get(10)?,
            mensualite_credit: row.get(11)?,
            credit_crd: row.get(12)?,
            loyer_mensuel: row.get(13)?,
            versement_programme: row.get::<_, i64>(14)? != 0,
            montant_versement_programme: row.get(15)?,
            frequence_versement: row.get(16)?,
            reinvestissement_dividendes: row.get::<_, i64>(17)? != 0,
            notes: row.get(18)?,
            origine: row
                .get::<_, String>(19)
                .unwrap_or_else(|_| "MON_CONSEIL".to_string()),
            created_at: row.get(20)?,
            updated_at: row.get(21)?,
            encours_actuel: row.get(22)?,
            encours_date: row.get(23)?,
            montant_investi_total: row.get(24)?,
            stellium_versements_nets_centimes: row.get(25)?,
            stellium_perf_euro_centimes: row.get(26)?,
        })
    }

    pub fn get_all_investissements(&self) -> Result<Vec<super::models::Investissement>> {
        let sql = format!(
            "SELECT {INVESTISSEMENT_SELECT_COLS}, {}
             FROM investissements 
             ORDER BY date_souscription DESC",
            investissement_encours_select_cols()
        );
        let mut stmt = self.conn.prepare(&sql)?;

        let investissements = stmt.query_map([], Self::map_investissement_row)?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    pub fn get_investissements_by_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<super::models::Investissement>> {
        let sql = format!(
            "SELECT {INVESTISSEMENT_SELECT_COLS}, {}
             FROM investissements 
             WHERE contact_id = ?1
             ORDER BY date_souscription DESC",
            investissement_encours_select_cols()
        );
        let mut stmt = self.conn.prepare(&sql)?;

        let investissements = stmt.query_map(params![contact_id], Self::map_investissement_row)?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    pub fn get_investissements_by_foyer(
        &self,
        foyer_id: i64,
    ) -> Result<Vec<super::models::Investissement>> {
        let sql = format!(
            "SELECT {INVESTISSEMENT_SELECT_COLS}, {}
             FROM investissements 
             WHERE foyer_id = ?1
             ORDER BY date_souscription DESC",
            investissement_encours_select_cols()
        );
        let mut stmt = self.conn.prepare(&sql)?;

        let investissements = stmt.query_map(params![foyer_id], Self::map_investissement_row)?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    pub fn get_investissements_by_foyer_contacts(
        &self,
        foyer_id: i64,
    ) -> Result<Vec<super::models::Investissement>> {
        let sql = format!(
            "SELECT {INVESTISSEMENT_SELECT_COLS}, {}
             FROM investissements
             WHERE contact_id IN (SELECT id FROM contacts WHERE foyer_id = ?1)
             ORDER BY date_souscription DESC",
            investissement_encours_select_cols()
        );
        let mut stmt = self.conn.prepare(&sql)?;

        let investissements = stmt.query_map(params![foyer_id], Self::map_investissement_row)?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    pub fn get_investissements_with_details(
        &self,
    ) -> Result<Vec<super::models::InvestissementWithDetails>> {
        let mut stmt = self.conn.prepare(
            &format!(
                "SELECT i.id, i.contact_id,
                    COALESCE(c.nom, '') as contact_nom,
                    COALESCE(c.prenom, CASE WHEN i.contact_id IS NULL AND f.nom IS NOT NULL THEN 'Commun' ELSE '' END) as contact_prenom,
                    i.foyer_id, f.nom as foyer_nom,
                    i.type_produit, i.partenaire_id, p.raison_sociale as partenaire_nom,
                    i.nom_produit, i.numero_contrat, i.montant_initial, i.date_souscription, i.date_fin_demembrement, i.date_fin_pret,
                    i.mensualite_credit, i.credit_crd, i.loyer_mensuel,
                    i.versement_programme, i.montant_versement_programme, i.frequence_versement,
                    i.reinvestissement_dividendes, i.notes, i.origine, i.created_at, i.updated_at,
                    {}
             FROM investissements i
             LEFT JOIN contacts c ON i.contact_id = c.id
             LEFT JOIN foyers f ON i.foyer_id = f.id
             LEFT JOIN partenaires p ON i.partenaire_id = p.id
             WHERE i.contact_id IS NOT NULL OR i.foyer_id IS NOT NULL
             ORDER BY i.date_souscription DESC",
                investissement_encours_select_cols_i()
            ),
        )?;

        let investissements = stmt.query_map([], |row| {
            let contact_nom: String = row.get(2)?;
            let contact_prenom: String = row.get(3)?;
            let foyer_nom: Option<String> = row.get(5)?;
            let display_nom = if contact_nom.trim().is_empty() && foyer_nom.is_some() {
                foyer_nom.clone().unwrap_or_default()
            } else {
                contact_nom
            };
            let display_prenom = if contact_prenom.trim().is_empty() && foyer_nom.is_some() {
                "Foyer".to_string()
            } else {
                contact_prenom
            };
            Ok(super::models::InvestissementWithDetails {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: display_nom,
                contact_prenom: display_prenom,
                foyer_id: row.get(4)?,
                foyer_nom: row.get(5)?,
                type_produit: row.get(6)?,
                partenaire_id: row.get(7)?,
                partenaire_nom: row.get(8)?,
                nom_produit: row.get(9)?,
                numero_contrat: row.get(10)?,
                montant_initial: row.get(11)?,
                date_souscription: row.get(12)?,
                date_fin_demembrement: row.get(13)?,
                date_fin_pret: row.get(14)?,
                mensualite_credit: row.get(15)?,
                credit_crd: row.get(16)?,
                loyer_mensuel: row.get(17)?,
                versement_programme: row.get::<_, i64>(18)? != 0,
                montant_versement_programme: row.get(19)?,
                frequence_versement: row.get(20)?,
                reinvestissement_dividendes: row.get::<_, i64>(21)? != 0,
                notes: row.get(22)?,
                origine: row
                    .get::<_, String>(23)
                    .unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(24)?,
                updated_at: row.get(25)?,
                encours_actuel: row.get(26)?,
                encours_date: row.get(27)?,
                montant_investi_total: row.get(28)?,
                stellium_versements_nets_centimes: row.get(29)?,
                stellium_perf_euro_centimes: row.get(30)?,
            })
        })?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    /// Aligne `date_dernier_contact` sur la dernière `date_souscription` si vide,
    /// ou si la date actuelle correspond déjà à une souscription (pas une saisie manuelle).
    fn sync_dernier_contact_from_investissements(&self, contact_id: i64) -> Result<()> {
        let latest_souscription: Option<i64> = self.conn.query_row(
            "SELECT MAX(date_souscription) FROM investissements
             WHERE contact_id = ?1 AND date_souscription IS NOT NULL",
            params![contact_id],
            |row| row.get(0),
        )?;

        let Some(latest) = latest_souscription else {
            return Ok(());
        };

        let date_dernier: Option<i64> = self.conn.query_row(
            "SELECT date_dernier_contact FROM contacts WHERE id = ?1",
            params![contact_id],
            |row| row.get(0),
        )?;

        let should_update = match date_dernier {
            None => true,
            Some(cur) if cur >= latest => false,
            Some(cur) => {
                let matches_subscription: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM investissements
                     WHERE contact_id = ?1 AND date_souscription = ?2",
                    params![contact_id, cur],
                    |row| row.get(0),
                )?;
                matches_subscription > 0
            }
        };

        if should_update {
            self.conn.execute(
                "UPDATE contacts SET date_dernier_contact = ?1, updated_at = unixepoch() WHERE id = ?2",
                params![latest, contact_id],
            )?;
        }
        self.auto_close_obsolete_suivi_alertes_for_contact(contact_id)?;
        Ok(())
    }

    /// Suspect ou prospect client + investissement « avec moi » → promotion CLIENT.
    fn maybe_promote_contact_to_client_from_mon_conseil_investissement(
        &self,
        contact_id: i64,
        origine: &str,
    ) -> Result<()> {
        if origine != "MON_CONSEIL" {
            return Ok(());
        }
        let contact = self.get_contact_by_id(contact_id)?;
        if contact.categorie != "SUSPECT_CLIENT" && contact.categorie != "PROSPECT_CLIENT" {
            return Ok(());
        }
        self.conn.execute(
            "UPDATE contacts SET categorie = 'CLIENT', updated_at = unixepoch() WHERE id = ?1",
            params![contact_id],
        )?;
        self.auto_close_obsolete_suivi_alertes_for_contact(contact_id)?;
        Ok(())
    }

    pub fn create_investissement(
        &self,
        investissement: super::models::NewInvestissement,
    ) -> Result<super::models::Investissement> {
        use chrono::DateTime;

        let versement_programme = if investissement.versement_programme.unwrap_or(false) {
            1
        } else {
            0
        };
        let reinvestissement_dividendes =
            if investissement.reinvestissement_dividendes.unwrap_or(false) {
                1
            } else {
                0
            };

        // Convertir les dates ISO string en timestamps Unix
        let date_souscription_timestamp = investissement.date_souscription.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        let date_fin_demembrement_timestamp =
            investissement.date_fin_demembrement.and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_fin_pret_timestamp = investissement.date_fin_pret.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        // Origine par défaut : MON_CONSEIL
        let origine = investissement
            .origine
            .unwrap_or_else(|| "MON_CONSEIL".to_string());
        let numero_contrat = normalize_numero_contrat(investissement.numero_contrat);

        self.conn.execute(
            "INSERT INTO investissements (contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                                         numero_contrat,
                                         montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
                                         mensualite_credit, credit_crd, loyer_mensuel,
                                         versement_programme, montant_versement_programme, frequence_versement,
                                         reinvestissement_dividendes, notes, origine) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![
                &investissement.contact_id,
                &investissement.foyer_id,
                &investissement.type_produit,
                &investissement.partenaire_id,
                &investissement.nom_produit,
                &numero_contrat,
                &investissement.montant_initial,
                date_souscription_timestamp,
                date_fin_demembrement_timestamp,
                date_fin_pret_timestamp,
                &investissement.mensualite_credit,
                &investissement.credit_crd,
                &investissement.loyer_mensuel,
                versement_programme,
                &investissement.montant_versement_programme,
                &investissement.frequence_versement,
                reinvestissement_dividendes,
                &investissement.notes,
                &origine,
            ],
        )?;

        if let Some(contact_id) = investissement.contact_id {
            self.sync_dernier_contact_from_investissements(contact_id)?;
            self.maybe_promote_contact_to_client_from_mon_conseil_investissement(
                contact_id,
                &origine,
            )?;
        }

        let id = self.conn.last_insert_rowid();
        self.get_investissement_by_id(id)
    }

    pub fn get_investissement_by_id(&self, id: i64) -> Result<super::models::Investissement> {
        let sql = format!(
            "SELECT {INVESTISSEMENT_SELECT_COLS}, {}
             FROM investissements 
             WHERE id = ?1",
            investissement_encours_select_cols()
        );
        self.conn
            .query_row(&sql, params![id], Self::map_investissement_row)
    }

    pub fn update_investissement(
        &self,
        id: i64,
        investissement: &super::models::NewInvestissement,
    ) -> Result<super::models::Investissement> {
        use chrono::DateTime;

        let versement_programme = if investissement.versement_programme.unwrap_or(false) {
            1
        } else {
            0
        };
        let reinvestissement_dividendes =
            if investissement.reinvestissement_dividendes.unwrap_or(false) {
                1
            } else {
                0
            };

        // Convertir les dates ISO string en timestamps Unix
        let date_souscription_timestamp =
            investissement
                .date_souscription
                .as_ref()
                .and_then(|date_str| {
                    DateTime::parse_from_rfc3339(date_str)
                        .ok()
                        .map(|dt| dt.timestamp())
                });

        let date_fin_demembrement_timestamp = investissement
            .date_fin_demembrement
            .as_ref()
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_fin_pret_timestamp = investissement.date_fin_pret.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        let origine = investissement
            .origine
            .clone()
            .or_else(|| self.get_investissement_by_id(id).ok().map(|i| i.origine))
            .unwrap_or_else(|| "MON_CONSEIL".to_string());
        let numero_contrat = match investissement.numero_contrat.as_ref() {
            Some(raw) => normalize_numero_contrat(Some(raw.clone())),
            None => self
                .get_investissement_by_id(id)
                .ok()
                .and_then(|i| i.numero_contrat),
        };

        self.conn.execute(
            "UPDATE investissements SET 
                contact_id = ?1,
                foyer_id = ?2,
                type_produit = ?3,
                partenaire_id = ?4,
                nom_produit = ?5,
                numero_contrat = ?6,
                montant_initial = ?7,
                date_souscription = ?8,
                date_fin_demembrement = ?9,
                date_fin_pret = ?10,
                mensualite_credit = ?11,
                credit_crd = ?12,
                loyer_mensuel = ?13,
                versement_programme = ?14,
                montant_versement_programme = ?15,
                frequence_versement = ?16,
                reinvestissement_dividendes = ?17,
                notes = ?18,
                updated_at = unixepoch()
            WHERE id = ?19",
            params![
                &investissement.contact_id,
                &investissement.foyer_id,
                &investissement.type_produit,
                &investissement.partenaire_id,
                &investissement.nom_produit,
                &numero_contrat,
                &investissement.montant_initial,
                date_souscription_timestamp,
                date_fin_demembrement_timestamp,
                date_fin_pret_timestamp,
                &investissement.mensualite_credit,
                &investissement.credit_crd,
                &investissement.loyer_mensuel,
                versement_programme,
                &investissement.montant_versement_programme,
                &investissement.frequence_versement,
                reinvestissement_dividendes,
                &investissement.notes,
                id
            ],
        )?;

        if let Some(contact_id) = investissement.contact_id {
            self.sync_dernier_contact_from_investissements(contact_id)?;
            self.maybe_promote_contact_to_client_from_mon_conseil_investissement(
                contact_id,
                &origine,
            )?;
        }

        self.get_investissement_by_id(id)
    }

    pub fn delete_investissement(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM investissements WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_valorisations_by_investissement(
        &self,
        investissement_id: i64,
    ) -> Result<Vec<super::models::InvestissementValorisation>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, investissement_id, montant, date_valorisation, notes,
                    stellium_versements_nets_centimes, stellium_perf_euro_centimes, created_at
             FROM investissement_valorisations
             WHERE investissement_id = ?1
             ORDER BY date_valorisation ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![investissement_id], |row| {
            Ok(super::models::InvestissementValorisation {
                id: row.get(0)?,
                investissement_id: row.get(1)?,
                montant: row.get(2)?,
                date_valorisation: row.get(3)?,
                notes: row.get(4)?,
                stellium_versements_nets_centimes: row.get(5)?,
                stellium_perf_euro_centimes: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn get_valorisation_by_id(&self, id: i64) -> Result<super::models::InvestissementValorisation> {
        self.conn.query_row(
            "SELECT id, investissement_id, montant, date_valorisation, notes,
                    stellium_versements_nets_centimes, stellium_perf_euro_centimes, created_at
             FROM investissement_valorisations WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::InvestissementValorisation {
                    id: row.get(0)?,
                    investissement_id: row.get(1)?,
                    montant: row.get(2)?,
                    date_valorisation: row.get(3)?,
                    notes: row.get(4)?,
                    stellium_versements_nets_centimes: row.get(5)?,
                    stellium_perf_euro_centimes: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
    }

    pub fn create_investissement_valorisation(
        &self,
        valorisation: super::models::NewInvestissementValorisation,
    ) -> Result<super::models::InvestissementValorisation> {
        use chrono::{DateTime, Utc};

        let date_ts = valorisation
            .date_valorisation
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            })
            .unwrap_or_else(|| Utc::now().timestamp());

        let existing_id: Option<i64> = self
            .conn
            .query_row(
                "SELECT id FROM investissement_valorisations
                 WHERE investissement_id = ?1
                   AND date(date_valorisation, 'unixepoch') = date(?2, 'unixepoch')
                 LIMIT 1",
                params![valorisation.investissement_id, date_ts],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(id) = existing_id {
            self.conn.execute(
                "UPDATE investissement_valorisations
                 SET montant = ?1, notes = ?2,
                     stellium_versements_nets_centimes = COALESCE(?3, stellium_versements_nets_centimes),
                     stellium_perf_euro_centimes = COALESCE(?4, stellium_perf_euro_centimes)
                 WHERE id = ?5",
                params![
                    valorisation.montant,
                    valorisation.notes,
                    valorisation.stellium_versements_nets_centimes,
                    valorisation.stellium_perf_euro_centimes,
                    id,
                ],
            )?;
            return self.get_valorisation_by_id(id);
        }

        self.conn.execute(
            "INSERT INTO investissement_valorisations (
                investissement_id, montant, date_valorisation, notes,
                stellium_versements_nets_centimes, stellium_perf_euro_centimes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                valorisation.investissement_id,
                valorisation.montant,
                date_ts,
                valorisation.notes,
                valorisation.stellium_versements_nets_centimes,
                valorisation.stellium_perf_euro_centimes,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_valorisation_by_id(id)
    }

    pub fn delete_investissement_valorisation(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM investissement_valorisations WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    fn assert_versement_complementaire_eligible(&self, investissement_id: i64) -> Result<()> {
        let type_produit: String = self.conn.query_row(
            "SELECT type_produit FROM investissements WHERE id = ?1",
            params![investissement_id],
            |row| row.get(0),
        )?;
        if matches!(
            type_produit.as_str(),
            "ASSURANCE_VIE" | "PER" | "CONTRAT_CAPITALISATION"
        ) {
            Ok(())
        } else {
            Err(rusqlite::Error::InvalidParameterName(
                "versement_complementaire_ineligible".into(),
            ))
        }
    }

    pub fn get_versements_by_investissement(
        &self,
        investissement_id: i64,
    ) -> Result<Vec<super::models::InvestissementVersement>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, investissement_id, montant, date_versement, notes, created_at
             FROM investissement_versements
             WHERE investissement_id = ?1
             ORDER BY date_versement ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![investissement_id], |row| {
            Ok(super::models::InvestissementVersement {
                id: row.get(0)?,
                investissement_id: row.get(1)?,
                montant: row.get(2)?,
                date_versement: row.get(3)?,
                notes: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn get_versement_by_id(&self, id: i64) -> Result<super::models::InvestissementVersement> {
        self.conn.query_row(
            "SELECT id, investissement_id, montant, date_versement, notes, created_at
             FROM investissement_versements WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::InvestissementVersement {
                    id: row.get(0)?,
                    investissement_id: row.get(1)?,
                    montant: row.get(2)?,
                    date_versement: row.get(3)?,
                    notes: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
    }

    pub fn create_investissement_versement(
        &self,
        versement: super::models::NewInvestissementVersement,
    ) -> Result<super::models::InvestissementVersement> {
        use chrono::{DateTime, Utc};

        self.assert_versement_complementaire_eligible(versement.investissement_id)?;

        if versement.montant <= 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "versement_montant_invalide".into(),
            ));
        }

        let date_ts = versement
            .date_versement
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            })
            .unwrap_or_else(|| Utc::now().timestamp());

        self.conn.execute(
            "INSERT INTO investissement_versements (investissement_id, montant, date_versement, notes)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                versement.investissement_id,
                versement.montant,
                date_ts,
                versement.notes,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_versement_by_id(id)
    }

    pub fn delete_investissement_versement(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM investissement_versements WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Générer les alertes pour les SCPI en démembrement arrivant à échéance dans les 6 prochains mois
    pub fn check_and_create_demembrement_alerts(&self) -> Result<Vec<super::models::Alerte>> {
        // Timestamp actuel
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Timestamp dans 6 mois (approximatif: 6 * 30 jours)
        let six_months = 6 * 30 * 24 * 60 * 60;
        let six_months_later = now + six_months;

        // Récupérer les SCPI en démembrement qui arrivent à échéance dans les 6 prochains mois
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, nom_produit, date_fin_demembrement
             FROM investissements
             WHERE type_produit = 'SCPI_DEMEMBREMENT'
               AND date_fin_demembrement IS NOT NULL
               AND date_fin_demembrement > ?1
               AND date_fin_demembrement <= ?2",
        )?;

        let investissements = stmt.query_map(params![now, six_months_later], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?;

        let mut created_alerts = Vec::new();

        for inv_result in investissements {
            let (_inv_id, contact_id, foyer_id, nom_produit, date_fin) = inv_result?;

            let contact_id = match contact_id {
                Some(id) => id,
                None => {
                    let Some(fid) = foyer_id else { continue };
                    match self.conn.query_row(
                        "SELECT id FROM contacts WHERE foyer_id = ?1 ORDER BY id LIMIT 1",
                        params![fid],
                        |row| row.get::<_, i64>(0),
                    ) {
                        Ok(id) => id,
                        Err(_) => continue,
                    }
                }
            };

            // Vérifier si une alerte existe déjà pour cet investissement
            let existing: Result<i64> = self.conn.query_row(
                "SELECT COUNT(*) FROM alertes 
                 WHERE contact_id = ?1 
                   AND type_alerte = 'FIN_DEMEMBREMENT'
                   AND message LIKE ?2
                   AND traitee = 0",
                params![contact_id, format!("%{}%", nom_produit)],
                |row| row.get(0),
            );

            // Si aucune alerte n'existe, en créer une
            if existing.unwrap_or(0) == 0 {
                let date_fin_formatted = chrono::DateTime::from_timestamp(date_fin, 0)
                    .map(|dt| dt.format("%d/%m/%Y").to_string())
                    .unwrap_or_else(|| "date inconnue".to_string());

                let message = format!(
                    "Fin de démembrement SCPI \"{}\" prévue le {}",
                    nom_produit, date_fin_formatted
                );

                self.conn.execute(
                    "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee)
                     VALUES (?1, 'FIN_DEMEMBREMENT', ?2, ?3, 0, 0)",
                    params![contact_id, message, date_fin],
                )?;

                let alerte_id = self.conn.last_insert_rowid();

                // Récupérer l'alerte créée
                let alerte = self.conn.query_row(
                    "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
                     FROM alertes WHERE id = ?1",
                    params![alerte_id],
                    |row| {
                        Ok(super::models::Alerte {
                            id: row.get(0)?,
                            contact_id: row.get(1)?,
                            type_alerte: row.get(2)?,
                            message: row.get(3)?,
                            date_alerte: row.get(4)?,
                            lue: row.get::<_, i64>(5)? != 0,
                            traitee: row.get::<_, i64>(6)? != 0,
                            created_at: row.get(7)?,
                        })
                    },
                )?;

                created_alerts.push(alerte);
            }
        }

        Ok(created_alerts)
    }

    pub fn get_nom_produit_suggestions(
        &self,
        type_produit: &str,
        partenaire_id: Option<i64>,
    ) -> Result<Vec<super::models::NomProduitSuggestion>> {
        let mut stmt = self.conn.prepare(
            "SELECT MIN(TRIM(nom_produit)) AS nom_produit, COUNT(*) AS usage_count
             FROM investissements
             WHERE type_produit = ?1
               AND TRIM(nom_produit) != ''
               AND (?2 IS NULL OR partenaire_id = ?2)
             GROUP BY LOWER(TRIM(nom_produit))
             ORDER BY usage_count DESC, nom_produit COLLATE NOCASE ASC
             LIMIT 20",
        )?;

        let rows = stmt.query_map(params![type_produit, partenaire_id], |row| {
            Ok(super::models::NomProduitSuggestion {
                nom_produit: row.get(0)?,
                usage_count: row.get(1)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::super::Database;
    use rusqlite::params;

    fn seed_partenaire(db: &Database, id: i64, raison_sociale: &str) {
        db.get_connection()
            .execute(
                "INSERT INTO partenaires (id, type_partenaire, raison_sociale, created_at, updated_at)
                 VALUES (?1, 'ASSUREUR', ?2, 1, 1)",
                params![id, raison_sociale],
            )
            .unwrap();
    }

    fn insert_investissement(
        db: &Database,
        type_produit: &str,
        partenaire_id: Option<i64>,
        nom_produit: &str,
    ) {
        db.get_connection()
            .execute(
                "INSERT INTO investissements (
                    type_produit, partenaire_id, nom_produit, versement_programme,
                    reinvestissement_dividendes, origine, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, 0, 0, 'MON_CONSEIL', 1, 1)",
                params![type_produit, partenaire_id, nom_produit],
            )
            .unwrap();
    }

    #[test]
    fn nom_produit_suggestions_filters_by_type_and_partenaire() {
        let db = Database::open_in_memory_for_tests().unwrap();
        seed_partenaire(&db, 1, "Partenaire A");
        seed_partenaire(&db, 2, "Partenaire B");
        insert_investissement(&db, "ASSURANCE_VIE", Some(1), "Primovie");
        insert_investissement(&db, "ASSURANCE_VIE", Some(1), "Primovie");
        insert_investissement(&db, "ASSURANCE_VIE", Some(1), "  primovie  ");
        insert_investissement(&db, "ASSURANCE_VIE", Some(2), "Autre contrat");
        insert_investissement(&db, "PER", Some(1), "PER Generali");

        let all_av = db
            .get_nom_produit_suggestions("ASSURANCE_VIE", None)
            .unwrap();
        assert_eq!(all_av.len(), 2);
        assert_eq!(all_av[0].nom_produit, "Primovie");
        assert_eq!(all_av[0].usage_count, 3);

        let partner1 = db
            .get_nom_produit_suggestions("ASSURANCE_VIE", Some(1))
            .unwrap();
        assert_eq!(partner1.len(), 1);
        assert_eq!(partner1[0].usage_count, 3);

        let none = db.get_nom_produit_suggestions("SCPI", None).unwrap();
        assert!(none.is_empty());
    }

    #[test]
    fn update_investissement_preserves_numero_contrat_when_omitted() {
        use super::super::models::NewInvestissement;

        let db = Database::open_in_memory_for_tests().unwrap();
        let contact = db
            .get_connection()
            .execute(
                "INSERT INTO contacts (categorie, nom, prenom, created_at, updated_at)
                 VALUES ('CLIENT', 'DUPONT', 'Jean', 1, 1)",
                [],
            )
            .unwrap();
        let _ = contact;
        let contact_id: i64 = db
            .get_connection()
            .query_row("SELECT id FROM contacts LIMIT 1", [], |r| r.get(0))
            .unwrap();

        let created = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "Contrat test".into(),
                numero_contrat: Some("AV-12345".into()),
                montant_initial: Some(10_000_00),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: None,
            })
            .unwrap();
        let id = created.id;

        db.update_investissement(
            id,
            &NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "SCPI".into(),
                partenaire_id: None,
                nom_produit: "SCPI test".into(),
                numero_contrat: None,
                montant_initial: Some(50_000_00),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: Some("note".into()),
                origine: None,
            },
        )
        .unwrap();

        let updated = db.get_investissement_by_id(id).unwrap();
        assert_eq!(updated.numero_contrat.as_deref(), Some("AV-12345"));
    }

    #[test]
    fn create_valorisation_persists_stellium_snapshot_fields() {
        use super::super::models::{NewInvestissement, NewInvestissementValorisation};

        let db = Database::open_in_memory_for_tests().unwrap();
        db.get_connection()
            .execute(
                "INSERT INTO contacts (categorie, nom, prenom, created_at, updated_at)
                 VALUES ('CLIENT', 'DUPONT', 'Jean', 1, 1)",
                [],
            )
            .unwrap();
        let id = db
            .create_investissement(NewInvestissement {
                contact_id: Some(1),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "Test".into(),
                numero_contrat: Some("123".into()),
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap()
            .id;

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: id,
            montant: 1_050_000,
            date_valorisation: Some("2026-06-19T00:00:00.000Z".into()),
            notes: Some("Import Stellium contrats".into()),
            stellium_versements_nets_centimes: Some(1_000_000),
            stellium_perf_euro_centimes: Some(50_000),
        })
        .unwrap();

        let vals = db.get_valorisations_by_investissement(id).unwrap();
        assert_eq!(vals.len(), 1);
        assert_eq!(vals[0].montant, 1_050_000);
        assert_eq!(vals[0].stellium_versements_nets_centimes, Some(1_000_000));
        assert_eq!(vals[0].stellium_perf_euro_centimes, Some(50_000));

        let inv = db.get_investissement_by_id(id).unwrap();
        assert_eq!(inv.stellium_versements_nets_centimes, Some(1_000_000));
        assert_eq!(inv.stellium_perf_euro_centimes, Some(50_000));
    }

    #[test]
    fn manual_encours_update_preserves_stellium_fields_same_day() {
        use super::super::models::{NewInvestissement, NewInvestissementValorisation};

        let db = Database::open_in_memory_for_tests().unwrap();
        db.get_connection()
            .execute(
                "INSERT INTO contacts (categorie, nom, prenom, created_at, updated_at)
                 VALUES ('CLIENT', 'DUPONT', 'Jean', 1, 1)",
                [],
            )
            .unwrap();
        let id = db
            .create_investissement(NewInvestissement {
                contact_id: Some(1),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "Test".into(),
                numero_contrat: Some("123".into()),
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap()
            .id;

        let iso = "2026-06-19T00:00:00.000Z".to_string();
        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: id,
            montant: 1_050_000,
            date_valorisation: Some(iso.clone()),
            notes: Some("Import Stellium contrats".into()),
            stellium_versements_nets_centimes: Some(1_000_000),
            stellium_perf_euro_centimes: Some(50_000),
        })
        .unwrap();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: id,
            montant: 1_060_000,
            date_valorisation: Some(iso),
            notes: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
        })
        .unwrap();

        let vals = db.get_valorisations_by_investissement(id).unwrap();
        assert_eq!(vals.len(), 1);
        assert_eq!(vals[0].montant, 1_060_000);
        assert_eq!(vals[0].stellium_versements_nets_centimes, Some(1_000_000));
        assert_eq!(vals[0].stellium_perf_euro_centimes, Some(50_000));
    }

    #[test]
    fn latest_stellium_aggregates_ignore_newer_manual_encours_without_stellium() {
        use super::super::models::{NewInvestissement, NewInvestissementValorisation};

        let db = Database::open_in_memory_for_tests().unwrap();
        db.get_connection()
            .execute(
                "INSERT INTO contacts (categorie, nom, prenom, created_at, updated_at)
                 VALUES ('CLIENT', 'DUPONT', 'Jean', 1, 1)",
                [],
            )
            .unwrap();
        let id = db
            .create_investissement(NewInvestissement {
                contact_id: Some(1),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "Test".into(),
                numero_contrat: Some("123".into()),
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap()
            .id;

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: id,
            montant: 1_050_000,
            date_valorisation: Some("2026-06-19T00:00:00.000Z".into()),
            notes: Some("Import Stellium contrats".into()),
            stellium_versements_nets_centimes: Some(1_000_000),
            stellium_perf_euro_centimes: Some(50_000),
        })
        .unwrap();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: id,
            montant: 1_060_000,
            date_valorisation: Some("2026-07-19T00:00:00.000Z".into()),
            notes: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
        })
        .unwrap();

        let inv = db.get_investissement_by_id(id).unwrap();
        assert_eq!(inv.stellium_versements_nets_centimes, Some(1_000_000));
        assert_eq!(inv.stellium_perf_euro_centimes, Some(50_000));
    }
}
