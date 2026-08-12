//! Revenus perçus (dividendes SCPI, etc.) — historique par date.

use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Result};

impl super::Database {
    pub(crate) fn migrate_investissement_revenus_percus(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS investissement_revenus_percus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                investissement_id INTEGER NOT NULL,
                montant INTEGER NOT NULL,
                date_perception INTEGER NOT NULL,
                source TEXT NOT NULL DEFAULT 'ESPACE_CLIENT',
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (investissement_id) REFERENCES investissements(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS investissement_revenus_percus_inv_idx
             ON investissement_revenus_percus (investissement_id, date_perception DESC)",
            [],
        )?;
        Ok(())
    }

    pub fn get_revenus_percus_by_investissement(
        &self,
        investissement_id: i64,
    ) -> Result<Vec<super::models::InvestissementRevenuPercu>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, investissement_id, montant, date_perception, source, created_at
             FROM investissement_revenus_percus
             WHERE investissement_id = ?1
             ORDER BY date_perception DESC, id DESC",
        )?;
        let rows = stmt.query_map(params![investissement_id], |row| {
            Ok(super::models::InvestissementRevenuPercu {
                id: row.get(0)?,
                investissement_id: row.get(1)?,
                montant: row.get(2)?,
                date_perception: row.get(3)?,
                source: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_investissement_revenu_percu(
        &self,
        revenu: super::models::NewInvestissementRevenuPercu,
    ) -> Result<super::models::InvestissementRevenuPercu> {
        let date_ts = revenu
            .date_perception
            .as_deref()
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            })
            .unwrap_or_else(|| Utc::now().timestamp());

        let existing_id: Option<i64> = self
            .conn
            .query_row(
                "SELECT id FROM investissement_revenus_percus
                 WHERE investissement_id = ?1
                   AND date(date_perception, 'unixepoch') = date(?2, 'unixepoch')
                   AND source = COALESCE(?3, 'ESPACE_CLIENT')
                 LIMIT 1",
                params![
                    revenu.investissement_id,
                    date_ts,
                    revenu.source.as_deref().unwrap_or("ESPACE_CLIENT")
                ],
                |row| row.get(0),
            )
            .optional()?;

        let source = revenu
            .source
            .unwrap_or_else(|| "ESPACE_CLIENT".to_string());

        if let Some(id) = existing_id {
            self.conn.execute(
                "UPDATE investissement_revenus_percus SET montant = ?1 WHERE id = ?2",
                params![revenu.montant, id],
            )?;
            return self.get_revenu_percu_by_id(id);
        }

        self.conn.execute(
            "INSERT INTO investissement_revenus_percus (
                investissement_id, montant, date_perception, source
             ) VALUES (?1, ?2, ?3, ?4)",
            params![revenu.investissement_id, revenu.montant, date_ts, source],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_revenu_percu_by_id(id)
    }

    fn get_revenu_percu_by_id(&self, id: i64) -> Result<super::models::InvestissementRevenuPercu> {
        self.conn.query_row(
            "SELECT id, investissement_id, montant, date_perception, source, created_at
             FROM investissement_revenus_percus WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::InvestissementRevenuPercu {
                    id: row.get(0)?,
                    investissement_id: row.get(1)?,
                    montant: row.get(2)?,
                    date_perception: row.get(3)?,
                    source: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
    }

    pub fn touch_investissement_derniere_maj_client(
        &self,
        investissement_id: i64,
        at: i64,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE investissements SET derniere_maj_client = ?1, updated_at = unixepoch()
             WHERE id = ?2",
            params![at, investissement_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::super::Database;
    use super::super::models::{NewInvestissement, NewInvestissementRevenuPercu};

    #[test]
    fn upserts_revenu_percu_same_day() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.get_connection()
            .execute(
                "INSERT INTO contacts (categorie, nom, prenom, created_at, updated_at)
                 VALUES ('CLIENT', 'DUPONT', 'Jean', 1, 1)",
                [],
            )
            .unwrap();
        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(1),
                foyer_id: None,
                type_produit: "SCPI".into(),
                partenaire_id: None,
                nom_produit: "Test".into(),
                numero_contrat: None,
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                date_dernier_arbitrage: None,
                date_prochain_arbitrage: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                prevoyance_perso: None,
                prevoyance_pro: None,
                prevoyance_versement_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        db.create_investissement_revenu_percu(NewInvestissementRevenuPercu {
            investissement_id: inv.id,
            montant: 30_000,
            date_perception: Some("2026-08-12T00:00:00.000Z".into()),
            source: Some("ESPACE_CLIENT".into()),
        })
        .unwrap();
        db.create_investissement_revenu_percu(NewInvestissementRevenuPercu {
            investissement_id: inv.id,
            montant: 35_000,
            date_perception: Some("2026-08-12T00:00:00.000Z".into()),
            source: Some("ESPACE_CLIENT".into()),
        })
        .unwrap();

        let rows = db.get_revenus_percus_by_investissement(inv.id).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].montant, 35_000);
    }
}
