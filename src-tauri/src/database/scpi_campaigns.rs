//! Campagnes email bulletins SCPI (digest par contact, file modèle sans étiquette).

use super::models::NewTemplateEmail;
use super::Database;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

pub const SCPI_BULLETIN_TEMPLATE_NOM: &str = "Bulletin SCPI trimestriel";
pub const SCPI_BULLETIN_TEMPLATE_TU_NOM: &str = "Bulletin SCPI trimestriel (tu)";

#[derive(Debug, Clone, Deserialize)]
pub struct ScpiBulletinInput {
    pub nom_produit: String,
    pub summary_markdown: String,
    #[serde(default)]
    pub fichier_source: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PrepareScpiCampaignInput {
    pub periode: String,
    pub bulletins: Vec<ScpiBulletinInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareScpiCampaignResult {
    pub periode: String,
    pub batch_key: String,
    pub bulletins_count: usize,
    pub contacts_matched: u64,
    pub contacts_queued: u64,
    pub contacts_no_email: u64,
    pub contacts_skipped_already_sent: u64,
    pub template_nom: String,
    pub message: String,
}

fn normalize_match_key(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter_map(|c| match c {
            'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' => Some('a'),
            'ç' => Some('c'),
            'è' | 'é' | 'ê' | 'ë' => Some('e'),
            'ì' | 'í' | 'î' | 'ï' => Some('i'),
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' => Some('o'),
            'ù' | 'ú' | 'û' | 'ü' => Some('u'),
            'ÿ' => Some('y'),
            c if c.is_ascii_alphanumeric() => Some(c),
            _ => None,
        })
        .collect()
}

pub fn normalize_batch_key(periode: &str) -> String {
    normalize_match_key(periode)
}

fn nom_produit_matches(investissement_nom: &str, bulletin_key: &str) -> bool {
    let inv = normalize_match_key(investissement_nom);
    let key = normalize_match_key(bulletin_key);
    if inv.is_empty() || key.is_empty() {
        return false;
    }
    inv.contains(&key) || key.contains(&inv)
}

fn build_bulletin_resume(bulletins: &[ScpiBulletinInput], periode: &str) -> String {
    bulletins
        .iter()
        .map(|b| {
            format!(
                "## {} — {}\n\n{}",
                b.nom_produit.trim(),
                periode.trim(),
                b.summary_markdown.trim()
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
}

impl Database {
    pub fn migrate_scpi_campaign_envois(&self) -> Result<()> {
        if !self.table_has_column("contact_template_envois", "campaign_batch_key")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN campaign_batch_key TEXT",
                [],
            )?;
            println!("✅ Migration: campaign_batch_key sur contact_template_envois");
        }
        if !self.table_has_column("contact_template_envois", "campaign_variables")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN campaign_variables TEXT",
                [],
            )?;
            println!("✅ Migration: campaign_variables sur contact_template_envois");
        }
        self.conn
            .execute("DROP INDEX IF EXISTS contact_template_envois_unique", [])?;
        self.conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS contact_template_envois_unique
             ON contact_template_envois (
                contact_id,
                template_id,
                COALESCE(investissement_id, -1),
                COALESCE(campaign_batch_key, '')
             )",
            [],
        )?;
        Ok(())
    }

    pub fn ensure_scpi_bulletin_email_templates(&self) -> Result<()> {
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![SCPI_BULLETIN_TEMPLATE_NOM],
            |row| row.get(0),
        )?;
        if exists > 0 {
            return Ok(());
        }

        let tu = self.create_template_email(NewTemplateEmail {
            nom: SCPI_BULLETIN_TEMPLATE_TU_NOM.into(),
            sujet: "Tes bulletins SCPI — {{periode}}, {{prenom}}".into(),
            corps: "Bonjour {{prenom}},\n\n\
Voici les points clés des bulletins trimestriels de tes SCPI ({{periode}}) :\n\n\
{{bulletin_resume}}\n\n\
---\n\
Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement."
                .into(),
            categorie: "NEWSLETTER".into(),
            variables: None,
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })?;

