//! Positions clients par contrat (export « Supports » de la plateforme) et historique de valeur
//! liquidative par support.
//!
//! Le fichier dit qui détient quoi : le rattachement se fait sur le numéro de contrat déjà porté
//! par les investissements, jamais sur l'identité (les colonnes nom / prénom / email de l'export
//! sont ignorées côté frontend, rien n'est dupliqué ici).
//!
//! Deux comportements structurent l'import :
//! - la photo d'un contrat reconnu est **remplacée** (les arbitrages retirent et ajoutent des
//!   supports) ; un contrat absent du fichier garde sa photo, pour qu'un export partiel n'efface
//!   pas des positions valides ;
//! - l'historique des valeurs liquidatives n'est jamais écrasé : il se construit au fil des
//!   imports et ne se rattrape pas.

use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContratSupportImportRow {
    pub numero_contrat: String,
    pub isin: String,
    pub libelle: String,
    #[serde(default)]
    pub societe_gestion: Option<String>,
    #[serde(default)]
    pub type_support: Option<String>,
    #[serde(default)]
    pub sri: Option<i64>,
    #[serde(default)]
    pub nb_parts: Option<f64>,
    #[serde(default)]
    pub valeur_unitaire: Option<f64>,
    #[serde(default)]
    pub encours: Option<f64>,
    #[serde(default)]
    pub plus_moins_value_pct: Option<f64>,
    #[serde(default)]
    pub date_valeur: Option<i64>,
}

/// Support détenu qui n'existe pas dans la veille fonds : classe de parts renommée, fonds retiré
/// de l'offre… Trié par encours pour que l'important remonte en premier.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContratSupportHorsVeille {
    pub isin: String,
    pub libelle: String,
    pub encours: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ContratSupportsImportResult {
    pub lignes_total: usize,
    pub lignes_importees: usize,
    pub lignes_ignorees: usize,
    pub contrats_reconnus: usize,
    pub contrats_inconnus: Vec<String>,
    pub encours_total: f64,
    pub vl_points_ajoutes: usize,
    pub supports_hors_veille: Vec<ContratSupportHorsVeille>,
}

/// Détenteur d'un fonds : le contrat et le client derrière une ligne de position.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FundHolder {
    pub contact_id: Option<i64>,
    pub nom: String,
    pub prenom: String,
    pub numero_contrat: String,
    pub nom_produit: String,
    pub encours: Option<f64>,
    pub nb_parts: Option<f64>,
    pub plus_moins_value_pct: Option<f64>,
    pub date_valeur: Option<i64>,
}

/// Une ligne de la composition d'un contrat, telle qu'affichée dans la fiche client.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContratSupportLine {
    pub isin: String,
    pub libelle: String,
    pub type_support: Option<String>,
    pub sri: Option<i64>,
    pub nb_parts: Option<f64>,
    pub valeur_unitaire: Option<f64>,
    pub encours: Option<f64>,
    pub plus_moins_value_pct: Option<f64>,
    pub date_valeur: Option<i64>,
}

/// Clé de rapprochement : les numéros saisis dans le CRM peuvent porter espaces, points ou tirets.
fn contract_key(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_uppercase())
        .collect()
}

/// Un code non conforme (fonds euro, produit structuré) ne sera jamais dans la veille fonds :
/// l'y signaler n'apporte rien, seuls les vrais ISIN absents méritent l'attention.
fn is_isin_like(code: &str) -> bool {
    let bytes = code.as_bytes();
    bytes.len() == 12
        && bytes[..2].iter().all(|b| b.is_ascii_uppercase())
        && bytes[2..11].iter().all(|b| b.is_ascii_alphanumeric())
        && bytes[11].is_ascii_digit()
}

