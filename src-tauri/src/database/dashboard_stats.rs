//! Statistiques du tableau de bord.
//!
//! Extrait de `operations.rs` (chantier de découpage par domaine).
//! Comportement inchangé : ces méthodes sont couvertes par les tests d'intégration
//! `dashboard_encours_*`, `get_yearly_activity_stats_*` et `panier_moyen_*`.


use super::operations::{
    EFFECTIVE_ENCOURS_SQL_I, INVESTISSEMENT_ACTIF_ENCOURS_WHERE,
    INVESTISSEMENT_ACTIF_ENCOURS_WHERE_I,
};
use rusqlite::{params, Result};

fn activity_bucket_format(bucket: Option<&str>) -> &'static str {
    match bucket {
        Some("month") => "%Y-%m",
        Some("day") => "%Y-%m-%d",
        _ => "%Y",
    }
}

fn bucket_sort_key(bucket: &str) -> i32 {
    let digits: String = bucket.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse().unwrap_or(0)
}

fn activity_period_filter_clauses(with_period: bool) -> (&'static str, &'static str) {
    if with_period {
        (
            " AND i.date_souscription >= ?1 AND i.date_souscription <= ?2",
            " AND vr.date_versement >= ?1 AND vr.date_versement <= ?2",
        )
    } else {
        ("", "")
    }
}

fn activity_souscription_branch(bucket_fmt: Option<&str>, period_clause: &str) -> String {
    let bucket_select = match bucket_fmt {
        Some(fmt) => format!(
            "strftime('{fmt}', datetime(i.date_souscription, 'unixepoch')) AS bucket,\n                 "
        ),
        None => String::new(),
    };
    format!(
        "SELECT {bucket_select}i.contact_id AS contact_id,
                 COALESCE(i.montant_initial, 0) AS amount_centimes
             FROM investissements i
             WHERE i.origine = 'MON_CONSEIL'
               AND i.date_souscription IS NOT NULL
               AND i.contact_id IS NOT NULL
               AND COALESCE(i.montant_initial, 0) > 0
               AND EXISTS (
                   SELECT 1 FROM contacts c
                   WHERE c.id = i.contact_id AND c.categorie = 'CLIENT'
               ){period_clause}"
    )
}

fn activity_versement_branch(bucket_fmt: Option<&str>, period_clause: &str) -> String {
    let bucket_select = match bucket_fmt {
        Some(fmt) => format!(
            "strftime('{fmt}', datetime(vr.date_versement, 'unixepoch')) AS bucket,\n                 "
        ),
        None => String::new(),
    };
    format!(
        "SELECT {bucket_select}i.contact_id AS contact_id,
                 vr.montant AS amount_centimes
             FROM investissement_versements vr
             INNER JOIN investissements i ON i.id = vr.investissement_id
             WHERE i.origine = 'MON_CONSEIL'
               AND vr.date_versement IS NOT NULL
               AND i.contact_id IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM contacts c
                   WHERE c.id = i.contact_id AND c.categorie = 'CLIENT'
               ){period_clause}"
    )
}

fn activity_flows_union_sql(with_period: bool, bucket_fmt: Option<&str>) -> String {
    let (period_souscription, period_versement) = activity_period_filter_clauses(with_period);
    format!(
        "{} UNION ALL {}",
        activity_souscription_branch(bucket_fmt, period_souscription),
        activity_versement_branch(bucket_fmt, period_versement)
    )
}

fn activity_stats_sql(bucket_fmt: &str, with_period: bool) -> String {
    format!(
        "SELECT bucket, COUNT(DISTINCT contact_id) AS clients, COALESCE(SUM(amount_centimes), 0) AS total_centimes
         FROM ({}) flows
         WHERE bucket IS NOT NULL
         GROUP BY bucket
         ORDER BY bucket ASC",
        activity_flows_union_sql(with_period, Some(bucket_fmt))
    )
}

fn activity_period_summary_sql(with_period: bool) -> String {
    format!(
        "SELECT COUNT(DISTINCT contact_id) AS clients, COALESCE(SUM(amount_centimes), 0) AS total_centimes
         FROM ({}) flows",
        activity_flows_union_sql(with_period, None)
    )
}

