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
    /// Chemin source n8n (audit / traçabilité, non requis pour le matching).
    #[serde(default)]
    #[allow(dead_code)]
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

/// SCPI rattachées au foyer (`foyer_id`) : visibles par les adultes du foyer, pas par les enfants.
/// Les SCPI au nom du contact (`contact_id`) restent éligibles pour tout le monde, y compris un enfant.
pub fn contact_inherits_foyer_scpi_investments(role_foyer: Option<&str>) -> bool {
    !matches!(
        role_foyer.map(str::trim).filter(|s| !s.is_empty()),
        Some("ENFANT")
    )
}

const MIN_PRODUIT_MATCH_LEN: usize = 4;

fn produit_tokens(value: &str) -> Vec<String> {
    value
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(|s| normalize_match_key(s))
        .filter(|s| s.len() >= MIN_PRODUIT_MATCH_LEN)
        .collect()
}

fn nom_produit_matches(investissement_nom: &str, bulletin_key: &str) -> bool {
    let key_norm = normalize_match_key(bulletin_key);
    if key_norm.len() < MIN_PRODUIT_MATCH_LEN {
        return false;
    }
    let inv_norm = normalize_match_key(investissement_nom);
    if inv_norm == key_norm {
        return true;
    }
    let bulletin_tokens = produit_tokens(bulletin_key);
    if bulletin_tokens.is_empty() {
        return false;
    }
    let inv_tokens = produit_tokens(investissement_nom);
    bulletin_tokens
        .iter()
        .all(|bt| inv_tokens.iter().any(|it| it == bt))
}