        let _vous = self.create_template_email(NewTemplateEmail {
            nom: SCPI_BULLETIN_TEMPLATE_NOM.into(),
            sujet: "Vos bulletins SCPI — {{periode}}, {{prenom}}".into(),
            corps: "Bonjour {{prenom}} {{nom}},\n\n\
Voici les points clés des bulletins trimestriels de vos SCPI ({{periode}}) :\n\n\
{{bulletin_resume}}\n\n\
---\n\
Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement."
                .into(),
            categorie: "NEWSLETTER".into(),
            variables: None,
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: Some(tu.id),
        })?;

        Ok(())
    }

    fn get_scpi_bulletin_template_id(&self) -> Result<i64> {
        self.ensure_scpi_bulletin_email_templates()?;
        self.conn.query_row(
            "SELECT id FROM templates_email WHERE nom = ?1",
            params![SCPI_BULLETIN_TEMPLATE_NOM],
            |row| row.get(0),
        )
    }

    fn matched_bulletins_for_contact(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
        bulletins: &[ScpiBulletinInput],
    ) -> Result<Vec<ScpiBulletinInput>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT TRIM(nom_produit) FROM investissements
             WHERE (contact_id = ?1 OR (?2 IS NOT NULL AND foyer_id = ?2))
               AND type_produit IN ('SCPI', 'SCPI_DEMEMBREMENT', 'SCPI_FISCALE')
               AND TRIM(nom_produit) != ''",
        )?;
        let noms: Vec<String> = stmt
            .query_map(params![contact_id, foyer_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut matched = Vec::new();
        for bulletin in bulletins {
            if noms
                .iter()
                .any(|nom| nom_produit_matches(nom, &bulletin.nom_produit))
            {
                matched.push(bulletin.clone());
            }
        }
        Ok(matched)
    }

    fn upsert_scpi_campaign_envoi(
        &self,
        contact_id: i64,
        template_id: i64,
        batch_key: &str,
        campaign_variables: &str,
        email_date_prevue: Option<i64>,
        now: i64,
    ) -> Result<&'static str> {
        let existing: Option<(i64, i64)> = self
            .conn
            .query_row(
                "SELECT id, email_envoye FROM contact_template_envois
                 WHERE contact_id = ?1 AND template_id = ?2 AND investissement_id IS NULL
                   AND COALESCE(campaign_batch_key, '') = ?3",
                params![contact_id, template_id, batch_key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        if let Some((id, sent)) = existing {
            if sent != 0 {
                return Ok("already_sent");
            }
            self.conn.execute(
                "UPDATE contact_template_envois SET
                    campaign_variables = ?1,
                    trigger_event_at = ?2,
                    email_date_prevue = ?3,
                    email_annule = 0,
                    email_suivi_ignore = 0
                 WHERE id = ?4",
                params![campaign_variables, now, email_date_prevue, id],
            )?;
            return Ok("updated");
        }

        self.conn.execute(
            "INSERT INTO contact_template_envois (
                contact_id, template_id, investissement_id, trigger_event_at,
                email_date_prevue, campaign_batch_key, campaign_variables
             ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)",
            params![
                contact_id,
                template_id,
                now,
                email_date_prevue,
                batch_key,
                campaign_variables
            ],
        )?;
        Ok("created")
    }

    pub fn prepare_scpi_bulletin_campaign(
        &self,
        input: PrepareScpiCampaignInput,
    ) -> Result<PrepareScpiCampaignResult> {
        let periode = input.periode.trim();
        if periode.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "periode obligatoire".into(),
            ));
        }
        if input.bulletins.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "bulletins vide".into(),
            ));
        }

        let template_id = self.get_scpi_bulletin_template_id()?;
        let batch_key = normalize_batch_key(periode);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut stmt = self.conn.prepare(
            "SELECT id, foyer_id, email FROM contacts
             WHERE categorie IN ('CLIENT', 'PROSPECT_CLIENT')",
        )?;
        let contacts: Vec<(i64, Option<i64>, Option<String>)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut contacts_matched = 0u64;
        let mut contacts_queued = 0u64;
        let mut contacts_no_email = 0u64;
        let mut contacts_skipped_already_sent = 0u64;

        for (contact_id, foyer_id, email) in contacts {
            let matched = self.matched_bulletins_for_contact(contact_id, foyer_id, &input.bulletins)?;
            if matched.is_empty() {
                continue;
            }
            contacts_matched += 1;

            let bulletin_resume = build_bulletin_resume(&matched, periode);
            let campaign_variables = serde_json::json!({
                "periode": periode,
                "bulletin_resume": bulletin_resume,
            })
            .to_string();

            let has_email = email
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .is_some();
            if !has_email {
                contacts_no_email += 1;
            }

            let email_date_prevue = Some(now);
            match self.upsert_scpi_campaign_envoi(
                contact_id,
                template_id,
                &batch_key,
                &campaign_variables,
                email_date_prevue,
                now,
            )? {
                "already_sent" => contacts_skipped_already_sent += 1,
                "created" | "updated" => {
                    if has_email {
                        contacts_queued += 1;
                    }
                }
                _ => {}
            }
        }

        let bulletins_count = input.bulletins.len();
        let message = format!(
            "Campagne {} : {} contact(s) cible(s), {} pret(s) a envoyer, {} sans email, {} deja envoye(s).",
            periode, contacts_matched, contacts_queued, contacts_no_email, contacts_skipped_already_sent
        );

        Ok(PrepareScpiCampaignResult {
            periode: periode.to_string(),
            batch_key,
            bulletins_count,
            contacts_matched,
            contacts_queued,
            contacts_no_email,
            contacts_skipped_already_sent,
            template_nom: SCPI_BULLETIN_TEMPLATE_NOM.to_string(),
            message,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewInvestissement};
    use crate::database::Database;

    fn mem_db() -> Database {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();
        let db = Database { conn };
        db.init_tables().unwrap();
        db
    }

    #[test]
    fn nom_produit_matches_fuzzy() {
        assert!(nom_produit_matches("SCPI Comète", "Comète"));
        assert!(nom_produit_matches("Comete", "Comète"));
        assert!(!nom_produit_matches("Primovie", "Comète"));
    }

    #[test]
    fn prepare_campaign_digest_one_mail_per_contact() {
        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                famille_id: None,
                foyer_id: None,
                role_foyer: None,
                role_famille: None,
                categorie: "CLIENT".into(),
                filleul_categorie: None,
                parrain_id: None,
                prescripteur_id: None,
                civilite: None,
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                email: Some("j.dupont@example.com".into()),
                telephone: None,
                adresse: None,
                code_postal: None,
                ville: None,
                pays: None,
                date_naissance: None,
                lieu_naissance: None,
                profession: None,
                situation_familiale: None,
                regime_matrimonial: None,
                revenus_annuels: None,
                charges_emprunts: None,
                epargne_precaution_souhaitee: None,
                objectifs_patrimoniaux: None,
                source_lead: None,
                profil_risque_sri: None,
                date_dernier_contact: None,
                date_prochain_suivi: None,
                date_dernier_contact_filleul: None,
                date_prochain_suivi_filleul: None,
                statut_suivi: None,
                registre: None,
                notes: None,
                famille_regroupement_exclu: None,
            })
            .unwrap()
            .id
            .expect("contact id");

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Primovie".into(),
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        let result = db
            .prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
                periode: "T1 2026".into(),
                bulletins: vec![
                    ScpiBulletinInput {
                        nom_produit: "Comète".into(),
                        summary_markdown: "Collecte 132 M€".into(),
                        fichier_source: None,
                    },
                    ScpiBulletinInput {
                        nom_produit: "Primovie".into(),
                        summary_markdown: "TD stable".into(),
                        fichier_source: None,
                    },
                ],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 1);

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![cid],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("Comète"));
        assert!(vars.contains("Primovie"));
        assert!(vars.contains("Collecte 132 M€"));

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![cid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