fn activity_bucket_contacts_sql(bucket_fmt: &str) -> String {
    format!(
        "SELECT DISTINCT c.id, c.nom, c.prenom, c.categorie, c.filleul_categorie, c.date_r1, c.date_invitation_filleul
         FROM contacts c
         INNER JOIN ({}) flows ON flows.contact_id = c.id AND flows.bucket = ?3
         ORDER BY c.nom COLLATE NOCASE ASC, c.prenom COLLATE NOCASE ASC",
        activity_flows_union_sql(true, Some(bucket_fmt))
    )
}

fn conversion_period_clause(column: &str, with_period: bool) -> String {
    if with_period {
        format!(" AND {column} >= ?1 AND {column} <= ?2")
    } else {
        String::new()
    }
}


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
               AND {INVESTISSEMENT_ACTIF_ENCOURS_WHERE_I}
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
            &format!(
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
               AND origine = 'MON_CONSEIL'
               AND {INVESTISSEMENT_ACTIF_ENCOURS_WHERE}
               AND ((contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_id))
                    OR (foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = foyer_id)))"
            ),
            [],
            |row| {
                let centimes: i64 = row.get(0)?;
                Ok(centimes as f64 / 100.0)
            },
        ).unwrap_or(0.0);

        // Nombre de biens immobiliers
        let nombre_biens_immobiliers: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM investissements i
             WHERE i.type_produit IN ('IMMOBILIER', 'PINEL', 'DENORMANDIE', 'JEANBRUN', 'MALRAUX', 'MONUMENT_HISTORIQUE', 'DEFICIT_FONCIER', 'LMNP', 'LMP', 'NUE_PROPRIETE', 'RESIDENCE_PRINCIPALE', 'LOCATIF_CLASSIQUE', 'RP', 'LOCATIF', 'RS', 'SCI', 'COLOCATION', 'MONOLOCATION')
               AND i.origine = 'MON_CONSEIL'
               AND {INVESTISSEMENT_ACTIF_ENCOURS_WHERE_I}
               AND ((i.contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id))
                    OR (i.foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = i.foyer_id)))"
            ),
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

        // Compter les alertes non traitées (échues + visibles, aligné Suivi)
        let alertes_non_traitees = self.count_alertes_non_traitees().unwrap_or(0);

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

    /// Clients et panier moyen — souscriptions initiales + versements complémentaires.
    /// Sans période : groupé par année. Avec période : bucket `year` | `month` | `day`.
    pub fn get_yearly_activity_stats(
        &self,
        period_start: Option<i64>,
        period_end: Option<i64>,
        bucket: Option<&str>,
    ) -> Result<Vec<super::models::YearlyActivityStats>> {
        let with_period = matches!((period_start, period_end), (Some(_), Some(_)));
        let bucket_fmt = activity_bucket_format(bucket);
        let sql = activity_stats_sql(bucket_fmt, with_period);

        let stats = if with_period {
            let start = period_start.unwrap();
            let end = period_end.unwrap();
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt.query_map(params![start, end], |row| {
                let bucket: String = row.get(0)?;
                let clients: i64 = row.get(1)?;
                let total_centimes: i64 = row.get(2)?;
                let total_euros = total_centimes as f64 / 100.0;
                let panier_moyen = if clients > 0 {
                    total_euros / clients as f64
                } else {
                    0.0
                };
                Ok(super::models::YearlyActivityStats {
                    year: bucket_sort_key(&bucket),
                    label: bucket,
                    clients,
                    panier_moyen,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        } else {
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt.query_map([], |row| {
                let bucket: String = row.get(0)?;
                let clients: i64 = row.get(1)?;
                let total_centimes: i64 = row.get(2)?;
                let total_euros = total_centimes as f64 / 100.0;
                let panier_moyen = if clients > 0 {
                    total_euros / clients as f64
                } else {
                    0.0
                };
                Ok(super::models::YearlyActivityStats {
                    year: bucket_sort_key(&bucket),
                    label: bucket.clone(),
                    clients,
                    panier_moyen,
                })
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        Ok(stats)
    }

    /// Totaux sur la période (souscriptions + versements « avec moi »), alignés sur le graphique activité.
    pub fn get_activity_period_summary(
        &self,
        period_start: i64,
        period_end: i64,
    ) -> Result<super::models::ActivityPeriodSummary> {
        let sql = activity_period_summary_sql(true);
        self.conn.query_row(
            &sql,
            params![period_start, period_end],
            |row| {
                let clients: i64 = row.get(0)?;
                let total_centimes: i64 = row.get(1)?;
                let total = total_centimes as f64 / 100.0;
                let panier_moyen = if clients > 0 {
                    total / clients as f64
                } else {
                    0.0
                };
                Ok(super::models::ActivityPeriodSummary {
                    clients,
                    total,
                    panier_moyen,
                })
            },
        )
    }

    fn format_month(timestamp: i64) -> String {
        use std::time::{Duration, UNIX_EPOCH};

        let datetime = UNIX_EPOCH + Duration::from_secs(timestamp as u64);
        let datetime: chrono::DateTime<chrono::Utc> = datetime.into();

        // Format: "Jan 2026"
        datetime.format("%b %Y").to_string()
    }

    pub fn get_product_stats(&self) -> Result<Vec<super::models::ProductStats>> {
        let table_exists: Result<i64> = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='investissements'",
            [],
            |row| row.get(0),
        );

        if table_exists.unwrap_or(0) == 0 {
            return Ok(Vec::new());
        }

        let mut stmt = self.conn.prepare(
            &format!(
                "SELECT i.type_produit, COALESCE(SUM({EFFECTIVE_ENCOURS_SQL_I}), 0) as total
             FROM investissements i
             WHERE i.origine = 'MON_CONSEIL'
               AND {INVESTISSEMENT_ACTIF_ENCOURS_WHERE_I}
               AND ((i.contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id))
                    OR (i.foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = i.foyer_id)))
             GROUP BY i.type_produit
             HAVING total > 0
             ORDER BY total DESC"
            ),
        )?;

        let stats = stmt.query_map([], |row| {
            let montant_centimes: i64 = row.get(1)?;
            Ok(super::models::ProductStats {
                type_produit: row.get(0)?,
                montant: montant_centimes as f64 / 100.0,
            })
        })?;

        stats.collect::<Result<Vec<_>>>()
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

    pub fn get_conversion_client_stats(
        &self,
        period_start: Option<i64>,
        period_end: Option<i64>,
    ) -> Result<super::models::ConversionClientStats> {
        let with_period = matches!((period_start, period_end), (Some(_), Some(_)));
        let r1_period = conversion_period_clause("date_r1", with_period);

        let rdv_r1: i64 = if with_period {
            let start = period_start.unwrap();
            let end = period_end.unwrap();
            self.conn.query_row(
                &format!(
                    "SELECT COUNT(*) FROM contacts
                     WHERE date_r1 IS NOT NULL{r1_period}"
                ),
                params![start, end],
                |row| row.get(0),
            )?
        } else {
            self.conn.query_row(
                "SELECT COUNT(*) FROM contacts WHERE date_r1 IS NOT NULL",
                [],
                |row| row.get(0),
            )?
        };

        let signatures: i64 = if with_period {
            let start = period_start.unwrap();
            let end = period_end.unwrap();
            self.conn.query_row(
                &format!(
                    "SELECT COUNT(DISTINCT c.id) FROM contacts c
                     INNER JOIN investissements i ON i.contact_id = c.id
                     WHERE c.date_r1 IS NOT NULL
                       AND i.origine = 'MON_CONSEIL'
                       AND c.date_r1 >= ?1 AND c.date_r1 <= ?2"
                ),
                params![start, end],
                |row| row.get(0),
            )?
        } else {
            self.conn.query_row(
                "SELECT COUNT(DISTINCT c.id) FROM contacts c
                 INNER JOIN investissements i ON i.contact_id = c.id
                 WHERE c.date_r1 IS NOT NULL
                   AND i.origine = 'MON_CONSEIL'",
                [],
                |row| row.get(0),
            )?
        };

        let signatures_portfolio: i64 = if with_period {
            let start = period_start.unwrap();
            let end = period_end.unwrap();
            self.conn.query_row(
                "SELECT COUNT(DISTINCT i.contact_id) FROM investissements i
                 WHERE i.origine = 'MON_CONSEIL'
                   AND i.contact_id IS NOT NULL
                   AND i.date_souscription IS NOT NULL
                   AND i.date_souscription >= ?1 AND i.date_souscription <= ?2
                   AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id)",
                params![start, end],
                |row| row.get(0),
            )?
        } else {
            self.conn.query_row(
                "SELECT COUNT(DISTINCT i.contact_id) FROM investissements i
                 WHERE i.origine = 'MON_CONSEIL'
                   AND i.contact_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id)",
                [],
                |row| row.get(0),
            )?
        };

        let taux_conversion = if rdv_r1 > 0 {
            (signatures as f64 / rdv_r1 as f64) * 100.0
        } else {
            0.0
        };

        Ok(super::models::ConversionClientStats {
            rdv_r1,
            signatures,
            signatures_portfolio,
            taux_conversion,
        })
    }

    pub fn get_conversion_filleul_stats(
        &self,
        period_start: Option<i64>,
        period_end: Option<i64>,
    ) -> Result<super::models::ConversionFilleulStats> {
        let with_period = matches!((period_start, period_end), (Some(_), Some(_)));
        let invite_period = conversion_period_clause("date_invitation_filleul", with_period);

        let invites: i64 = if with_period {
            let start = period_start.unwrap();
            let end = period_end.unwrap();
            self.conn.query_row(
                &format!(
                    "SELECT COUNT(*) FROM contacts
                     WHERE date_invitation_filleul IS NOT NULL{invite_period}"
                ),
                params![start, end],
                |row| row.get(0),
            )?
        } else {
            self.conn.query_row(
                "SELECT COUNT(*) FROM contacts WHERE date_invitation_filleul IS NOT NULL",
                [],
                |row| row.get(0),
            )?
        };

        let presents: i64 = if with_period {
            let start = period_start.unwrap();
            let end = period_end.unwrap();
            self.conn.query_row(
                &format!(
                    "SELECT COUNT(*) FROM contacts
                     WHERE presence_invitation_filleul = 1
                       AND date_invitation_filleul IS NOT NULL{invite_period}"
                ),
                params![start, end],
                |row| row.get(0),
            )?
        } else {
            self.conn.query_row(
                "SELECT COUNT(*) FROM contacts
                 WHERE presence_invitation_filleul = 1
                   AND date_invitation_filleul IS NOT NULL",
                [],
                |row| row.get(0),
            )?
        };

        let convertis: i64 = if with_period {
            let start = period_start.unwrap();
            let end = period_end.unwrap();
            self.conn.query_row(
                &format!(
                    "SELECT COUNT(*) FROM contacts
                     WHERE filleul_categorie = 'FILLEUL'
                       AND date_invitation_filleul IS NOT NULL{invite_period}"
                ),
                params![start, end],
                |row| row.get(0),
            )?
        } else {
            self.conn.query_row(
                "SELECT COUNT(*) FROM contacts
                 WHERE filleul_categorie = 'FILLEUL'
                   AND date_invitation_filleul IS NOT NULL",
                [],
                |row| row.get(0),
            )?
        };

        let taux_presence = if invites > 0 {
            (presents as f64 / invites as f64) * 100.0
        } else {
            0.0
        };

        let taux_conversion = if invites > 0 {
            (convertis as f64 / invites as f64) * 100.0
        } else {
            0.0
        };

        Ok(super::models::ConversionFilleulStats {
            invites,
            presents,
            convertis,
            taux_presence,
            taux_conversion,
        })
    }

    fn map_dashboard_stat_contact(row: &rusqlite::Row<'_>) -> rusqlite::Result<super::models::DashboardStatContact> {
        Ok(super::models::DashboardStatContact {
            contact_id: row.get(0)?,
            nom: row.get(1)?,
            prenom: row.get(2)?,
            categorie: row.get(3)?,
            filleul_categorie: row.get(4)?,
            date_r1: row.get(5)?,
            date_invitation_filleul: row.get(6)?,
        })
    }

    fn query_dashboard_stat_contacts(&self, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<Vec<super::models::DashboardStatContact>> {
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params, Self::map_dashboard_stat_contact)?;
        rows.collect::<Result<Vec<_>>>()
    }

    /// Clients actifs ayant eu une souscription ou versement « avec moi » dans le bucket demandé.
    pub fn get_activity_bucket_contacts(
        &self,
        period_start: i64,
        period_end: i64,
        bucket_key: &str,
        bucket: Option<&str>,
    ) -> Result<Vec<super::models::DashboardStatContact>> {
        let bucket_fmt = activity_bucket_format(bucket);
        let sql = activity_bucket_contacts_sql(bucket_fmt);
        self.query_dashboard_stat_contacts(
            &sql,
            &[
                &period_start as &dyn rusqlite::ToSql,
                &period_end,
                &bucket_key,
            ],
        )
    }

    /// Liste drill-down conversion client : `r1` | `signatures` | `portfolio`.
    pub fn get_conversion_client_contacts(
        &self,
        period_start: i64,
        period_end: i64,
        segment: &str,
    ) -> Result<Vec<super::models::DashboardStatContact>> {
        let sql = match segment {
            "r1" => format!(
                "SELECT c.id, c.nom, c.prenom, c.categorie, c.filleul_categorie, c.date_r1, c.date_invitation_filleul
                 FROM contacts c
                 WHERE c.date_r1 IS NOT NULL
                   AND c.date_r1 >= ?1 AND c.date_r1 <= ?2
                 ORDER BY c.nom COLLATE NOCASE ASC, c.prenom COLLATE NOCASE ASC"
            ),
            "signatures" => format!(
                "SELECT DISTINCT c.id, c.nom, c.prenom, c.categorie, c.filleul_categorie, c.date_r1, c.date_invitation_filleul
                 FROM contacts c
                 INNER JOIN investissements i ON i.contact_id = c.id
                 WHERE c.date_r1 IS NOT NULL
                   AND i.origine = 'MON_CONSEIL'
                   AND c.date_r1 >= ?1 AND c.date_r1 <= ?2
                 ORDER BY c.nom COLLATE NOCASE ASC, c.prenom COLLATE NOCASE ASC"
            ),
            "portfolio" => format!(
                "SELECT DISTINCT c.id, c.nom, c.prenom, c.categorie, c.filleul_categorie, c.date_r1, c.date_invitation_filleul
                 FROM contacts c
                 INNER JOIN investissements i ON i.contact_id = c.id
                 WHERE i.origine = 'MON_CONSEIL'
                   AND i.contact_id IS NOT NULL
                   AND i.date_souscription IS NOT NULL
                   AND i.date_souscription >= ?1 AND i.date_souscription <= ?2
                 ORDER BY c.nom COLLATE NOCASE ASC, c.prenom COLLATE NOCASE ASC"
            ),
            _ => return Ok(Vec::new()),
        };
        self.query_dashboard_stat_contacts(
            &sql,
            &[
                &period_start as &dyn rusqlite::ToSql,
                &period_end,
            ],
        )
    }

    /// Liste drill-down conversion filleul : `invites` | `presents` | `convertis`.
    pub fn get_conversion_filleul_contacts(
        &self,
        period_start: i64,
        period_end: i64,
        segment: &str,
    ) -> Result<Vec<super::models::DashboardStatContact>> {
        let invite_period = conversion_period_clause("date_invitation_filleul", true);
        let sql = match segment {
            "invites" => format!(
                "SELECT c.id, c.nom, c.prenom, c.categorie, c.filleul_categorie, c.date_r1, c.date_invitation_filleul
                 FROM contacts c
                 WHERE c.date_invitation_filleul IS NOT NULL{invite_period}
                 ORDER BY c.nom COLLATE NOCASE ASC, c.prenom COLLATE NOCASE ASC"
            ),
            "presents" => format!(
                "SELECT c.id, c.nom, c.prenom, c.categorie, c.filleul_categorie, c.date_r1, c.date_invitation_filleul
                 FROM contacts c
                 WHERE c.presence_invitation_filleul = 1
                   AND c.date_invitation_filleul IS NOT NULL{invite_period}
                 ORDER BY c.nom COLLATE NOCASE ASC, c.prenom COLLATE NOCASE ASC"
            ),
            "convertis" => format!(
                "SELECT c.id, c.nom, c.prenom, c.categorie, c.filleul_categorie, c.date_r1, c.date_invitation_filleul
                 FROM contacts c
                 WHERE c.filleul_categorie = 'FILLEUL'
                   AND c.date_invitation_filleul IS NOT NULL{invite_period}
                 ORDER BY c.nom COLLATE NOCASE ASC, c.prenom COLLATE NOCASE ASC"
            ),
            _ => return Ok(Vec::new()),
        };
        self.query_dashboard_stat_contacts(
            &sql,
            &[
                &period_start as &dyn rusqlite::ToSql,
                &period_end,
            ],
        )
    }
}