fn build_bulletin_resume(bulletins: &[ScpiBulletinInput], _periode: &str) -> String {
    if bulletins.is_empty() {
        return String::new();
    }
    if bulletins.len() == 1 {
        return bulletins[0].summary_markdown.trim().to_string();
    }
    bulletins
        .iter()
        .map(|b| {
            format!(
                "## {}\n\n{}",
                b.nom_produit.trim(),
                b.summary_markdown.trim()
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
}

fn scpi_intro_phrases(count: usize) -> (String, String) {
    if count <= 1 {
        (
            "Voici les points clés du bulletin trimestriel de ta SCPI".into(),
            "Voici les points clés du bulletin trimestriel de votre SCPI".into(),
        )
    } else {
        (
            "Voici les points clés des bulletins trimestriels de tes SCPI".into(),
            "Voici les points clés des bulletins trimestriels de vos SCPI".into(),
        )
    }
}

fn build_scpi_campaign_variables_json(bulletins: &[ScpiBulletinInput], periode: &str) -> String {
    let count = bulletins.len();
    let (intro_tu, intro_vous) = scpi_intro_phrases(count);
    let bulletin_resume = build_bulletin_resume(bulletins, periode);
    serde_json::json!({
        "periode": periode.trim(),
        "scpi_count": count,
        "scpi_intro_tu": intro_tu,
        "scpi_intro_vous": intro_vous,
        "bulletin_resume": bulletin_resume,
    })
    .to_string()
}

const SCPI_TEMPLATE_VERSION: i64 = 4;

const SCPI_VOUS_CORPS_HTML: &str = r#"<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour {{prenom}} {{nom}},</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{scpi_intro_vous}} (<strong>{{periode}}</strong>) :</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{bulletin_resume_html}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">—</div><div style="line-height:1.5;margin:0;padding:0">Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement.</div></div>"#;

const SCPI_TU_CORPS_HTML: &str = r#"<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour {{prenom}},</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{scpi_intro_tu}} (<strong>{{periode}}</strong>) :</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{bulletin_resume_html}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">—</div><div style="line-height:1.5;margin:0;padding:0">Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement.</div></div>"#;

fn scpi_template_variables_json(corps_html: &str) -> String {
    serde_json::json!({
        "corps_html": corps_html,
        "scpi_template_version": SCPI_TEMPLATE_VERSION,
        "email_suivi_reponse": { "attendre_reponse": false },
        "email_relance": { "enabled": false },
    })
    .to_string()
}

fn scpi_template_needs_upgrade(variables: Option<&str>) -> bool {
    let Some(raw) = variables.filter(|s| !s.trim().is_empty()) else {
        return true;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(raw) else {
        return true;
    };
    if parsed
        .get("scpi_template_user_customized")
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        return false;
    }
    let corps_html = parsed.get("corps_html").and_then(|v| v.as_str());
    if corps_html.map(str::trim).filter(|s| !s.is_empty()).is_none() {
        return true;
    }
    parsed
        .get("scpi_template_version")
        .and_then(|v| v.as_i64())
        .unwrap_or(0)
        < SCPI_TEMPLATE_VERSION
}

fn scpi_vous_corps_plain() -> &'static str {
    "Bonjour {{prenom}} {{nom}},\n\n\
{{scpi_intro_vous}} ({{periode}}) :\n\n\
{{bulletin_resume}}\n\n\
---\n\
Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement."
}

fn scpi_tu_corps_plain() -> &'static str {
    "Bonjour {{prenom}},\n\n\
{{scpi_intro_tu}} ({{periode}}) :\n\n\
{{bulletin_resume}}\n\n\
---\n\
Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement."
}

impl Database {
    pub fn migrate_scpi_campaign_envois(&self) -> Result<()> {
        let mut needs_index = false;
        if !self.table_has_column("contact_template_envois", "campaign_batch_key")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN campaign_batch_key TEXT",
                [],
            )?;
            println!("✅ Migration: campaign_batch_key sur contact_template_envois");
            needs_index = true;
        }
        if !self.table_has_column("contact_template_envois", "campaign_variables")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN campaign_variables TEXT",
                [],
            )?;
            println!("✅ Migration: campaign_variables sur contact_template_envois");
            needs_index = true;
        }
        if needs_index {
            self.recreate_scpi_campaign_unique_index()?;
        }
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![SCPI_BULLETIN_TEMPLATE_NOM],
            |row| row.get(0),
        )?;
        if exists > 0 {
            self.upgrade_scpi_bulletin_email_templates()?;
        }
        Ok(())
    }

    fn recreate_scpi_campaign_unique_index(&self) -> Result<()> {
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

    fn upgrade_scpi_bulletin_email_templates(&self) -> Result<()> {
        let tu_row: Option<(i64, Option<String>)> = self
            .conn
            .query_row(
                "SELECT id, variables FROM templates_email WHERE nom = ?1",
                params![SCPI_BULLETIN_TEMPLATE_TU_NOM],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        let vous_row: Option<(i64, Option<String>, Option<i64>)> = self
            .conn
            .query_row(
                "SELECT id, variables, tutoiement_template_id FROM templates_email WHERE nom = ?1",
                params![SCPI_BULLETIN_TEMPLATE_NOM],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        let Some((vous_id, vous_vars, tu_link)) = vous_row else {
            return Ok(());
        };

        let tu_id = if let Some((id, tu_vars)) = tu_row {
            if scpi_template_needs_upgrade(tu_vars.as_deref()) {
                self.conn.execute(
                    "UPDATE templates_email SET sujet = ?1, corps = ?2, variables = ?3, updated_at = unixepoch()
                     WHERE id = ?4",
                    params![
                        "Tes bulletins SCPI — {{periode}}, {{prenom}}",
                        scpi_tu_corps_plain(),
                        scpi_template_variables_json(SCPI_TU_CORPS_HTML),
                        id
                    ],
                )?;
            }
            Some(id)
        } else {
            let tu = self.create_template_email(NewTemplateEmail {
                nom: SCPI_BULLETIN_TEMPLATE_TU_NOM.into(),
                sujet: "Tes bulletins SCPI — {{periode}}, {{prenom}}".into(),
                corps: scpi_tu_corps_plain().into(),
                categorie: "NEWSLETTER".into(),
                variables: Some(scpi_template_variables_json(SCPI_TU_CORPS_HTML)),
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })?;
            Some(tu.id)
        };

        if scpi_template_needs_upgrade(vous_vars.as_deref()) {
            self.conn.execute(
                "UPDATE templates_email SET sujet = ?1, corps = ?2, variables = ?3,
                    tutoiement_template_id = ?4, updated_at = unixepoch()
                 WHERE id = ?5",
                params![
                    "Vos bulletins SCPI — {{periode}}, {{prenom}}",
                    scpi_vous_corps_plain(),
                    scpi_template_variables_json(SCPI_VOUS_CORPS_HTML),
                    tu_id,
                    vous_id
                ],
            )?;
            println!("✅ Modèle Bulletin SCPI trimestriel mis à jour (HTML + variables)");
        } else if tu_link.is_none() {
            if let Some(tu_id) = tu_id {
                self.conn.execute(
                    "UPDATE templates_email SET tutoiement_template_id = ?1, updated_at = unixepoch()
                     WHERE id = ?2",
                    params![tu_id, vous_id],
                )?;
            }
        }
        Ok(())
    }

    pub fn ensure_scpi_bulletin_email_templates(&self) -> Result<()> {
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![SCPI_BULLETIN_TEMPLATE_NOM],
            |row| row.get(0),
        )?;
        if exists > 0 {
            return self.upgrade_scpi_bulletin_email_templates();
        }

        let tu = self.create_template_email(NewTemplateEmail {
            nom: SCPI_BULLETIN_TEMPLATE_TU_NOM.into(),
            sujet: "Tes bulletins SCPI — {{periode}}, {{prenom}}".into(),
            corps: scpi_tu_corps_plain().into(),
            categorie: "NEWSLETTER".into(),
            variables: Some(scpi_template_variables_json(SCPI_TU_CORPS_HTML)),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })?;

        let _vous = self.create_template_email(NewTemplateEmail {
            nom: SCPI_BULLETIN_TEMPLATE_NOM.into(),
            sujet: "Vos bulletins SCPI — {{periode}}, {{prenom}}".into(),
            corps: scpi_vous_corps_plain().into(),
            categorie: "NEWSLETTER".into(),
            variables: Some(scpi_template_variables_json(SCPI_VOUS_CORPS_HTML)),
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
        role_foyer: Option<&str>,
        bulletins: &[ScpiBulletinInput],
    ) -> Result<Vec<ScpiBulletinInput>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT TRIM(nom_produit) FROM investissements
             WHERE contact_id = ?1
               AND type_produit IN ('SCPI', 'SCPI_DEMEMBREMENT', 'SCPI_FISCALE')
               AND TRIM(nom_produit) != ''",
        )?;
        let mut noms: Vec<String> = stmt
            .query_map(params![contact_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if contact_inherits_foyer_scpi_investments(role_foyer) {
            if let Some(fid) = foyer_id {
                let mut foyer_stmt = self.conn.prepare(
                    "SELECT DISTINCT TRIM(nom_produit) FROM investissements
                     WHERE foyer_id = ?1
                       AND type_produit IN ('SCPI', 'SCPI_DEMEMBREMENT', 'SCPI_FISCALE')
                       AND TRIM(nom_produit) != ''",
                )?;
                let foyer_noms: Vec<String> = foyer_stmt
                    .query_map(params![fid], |row| row.get(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                for nom in foyer_noms {
                    if !noms.iter().any(|existing| existing == &nom) {
                        noms.push(nom);
                    }
                }
            }
        }

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
            // n8n prepare = rafraîchissement campagne trimestre : remet en file même
            // après Retiré ou « Ne plus proposer » (comme un nouveau cycle de préparation).
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
            "SELECT id, foyer_id, email, role_foyer FROM contacts
             WHERE categorie IN ('CLIENT', 'PROSPECT_CLIENT')",
        )?;
        let contacts: Vec<(i64, Option<i64>, Option<String>, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut contacts_matched = 0u64;
        let mut contacts_queued = 0u64;
        let mut contacts_no_email = 0u64;
        let mut contacts_skipped_already_sent = 0u64;

        for (contact_id, foyer_id, email, role_foyer) in contacts {
            let matched = self.matched_bulletins_for_contact(
                contact_id,
                foyer_id,
                role_foyer.as_deref(),
                &input.bulletins,
            )?;
            if matched.is_empty() {
                continue;
            }
            contacts_matched += 1;

            let campaign_variables = build_scpi_campaign_variables_json(&matched, periode);

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
    fn build_bulletin_resume_single_omits_product_header() {
        let bulletins = vec![ScpiBulletinInput {
            nom_produit: "Comète".into(),
            summary_markdown: "2. Chiffres clés\n- Collecte : 132 M€".into(),
            fichier_source: None,
        }];
        let resume = build_bulletin_resume(&bulletins, "T1 2026");
        assert!(!resume.contains("## Comète"));
        assert!(resume.contains("2. Chiffres clés"));
    }

    #[test]
    fn scpi_intro_singular_vs_plural() {
        let (tu, vous) = scpi_intro_phrases(1);
        assert!(tu.contains("ta SCPI"));
        assert!(vous.contains("votre SCPI"));
        assert!(!tu.contains("tes SCPI"));
        let (tu2, vous2) = scpi_intro_phrases(2);
        assert!(tu2.contains("tes SCPI"));
        assert!(vous2.contains("vos SCPI"));
    }

    #[test]
    fn scpi_template_user_customized_blocks_upgrade() {
        let vars = r#"{"corps_html":"<p>x</p>","scpi_template_version":1,"scpi_template_user_customized":true}"#;
        assert!(!scpi_template_needs_upgrade(Some(vars)));
    }

    #[test]
    fn nom_produit_matches_fuzzy() {
        assert!(nom_produit_matches("SCPI Comète", "Comète"));
        assert!(nom_produit_matches("Comete", "Comète"));
        assert!(nom_produit_matches("Corum Origin", "Corum"));
        assert!(!nom_produit_matches("Primovie", "Comète"));
        assert!(!nom_produit_matches("Primovie", "Vie"));
        assert!(!nom_produit_matches("Primovie", "vie"));
    }

    #[test]
    fn contact_inherits_foyer_scpi_investments_excludes_enfant() {
        assert!(contact_inherits_foyer_scpi_investments(Some("DECLARANT_1")));
        assert!(contact_inherits_foyer_scpi_investments(Some("DECLARANT_2")));
        assert!(contact_inherits_foyer_scpi_investments(Some("AUTRE")));
        assert!(contact_inherits_foyer_scpi_investments(None));
        assert!(!contact_inherits_foyer_scpi_investments(Some("ENFANT")));
    }

    #[test]
    fn prepare_campaign_excludes_enfants_from_foyer_scpi() {
        use crate::database::models::{NewContact, NewFoyer, NewInvestissement};

        fn sample_client(nom: &str, prenom: &str) -> NewContact {
            NewContact {
                categorie: "CLIENT".into(),
                nom: nom.into(),
                prenom: prenom.into(),
                statut_suivi: Some("ACTIF".into()),
                famille_id: None,
                foyer_id: None,
                role_foyer: None,
                role_famille: None,
                filleul_categorie: None,
                parrain_id: None,
                prescripteur_id: None,
                civilite: None,
                email: None,
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
                objectifs_patrimoniaux: None,
                source_lead: None,
                profil_risque_sri: None,
                date_dernier_contact: None,
                date_prochain_suivi: None,
                date_dernier_contact_filleul: None,
                date_prochain_suivi_filleul: None,
                notes: None,
                registre: None,
                famille_regroupement_exclu: None,
                epargne_precaution_souhaitee: None,
            }
        }

        let db = mem_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer MARTIN".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let parent1 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("amandine@example.com".into()),
                ..sample_client("MARTIN", "Amandine")
            })
            .unwrap()
            .id
            .unwrap();
        let parent2 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_2".into()),
                email: Some("tony@example.com".into()),
                ..sample_client("MARTIN", "Tony")
            })
            .unwrap()
            .id
            .unwrap();
        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: Some("enfant@example.com".into()),
                ..sample_client("MARTIN", "Lucas")
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
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

        let result = db
            .prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
                periode: "T1 2026".into(),
                bulletins: vec![ScpiBulletinInput {
                    nom_produit: "Comète".into(),
                    summary_markdown: "Collecte stable".into(),
                    fichier_source: None,
                }],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 2);
        assert_eq!(result.contacts_queued, 2);

        let queued: Vec<i64> = db
            .conn
            .prepare(
                "SELECT contact_id FROM contact_template_envois
                 WHERE COALESCE(campaign_batch_key, '') != ''",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(queued.contains(&parent1));
        assert!(queued.contains(&parent2));
        assert!(!queued.contains(&enfant));
    }

    #[test]
    fn prepare_campaign_includes_enfant_with_personal_scpi() {
        use crate::database::models::{NewContact, NewFoyer, NewInvestissement};

        let db = mem_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer DUPONT".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: Some("lucas@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Lucas".into(),
                statut_suivi: Some("ACTIF".into()),
                famille_id: None,
                role_famille: None,
                filleul_categorie: None,
                parrain_id: None,
                prescripteur_id: None,
                civilite: None,
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
                registre: None,
                notes: None,
                famille_regroupement_exclu: None,
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
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
            contact_id: Some(enfant),
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
                        summary_markdown: "Parents".into(),
                        fichier_source: None,
                    },
                    ScpiBulletinInput {
                        nom_produit: "Primovie".into(),
                        summary_markdown: "Lucas".into(),
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
                params![enfant],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("Lucas"));
        assert!(!vars.contains("Parents"));
        assert!(vars.contains("\"scpi_count\":1"));
    }

    #[test]
    fn prepare_campaign_restores_retired_or_dismissed_on_n8n_rerun() {
        use crate::database::models::{NewContact, NewInvestissement};

        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "CARNEROS".into(),
                prenom: "Patrick".into(),
                statut_suivi: Some("ACTIF".into()),
                famille_id: None,
                foyer_id: None,
                role_foyer: None,
                role_famille: None,
                filleul_categorie: None,
                parrain_id: None,
                prescripteur_id: None,
                civilite: None,
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
                registre: None,
                notes: None,
                famille_regroupement_exclu: None,
            })
            .unwrap()
            .id
            .unwrap();

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

        let input = PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "V1".into(),
                fichier_source: None,
            }],
        };
        db.prepare_scpi_bulletin_campaign(input.clone()).unwrap();
        let row_id = db.get_etiquette_email_queue("ready").unwrap()[0].contact_etiquette_id;

        db.cancel_pending_email_campaign(row_id, Some("template"))
            .unwrap();
        db.dismiss_cancelled_pending_email_campaign(row_id, Some("template"))
            .unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());
        assert!(db.get_etiquette_email_queue("cancelled").unwrap().is_empty());

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "V2 trimestre".into(),
                fichier_source: None,
            }],
        })
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].contact_id, cid);
        assert!(ready[0].campaign_variables.as_deref().unwrap_or("").contains("V2 trimestre"));
    }

    #[test]
    fn prepare_new_period_after_dismiss_requeues_contact() {
        use crate::database::models::{NewContact, NewInvestissement};

        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("patrick@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "CARNEROS".into(),
                prenom: "Patrick".into(),
                statut_suivi: Some("ACTIF".into()),
                famille_id: None,
                foyer_id: None,
                role_foyer: None,
                role_famille: None,
                filleul_categorie: None,
                parrain_id: None,
                prescripteur_id: None,
                civilite: None,
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
                registre: None,
                notes: None,
                famille_regroupement_exclu: None,
            })
            .unwrap()
            .id
            .unwrap();

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

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "Digest T1".into(),
                fichier_source: None,
            }],
        })
        .unwrap();
        let t1_row = db.get_etiquette_email_queue("ready").unwrap()[0].contact_etiquette_id;
        db.cancel_pending_email_campaign(t1_row, Some("template"))
            .unwrap();
        db.dismiss_cancelled_pending_email_campaign(t1_row, Some("template"))
            .unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T2 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "Digest T2".into(),
                fichier_source: None,
            }],
        })
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].contact_id, cid);
        assert!(ready[0]
            .campaign_variables
            .as_deref()
            .unwrap_or("")
            .contains("Digest T2"));

        let row_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![cid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(row_count, 2);
    }

    #[test]
    fn scpi_sent_envoi_excluded_from_sent_and_followup_queues() {
        use crate::database::models::{NewContact, NewInvestissement};

        let db = mem_db();
        db.ensure_scpi_bulletin_email_templates().unwrap();
        let tpl_vars: String = db
            .conn
            .query_row(
                "SELECT variables FROM templates_email WHERE nom = ?1",
                params![SCPI_BULLETIN_TEMPLATE_NOM],
                |row| row.get(0),
            )
            .unwrap();
        assert!(tpl_vars.contains("\"attendre_reponse\":false"));

        let cid = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                statut_suivi: Some("ACTIF".into()),
                famille_id: None,
                foyer_id: None,
                role_foyer: None,
                role_famille: None,
                filleul_categorie: None,
                parrain_id: None,
                prescripteur_id: None,
                civilite: None,
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
                registre: None,
                notes: None,
                famille_regroupement_exclu: None,
            })
            .unwrap()
            .id
            .unwrap();

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

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "Digest".into(),
                fichier_source: None,
            }],
        })
        .unwrap();
        let row_id = db.get_etiquette_email_queue("ready").unwrap()[0].contact_etiquette_id;
        db.mark_template_email_sent(row_id, None, None, Some("Sujet"), None, None, None)
            .unwrap();

        assert!(db.get_etiquette_email_queue("sent").unwrap().is_empty());
        assert!(db.get_etiquette_email_queue("followup").unwrap().is_empty());
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
        assert!(vars.contains("scpi_intro_tu"));
        assert!(vars.contains("tes SCPI"));

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