impl super::Database {
    fn contract_index(&self) -> Result<HashMap<String, (i64, Option<i64>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, numero_contrat FROM investissements
             WHERE numero_contrat IS NOT NULL AND TRIM(numero_contrat) <> ''
             ORDER BY id",
        )?;
        let mut index: HashMap<String, (i64, Option<i64>)> = HashMap::new();
        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let contact_id: Option<i64> = row.get(1)?;
            let numero: String = row.get(2)?;
            Ok((id, contact_id, numero))
        })?;
        for row in rows {
            let (id, contact_id, numero) = row?;
            let key = contract_key(&numero);
            if key.is_empty() {
                continue;
            }
            index.entry(key).or_insert((id, contact_id));
        }
        Ok(index)
    }

    fn watchlist_isins(&self) -> Result<HashSet<String>> {
        let mut stmt = self.conn.prepare("SELECT isin FROM fund_watchlist")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect()
    }

    /// Sans aucune position importée, « détenu par personne » ne veut rien dire : le coach doit
    /// pouvoir se taire plutôt que d'affirmer qu'un fonds n'est chez aucun client.
    pub fn has_contrat_supports(&self) -> Result<bool> {
        self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM contrat_supports)",
            [],
            |row| row.get::<_, i64>(0).map(|n| n != 0),
        )
    }

    /// Composition d'un contrat : ce que le client détient réellement, du plus gros au plus petit.
    pub fn list_contrat_supports(&self, investissement_id: i64) -> Result<Vec<ContratSupportLine>> {
        let mut stmt = self.conn.prepare(
            "SELECT isin, libelle, type_support, sri, nb_parts, valeur_unitaire,
                    encours, plus_moins_value_pct, date_valeur
             FROM contrat_supports
             WHERE investissement_id = ?1
             ORDER BY encours DESC",
        )?;
        let rows = stmt.query_map(params![investissement_id], |row| {
            Ok(ContratSupportLine {
                isin: row.get(0)?,
                libelle: row.get(1)?,
                type_support: row.get(2)?,
                sri: row.get(3)?,
                nb_parts: row.get(4)?,
                valeur_unitaire: row.get(5)?,
                encours: row.get(6)?,
                plus_moins_value_pct: row.get(7)?,
                date_valeur: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    /// Qui détient ce fonds, du plus gros encours au plus petit.
    pub fn list_fund_holders(&self, isin: &str) -> Result<Vec<FundHolder>> {
        let mut stmt = self.conn.prepare(
            "SELECT cs.contact_id, COALESCE(c.nom, ''), COALESCE(c.prenom, ''),
                    cs.numero_contrat, i.nom_produit,
                    cs.encours, cs.nb_parts, cs.plus_moins_value_pct, cs.date_valeur
             FROM contrat_supports cs
             INNER JOIN investissements i ON i.id = cs.investissement_id
             LEFT JOIN contacts c ON c.id = cs.contact_id
             WHERE cs.isin = ?1
             ORDER BY cs.encours DESC",
        )?;
        let rows = stmt.query_map(params![isin.trim().to_uppercase()], |row| {
            Ok(FundHolder {
                contact_id: row.get(0)?,
                nom: row.get(1)?,
                prenom: row.get(2)?,
                numero_contrat: row.get(3)?,
                nom_produit: row.get(4)?,
                encours: row.get(5)?,
                nb_parts: row.get(6)?,
                plus_moins_value_pct: row.get(7)?,
                date_valeur: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn import_contrat_supports(
        &self,
        rows: Vec<ContratSupportImportRow>,
        source_label: &str,
    ) -> Result<ContratSupportsImportResult> {
        let source = match source_label.trim() {
            "" => "import",
            label => label,
        };
        let now = chrono::Utc::now().timestamp();
        let contracts = self.contract_index()?;
        let watchlist = self.watchlist_isins()?;

        let mut result = ContratSupportsImportResult {
            lignes_total: rows.len(),
            ..Default::default()
        };

        // Regroupement par contrat, dans l'ordre du fichier.
        let mut order: Vec<String> = Vec::new();
        let mut grouped: HashMap<String, Vec<&ContratSupportImportRow>> = HashMap::new();
        for row in &rows {
            let key = contract_key(&row.numero_contrat);
            if key.is_empty() {
                result.lignes_ignorees += 1;
                continue;
            }
            let entry = grouped.entry(key.clone()).or_default();
            if entry.is_empty() {
                order.push(key);
            }
            entry.push(row);
        }

        let vl_before: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM support_vl_history", [], |r| r.get(0))?;

        let tx = self.conn.unchecked_transaction()?;
        let mut hors_veille: HashMap<String, ContratSupportHorsVeille> = HashMap::new();

        for key in &order {
            let lines = &grouped[key];
            let matched = contracts.get(key);

            if let Some((investissement_id, contact_id)) = matched {
                result.contrats_reconnus += 1;
                tx.execute(
                    "DELETE FROM contrat_supports WHERE investissement_id = ?1",
                    params![investissement_id],
                )?;
                for line in lines {
                    tx.execute(
                        "INSERT INTO contrat_supports (
                            investissement_id, contact_id, numero_contrat, isin, libelle,
                            societe_gestion, type_support, sri, nb_parts, valeur_unitaire,
                            encours, plus_moins_value_pct, date_valeur, source_label, updated_at
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                        params![
                            investissement_id,
                            contact_id,
                            line.numero_contrat.trim(),
                            line.isin,
                            line.libelle,
                            line.societe_gestion,
                            line.type_support,
                            line.sri,
                            line.nb_parts,
                            line.valeur_unitaire,
                            line.encours,
                            line.plus_moins_value_pct,
                            line.date_valeur,
                            source,
                            now,
                        ],
                    )?;
                    result.lignes_importees += 1;
                    result.encours_total += line.encours.unwrap_or(0.0);

                    if !watchlist.contains(&line.isin) && is_isin_like(&line.isin) {
                        let entry = hors_veille
                            .entry(line.isin.clone())
                            .or_insert_with(|| ContratSupportHorsVeille {
                                isin: line.isin.clone(),
                                libelle: line.libelle.clone(),
                                encours: 0.0,
                            });
                        entry.encours += line.encours.unwrap_or(0.0);
                    }
                }
            } else {
                result
                    .contrats_inconnus
                    .push(lines[0].numero_contrat.trim().to_string());
                result.lignes_ignorees += lines.len();
            }

            // La valeur liquidative est une donnée de marché : elle vaut même sur un contrat
            // que le CRM ne connaît pas encore.
            for line in lines {
                let (Some(date_valeur), Some(valeur)) = (line.date_valeur, line.valeur_unitaire)
                else {
                    continue;
                };
                tx.execute(
                    "INSERT INTO support_vl_history (isin, date_valeur, valeur_unitaire, libelle, source_label, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                     ON CONFLICT(isin, date_valeur) DO UPDATE SET
                        valeur_unitaire = MAX(valeur_unitaire, excluded.valeur_unitaire),
                        libelle = COALESCE(excluded.libelle, libelle)",
                    params![
                        line.isin,
                        date_valeur,
                        valeur,
                        line.libelle,
                        source,
                        now,
                    ],
                )?;
            }
        }

        tx.commit()?;

        let vl_after: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM support_vl_history", [], |r| r.get(0))?;
        result.vl_points_ajoutes = (vl_after - vl_before).max(0) as usize;

        let mut hors_veille: Vec<ContratSupportHorsVeille> = hors_veille.into_values().collect();
        hors_veille.sort_by(|a, b| {
            b.encours
                .partial_cmp(&a.encours)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.isin.cmp(&b.isin))
        });
        result.supports_hors_veille = hors_veille;

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    fn seed_contract(db: &Database, numero: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO contacts (categorie, nom, prenom) VALUES ('CLIENT', 'DUPONT', 'Jean')",
                [],
            )
            .unwrap();
        let contact_id = db.conn.last_insert_rowid();
        db.conn
            .execute(
                "INSERT INTO investissements (contact_id, type_produit, nom_produit, numero_contrat)
                 VALUES (?1, 'ASSURANCE_VIE', 'Contrat Test', ?2)",
                params![contact_id, numero],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn row(numero: &str, isin: &str, libelle: &str, vl: f64, encours: f64) -> ContratSupportImportRow {
        ContratSupportImportRow {
            numero_contrat: numero.into(),
            isin: isin.into(),
            libelle: libelle.into(),
            societe_gestion: Some("Gestion Test".into()),
            type_support: Some("Actions".into()),
            sri: Some(5),
            nb_parts: Some(10.0),
            valeur_unitaire: Some(vl),
            encours: Some(encours),
            plus_moins_value_pct: Some(4.2),
            date_valeur: Some(1_754_265_600),
        }
    }

    fn count_supports(db: &Database, investissement_id: i64) -> i64 {
        db.conn
            .query_row(
                "SELECT COUNT(*) FROM contrat_supports WHERE investissement_id = ?1",
                params![investissement_id],
                |r| r.get(0),
            )
            .unwrap()
    }

    #[test]
    fn matches_contract_number_despite_formatting() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let inv = seed_contract(&db, "2399922");

        let result = db
            .import_contrat_supports(
                vec![row("23 999-22", "FR0000000011", "Fonds Test A", 100.0, 1000.0)],
                "supports",
            )
            .unwrap();

        assert_eq!(result.contrats_reconnus, 1);
        assert!(result.contrats_inconnus.is_empty());
        assert_eq!(result.lignes_importees, 1);
        assert_eq!(count_supports(&db, inv), 1);
    }

    #[test]
    fn replaces_snapshot_so_arbitrages_are_reflected() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let inv = seed_contract(&db, "2399922");
        db.import_contrat_supports(
            vec![
                row("2399922", "FR0000000011", "Fonds Test A", 100.0, 1000.0),
                row("2399922", "FR0000000022", "Fonds Test B", 50.0, 500.0),
            ],
            "supports",
        )
        .unwrap();

        // Arbitrage : B est vendu, C entre.
        db.import_contrat_supports(
            vec![
                row("2399922", "FR0000000011", "Fonds Test A", 101.0, 1010.0),
                row("2399922", "FR0000000033", "Fonds Test C", 20.0, 400.0),
            ],
            "supports",
        )
        .unwrap();

        let isins: Vec<String> = db
            .conn
            .prepare("SELECT isin FROM contrat_supports WHERE investissement_id = ?1 ORDER BY isin")
            .unwrap()
            .query_map(params![inv], |r| r.get(0))
            .unwrap()
            .collect::<Result<_>>()
            .unwrap();
        assert_eq!(isins, vec!["FR0000000011", "FR0000000033"]);
    }

    #[test]
    fn reports_unknown_contracts_without_importing_them() {
        let db = Database::open_in_memory_for_tests().unwrap();
        seed_contract(&db, "2399922");

        let result = db
            .import_contrat_supports(
                vec![
                    row("2399922", "FR0000000011", "Fonds Test A", 100.0, 1000.0),
                    row("9999999", "FR0000000022", "Fonds Test B", 50.0, 500.0),
                ],
                "supports",
            )
            .unwrap();

        assert_eq!(result.contrats_reconnus, 1);
        assert_eq!(result.contrats_inconnus, vec!["9999999"]);
        assert_eq!(result.lignes_importees, 1);
        assert_eq!(result.lignes_ignorees, 1);
        assert!((result.encours_total - 1000.0).abs() < f64::EPSILON);
    }

    /// L'historique VL est le seul acquis qui ne se rattrape pas : un nouvel import ajoute des
    /// points, il n'écrase jamais les précédents.
    #[test]
    fn accumulates_nav_history_across_imports() {
        let db = Database::open_in_memory_for_tests().unwrap();
        seed_contract(&db, "2399922");

        let mut first = row("2399922", "FR0000000011", "Fonds Test A", 100.0, 1000.0);
        first.date_valeur = Some(1_754_265_600);
        let r1 = db.import_contrat_supports(vec![first], "supports").unwrap();
        assert_eq!(r1.vl_points_ajoutes, 1);

        let mut second = row("2399922", "FR0000000011", "Fonds Test A", 104.0, 1040.0);
        second.date_valeur = Some(1_754_524_800);
        let r2 = db.import_contrat_supports(vec![second], "supports").unwrap();
        assert_eq!(r2.vl_points_ajoutes, 1);

        let series: Vec<(i64, f64)> = db
            .conn
            .prepare(
                "SELECT date_valeur, valeur_unitaire FROM support_vl_history
                 WHERE isin = 'FR0000000011' ORDER BY date_valeur",
            )
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_>>()
            .unwrap();
        assert_eq!(series.len(), 2);
        assert!((series[0].1 - 100.0).abs() < f64::EPSILON);
        assert!((series[1].1 - 104.0).abs() < f64::EPSILON);
    }

    /// Deux assureurs valorisent le même fonds à quelques centimes près : la règle doit être
    /// stable d'un import à l'autre, sinon la série fabrique de la variation qui n'existe pas.
    #[test]
    fn nav_history_keeps_one_deterministic_value_per_day() {
        let db = Database::open_in_memory_for_tests().unwrap();
        seed_contract(&db, "2399922");
        seed_contract(&db, "2399923");

        db.import_contrat_supports(
            vec![
                row("2399922", "LU0000000011", "Fonds Test A", 110.99, 1109.9),
                row("2399923", "LU0000000011", "Fonds Test A", 110.52, 1105.2),
            ],
            "supports",
        )
        .unwrap();

        let value: f64 = db
            .conn
            .query_row(
                "SELECT valeur_unitaire FROM support_vl_history WHERE isin = 'LU0000000011'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!((value - 110.99).abs() < f64::EPSILON);
    }

    #[test]
    fn lists_holders_of_a_fund_from_the_biggest_position() {
        let db = Database::open_in_memory_for_tests().unwrap();
        seed_contract(&db, "2399922");
        seed_contract(&db, "2399923");
        db.import_contrat_supports(
            vec![
                row("2399922", "FR0000000011", "Fonds Test A", 100.0, 1000.0),
                row("2399923", "FR0000000011", "Fonds Test A", 100.0, 4000.0),
                row("2399923", "FR0000000022", "Fonds Test B", 50.0, 500.0),
            ],
            "supports",
        )
        .unwrap();

        let holders = db.list_fund_holders("fr0000000011").unwrap();
        assert_eq!(holders.len(), 2);
        assert_eq!(holders[0].numero_contrat, "2399923");
        assert!((holders[0].encours.unwrap() - 4000.0).abs() < f64::EPSILON);
        assert_eq!(holders[0].nom, "DUPONT");
        assert_eq!(holders[1].numero_contrat, "2399922");
    }

    #[test]
    fn lists_contract_composition_biggest_first() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let inv = seed_contract(&db, "2399922");
        db.import_contrat_supports(
            vec![
                row("2399922", "FR0000000011", "Fonds Test A", 100.0, 1000.0),
                row("2399922", "FR0000000022", "Fonds Test B", 50.0, 4000.0),
            ],
            "supports",
        )
        .unwrap();

        let lines = db.list_contrat_supports(inv).unwrap();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].libelle, "Fonds Test B");
        assert!((lines[0].encours.unwrap() - 4000.0).abs() < f64::EPSILON);
        assert!(db.list_contrat_supports(inv + 1000).unwrap().is_empty());
    }

    /// Le tableau doit distinguer « personne ne le détient » de « aucune position importée ».
    #[test]
    fn watchlist_entry_carries_detention_only_when_positions_exist() {
        let db = Database::open_in_memory_for_tests().unwrap();
        seed_contract(&db, "2399922");
        db.conn
            .execute(
                "INSERT INTO fund_watchlist (isin, nom) VALUES ('FR0000000011', 'Fonds Test A'),
                 ('FR0000000099', 'Fonds Test Z')",
                [],
            )
            .unwrap();
        db.import_contrat_supports(
            vec![row("2399922", "FR0000000011", "Fonds Test A", 100.0, 1000.0)],
            "supports",
        )
        .unwrap();

        let entries = db.get_all_fund_watchlist_entries().unwrap();
        let held = entries.iter().find(|e| e.isin == "FR0000000011").unwrap();
        let detention = held.detention.as_ref().unwrap();
        assert_eq!(detention.clients, 1);
        assert_eq!(detention.contrats, 1);
        assert!((detention.encours - 1000.0).abs() < f64::EPSILON);

        let untouched = entries.iter().find(|e| e.isin == "FR0000000099").unwrap();
        assert!(untouched.detention.is_none());
    }

    #[test]
    fn flags_held_funds_missing_from_watchlist_but_ignores_non_isin_codes() {
        let db = Database::open_in_memory_for_tests().unwrap();
        seed_contract(&db, "2399922");
        db.conn
            .execute(
                "INSERT INTO fund_watchlist (isin, nom) VALUES ('FR0000000011', 'Fonds Test A')",
                [],
            )
            .unwrap();

        let result = db
            .import_contrat_supports(
                vec![
                    row("2399922", "FR0000000011", "Fonds Test A", 100.0, 1000.0),
                    row("2399922", "LU0000000022", "Fonds Test B part E2", 50.0, 5000.0),
                    row("2399922", "EURO0000TEST", "Support en euro", 1.0, 90000.0),
                ],
                "supports",
            )
            .unwrap();

        assert_eq!(result.supports_hors_veille.len(), 1);
        assert_eq!(result.supports_hors_veille[0].isin, "LU0000000022");
        assert_eq!(result.lignes_importees, 3);
    }
}
