//! Statistiques du tableau de bord.
//!
//! Extrait de `operations.rs` (chantier de découpage par domaine).
//! Comportement inchangé : ces méthodes sont couvertes par les tests d'intégration
//! `dashboard_encours_*`, `get_yearly_activity_stats_*` et `panier_moyen_*`.

use super::operations::EFFECTIVE_ENCOURS_SQL_I;
use rusqlite::{params, Result};

impl super::Database {
    // ========== DASHBOARD STATS ==========

    pub fn get_dashboard_stats(&self) -> Result<super::models::DashboardStats> {
        // Compter les clients
        let total_clients: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'CLIENT'",
            [],
            |row| row.get(0),
        )?;

        // Encours placements (AV, PER, Contrat capi, Épargne salariale - SANS SCPI)
        let encours_placements: f64 = self.conn.query_row(
            &format!(
                "SELECT COALESCE(SUM({EFFECTIVE_ENCOURS_SQL_I}), 0) FROM investissements i
             WHERE i.type_produit IN ('ASSURANCE_VIE', 'PER', 'CONTRAT_CAPITALISATION', 'EPARGNE_SALARIALE', 'FIP_FCPI', 'FCPR')
               AND i.origine = 'MON_CONSEIL'
               AND ((i.contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id))
                    OR (i.foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = i.foyer_id)))"
            ),
            [],
            |row| {
                let centimes: i64 = row.get(0)?;
                Ok(centimes as f64 / 100.0)
            },
        ).unwrap_or(0.0);

        // Versements programmés annuels (convertir selon fréquence)
        // MENSUEL x12, TRIMESTRIEL x4, SEMESTRIEL x2, ANNUEL x1
        // Inclut TOUS les investissements avec versement programmé activé
        let versements_programmes_annuels: f64 = self.conn.query_row(
            "SELECT COALESCE(SUM(
                CASE 
                    WHEN frequence_versement = 'MENSUEL' THEN montant_versement_programme * 12
                    WHEN frequence_versement = 'TRIMESTRIEL' THEN montant_versement_programme * 4
                    WHEN frequence_versement = 'SEMESTRIEL' THEN montant_versement_programme * 2
                    WHEN frequence_versement = 'ANNUEL' THEN montant_versement_programme
                    ELSE montant_versement_programme * 12
                END
            ), 0) FROM investissements 
             WHERE versement_programme = 1
               AND montant_versement_programme IS NOT NULL
               AND montant_versement_programme > 0
               AND ((contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_id))
                    OR (foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = foyer_id)))",
            [],
            |row| {
                let centimes: i64 = row.get(0)?;
                Ok(centimes as f64 / 100.0)
            },
        ).unwrap_or(0.0);

        // Nombre de biens immobiliers
        let nombre_biens_immobiliers: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM investissements i
             WHERE i.type_produit IN ('IMMOBILIER', 'PINEL', 'DENORMANDIE', 'JEANBRUN', 'MALRAUX', 'MONUMENT_HISTORIQUE', 'DEFICIT_FONCIER', 'LMNP', 'LMP', 'NUE_PROPRIETE', 'RESIDENCE_PRINCIPALE', 'LOCATIF_CLASSIQUE')
               AND ((i.contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id))
                    OR (i.foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = i.foyer_id)))",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        // Panier moyen = montants souscrits (montant_initial) « avec moi » / clients — pas l'encours
        let total_invests_avec_moi: f64 = self.conn.query_row(
            "SELECT COALESCE(SUM(i.montant_initial), 0) FROM investissements i
             WHERE i.origine = 'MON_CONSEIL'
               AND ((i.contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id))
                    OR (i.foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = i.foyer_id)))",
            [],
            |row| {
                let centimes: i64 = row.get(0)?;
                Ok(centimes as f64 / 100.0)
            },
        ).unwrap_or(0.0);

        let panier_moyen = if total_clients > 0 {
            total_invests_avec_moi / total_clients as f64
        } else {
            0.0
        };

        // Compter les alertes non traitées
        let alertes_non_traitees: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM alertes WHERE traitee = 0",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(super::models::DashboardStats {
            total_clients,
            encours_placements,
            versements_programmes_annuels,
            nombre_biens_immobiliers,
            panier_moyen,
            alertes_non_traitees,
        })
    }

    pub fn get_category_stats(&self) -> Result<super::models::CategoryStats> {
        // Compter chaque catégorie individuellement
        let clients: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'CLIENT'",
            [],
            |row| row.get(0),
        )?;

        let prospect_client: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'PROSPECT_CLIENT'",
            [],
            |row| row.get(0),
        )?;

        let prospect_filleul: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts
             WHERE filleul_categorie = 'PROSPECT_FILLEUL'
                OR (filleul_categorie IS NULL AND categorie = 'PROSPECT_FILLEUL')",
            [],
            |row| row.get(0),
        )?;

        let suspect_client: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'SUSPECT_CLIENT'",
            [],
            |row| row.get(0),
        )?;

        let suspect_filleul: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts
             WHERE filleul_categorie = 'SUSPECT_FILLEUL'
                OR (filleul_categorie IS NULL AND categorie = 'SUSPECT_FILLEUL')",
            [],
            |row| row.get(0),
        )?;

        Ok(super::models::CategoryStats {
            clients,
            prospect_client,
            prospect_filleul,
            suspect_client,
            suspect_filleul,
        })
    }

    pub fn get_monthly_stats(&self) -> Result<Vec<super::models::MonthlyStats>> {
        // Récupérer les 12 derniers mois
        let mut stats = Vec::new();

        // Obtenir le timestamp actuel
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Pour les 12 derniers mois
        for i in (0..12).rev() {
            // Calculer le début et la fin du mois
            let month_start = now - (i * 30 * 24 * 60 * 60);
            let month_end = now - ((i - 1) * 30 * 24 * 60 * 60);

            // Compter les contacts créés ce mois
            let count: i64 = self
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM contacts WHERE created_at >= ?1 AND created_at < ?2",
                    params![month_start, month_end],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            // Formater le nom du mois
            let month_name = Self::format_month(month_start);

            stats.push(super::models::MonthlyStats {
                month: month_name,
                nouveaux: count,
            });
        }

        Ok(stats)
    }

    /// Clients et panier moyen par année de souscription — montant_initial uniquement (pas encours).
    pub fn get_yearly_activity_stats(&self) -> Result<Vec<super::models::YearlyActivityStats>> {
        let mut stmt = self.conn.prepare(
            "SELECT
                CAST(strftime('%Y', datetime(i.date_souscription, 'unixepoch')) AS INTEGER) AS year,
                COUNT(DISTINCT i.contact_id) AS clients,
                COALESCE(SUM(i.montant_initial), 0) AS total_centimes
             FROM investissements i
             WHERE i.origine = 'MON_CONSEIL'
               AND i.date_souscription IS NOT NULL
               AND i.contact_id IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM contacts c
                   WHERE c.id = i.contact_id AND c.categorie = 'CLIENT'
               )
             GROUP BY year
             ORDER BY year ASC",
        )?;

        let stats = stmt
            .query_map([], |row| {
                let year: i32 = row.get(0)?;
                let clients: i64 = row.get(1)?;
                let total_centimes: i64 = row.get(2)?;
                let total_euros = total_centimes as f64 / 100.0;
                let panier_moyen = if clients > 0 {
                    total_euros / clients as f64
                } else {
                    0.0
                };
                Ok(super::models::YearlyActivityStats {
                    year,
                    clients,
                    panier_moyen,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(stats)
    }

    fn format_month(timestamp: i64) -> String {
        use std::time::{Duration, UNIX_EPOCH};

        let datetime = UNIX_EPOCH + Duration::from_secs(timestamp as u64);
        let datetime: chrono::DateTime<chrono::Utc> = datetime.into();

        // Format: "Jan 2026"
        datetime.format("%b %Y").to_string()
    }

    pub fn get_product_stats(&self) -> Result<Vec<super::models::ProductStats>> {
        // Vérifier si la table existe, sinon retourner un vecteur vide
        let table_exists: Result<i64> = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='investissements'",
            [],
            |row| row.get(0),
        );

        if table_exists.unwrap_or(0) == 0 {
            return Ok(Vec::new());
        }

        let mut stmt = self.conn.prepare(
            "SELECT type_produit, SUM(montant_initial) as total 
             FROM investissements 
             GROUP BY type_produit 
             HAVING total > 0
             ORDER BY total DESC",
        )?;

        let stats = stmt.query_map([], |row| {
            let montant_centimes: i64 = row.get(1)?;
            let montant_euros = montant_centimes as f64 / 100.0; // Convertir centimes en euros

            Ok(super::models::ProductStats {
                type_produit: row.get(0)?,
                montant: montant_euros,
            })
        })?;

        let mut result = Vec::new();
        for stat in stats {
            result.push(stat?);
        }
        Ok(result)
    }

    pub fn get_pipeline_stats(&self) -> Result<super::models::PipelineStats> {
        let suspects: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts
             WHERE categorie = 'SUSPECT_CLIENT'
                OR filleul_categorie = 'SUSPECT_FILLEUL'
                OR (filleul_categorie IS NULL AND categorie = 'SUSPECT_FILLEUL')",
            [],
            |row| row.get(0),
        )?;

        let prospects: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts
             WHERE categorie = 'PROSPECT_CLIENT'
                OR filleul_categorie = 'PROSPECT_FILLEUL'
                OR (filleul_categorie IS NULL AND categorie = 'PROSPECT_FILLEUL')",
            [],
            |row| row.get(0),
        )?;

        // Compter les clients
        let clients: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'CLIENT'",
            [],
            |row| row.get(0),
        )?;

        Ok(super::models::PipelineStats {
            suspects,
            prospects,
            clients,
        })
    }
}
