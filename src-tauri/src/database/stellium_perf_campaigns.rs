//! Campagnes email performance AV/PER (relevé mensuel Stellium Contrats).

use super::birthdays::{is_contact_minor, type_produit_label};
use super::models::NewTemplateEmail;
use super::Database;
use rusqlite::{params, OptionalExtension, Result};
use serde::{Deserialize, Serialize};

pub const STELLIUM_PERF_TEMPLATE_NOM: &str = "Performance AV/PER Stellium";
pub const STELLIUM_PERF_TEMPLATE_TU_NOM: &str = "Performance AV/PER Stellium (tu)";
pub const STELLIUM_PERF_DIGEST_VERSION: i64 = 1;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareStelliumPerfCampaignInput {
    pub periode: String,
    pub releve_date_unix: i64,
    pub investissement_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareStelliumPerfCampaignResult {
    pub periode: String,
    pub batch_key: String,
    pub contacts_matched: u64,
    pub contacts_queued: u64,
    pub contacts_no_email: u64,
    pub contacts_proxy_to_parent: u64,
    pub contacts_skipped_already_sent: u64,
    pub message: String,
}

#[derive(Debug, Clone)]
struct ContractPerfLine {
    nom_produit: String,
    type_produit: String,
    numero_contrat: Option<String>,
    encours_centimes: i64,
    nets_centimes: Option<i64>,
    perf_euro_centimes: Option<i64>,
}

#[derive(Debug, Clone)]
struct BeneficiaryBundle {
    beneficiary_id: i64,
    beneficiary_prenom: String,
    beneficiary_nom: String,
    beneficiary_email: Option<String>,
    beneficiary_date_naissance: Option<i64>,
    beneficiary_foyer_id: Option<i64>,
    contracts: Vec<ContractPerfLine>,
}

fn normalize_batch_key(periode: &str) -> String {
    periode
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

fn format_euro_centimes(centimes: i64) -> String {
    let euros = centimes as f64 / 100.0;
    let has_cents = centimes.abs() % 100 != 0;
    if has_cents {
        format!("{euros:.2} €").replace('.', ",")
    } else {
        format!("{:.0} €", euros).replace('.', ",")
    }
}

fn format_perf_pct_label(perf_centimes: i64, nets_centimes: i64) -> Option<String> {
    if nets_centimes <= 0 {
        return None;
    }
    let pct = (perf_centimes as f64 / nets_centimes as f64) * 100.0;
    let sign = if pct >= 0.0 { "+" } else { "" };
    Some(format!("{sign}{:.2} %", pct).replace('.', ","))
}

fn perf_intro_phrases(count: usize, proxy: bool) -> (String, String) {
    if proxy {
        return (
            "Voici la performance Stellium des contrats de {{beneficiary_prenom}} ({{periode}}) :"
                .into(),
            "Voici la performance Stellium des contrats de {{beneficiary_prenom}} {{beneficiary_nom}} ({{periode}}) :"
                .into(),
        );
    }
    if count <= 1 {
        (
            "Voici la performance Stellium de ton contrat ({{periode}}) :".into(),
            "Voici la performance Stellium de votre contrat ({{periode}}) :".into(),
        )
    } else {
        (
            "Voici la performance Stellium de tes contrats ({{periode}}) :".into(),
            "Voici la performance Stellium de vos contrats ({{periode}}) :".into(),
        )
    }
}

fn build_contract_line_plain(c: &ContractPerfLine) -> String {
    let type_label = type_produit_label(&c.type_produit);
    let numero = c
        .numero_contrat
        .as_deref()
        .map(|n| format!(" (n° {n})"))
        .unwrap_or_default();
    let mut parts = vec![format!("Encours {}", format_euro_centimes(c.encours_centimes))];
    if let Some(nets) = c.nets_centimes {
        parts.push(format!("Nets versés {}", format_euro_centimes(nets)));
    }
    if let Some(perf) = c.perf_euro_centimes {
        let mut perf_label = format!("Performance {}", format_euro_centimes(perf));
        if let Some(nets) = c.nets_centimes {
            if let Some(pct) = format_perf_pct_label(perf, nets) {
                perf_label.push_str(&format!(" ({pct})"));
            }
        }
        parts.push(perf_label);
    }
    format!(
        "• {} — {type_label}{numero}\n  {}",
        c.nom_produit.trim(),
        parts.join(" · ")
    )
}

fn build_contract_line_html(c: &ContractPerfLine) -> String {
    let plain = build_contract_line_plain(c);
    let escaped = plain
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    format!(
        "<div style=\"line-height:1.5;margin:0 0 8px 0;padding:0\">{}</div>",
        escaped.replace('\n', "<br>")
    )
}

fn build_perf_resume(contracts: &[ContractPerfLine]) -> (String, String) {
    let plain = contracts
        .iter()
        .map(build_contract_line_plain)
        .collect::<Vec<_>>()
        .join("\n\n");
    let html = contracts
        .iter()
        .map(build_contract_line_html)
        .collect::<Vec<_>>()
        .join("");
    (plain, html)
}

fn build_campaign_variables_json(
    bundle: &BeneficiaryBundle,
    periode: &str,
    is_proxy: bool,
    prepared_at: i64,
) -> String {
    let count = bundle.contracts.len();
    let (intro_tu, intro_vous) = perf_intro_phrases(count, is_proxy);
    let (perf_resume, perf_resume_html) = build_perf_resume(&bundle.contracts);
    serde_json::json!({
        "periode": periode.trim(),
        "contrat_count": count,
        "perf_intro_tu": intro_tu,
        "perf_intro_vous": intro_vous,
        "perf_resume": perf_resume,
        "perf_resume_html": perf_resume_html,
        "beneficiary_prenom": bundle.beneficiary_prenom,
        "beneficiary_nom": bundle.beneficiary_nom,
        "is_proxy_for_minor": is_proxy,
        "prepared_at": prepared_at,
        "digest_version": STELLIUM_PERF_DIGEST_VERSION,
    })
    .to_string()
}

const STELLIUM_VOUS_CORPS_HTML: &str = r#"<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour {{prenom}} {{nom}},</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{perf_intro_vous}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{perf_resume_html}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">—</div><div style="line-height:1.5;margin:0;padding:0">Relevé informatif Stellium — se référer aux documents officiels de l'assureur. Ce message ne constitue pas un conseil en investissement.</div></div>"#;

const STELLIUM_TU_CORPS_HTML: &str = r#"<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour {{prenom}},</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{perf_intro_tu}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{perf_resume_html}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">—</div><div style="line-height:1.5;margin:0;padding:0">Relevé informatif Stellium — se référer aux documents officiels de l'assureur. Ce message ne constitue pas un conseil en investissement.</div></div>"#;

fn stellium_template_variables_json(corps_html: &str) -> String {
    serde_json::json!({
        "corps_html": corps_html,
        "stellium_perf_template_version": 1,
        "email_suivi_reponse": { "attendre_reponse": false },
        "email_relance": { "enabled": false },
    })
    .to_string()
}

fn stellium_vous_corps_plain() -> &'static str {
    "Bonjour {{prenom}} {{nom}},\n\n\
{{perf_intro_vous}}\n\n\
{{perf_resume}}\n\n\
---\n\
Relevé informatif Stellium — se référer aux documents officiels de l'assureur. Ce message ne constitue pas un conseil en investissement."
}

fn stellium_tu_corps_plain() -> &'static str {
    "Bonjour {{prenom}},\n\n\
{{perf_intro_tu}}\n\n\
{{perf_resume}}\n\n\
---\n\
Relevé informatif Stellium — se référer aux documents officiels de l'assureur. Ce message ne constitue pas un conseil en investissement."
}

fn contact_has_email(email: Option<&str>) -> bool {
    email.map(str::trim).filter(|s| !s.is_empty()).is_some()
}

impl Database {
    pub fn ensure_stellium_perf_email_templates(&self) -> Result<()> {
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![STELLIUM_PERF_TEMPLATE_NOM],
            |row| row.get(0),
        )?;
        if exists > 0 {
            return Ok(());
        }

        let tu = self.create_template_email(NewTemplateEmail {
            nom: STELLIUM_PERF_TEMPLATE_TU_NOM.into(),
            sujet: "Performance AV/PER — {{periode}}, {{beneficiary_prenom}} {{beneficiary_nom}}".into(),
            corps: stellium_tu_corps_plain().into(),
            categorie: "NEWSLETTER".into(),
            variables: Some(stellium_template_variables_json(STELLIUM_TU_CORPS_HTML)),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })?;

        let _vous = self.create_template_email(NewTemplateEmail {
            nom: STELLIUM_PERF_TEMPLATE_NOM.into(),
            sujet: "Performance AV/PER — {{periode}}, {{beneficiary_prenom}} {{beneficiary_nom}}".into(),
            corps: stellium_vous_corps_plain().into(),
            categorie: "NEWSLETTER".into(),
            variables: Some(stellium_template_variables_json(STELLIUM_VOUS_CORPS_HTML)),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: Some(tu.id),
        })?;

        Ok(())
    }

    fn get_stellium_perf_template_id(&self) -> Result<i64> {
        self.ensure_stellium_perf_email_templates()?;
        self.conn.query_row(
            "SELECT id FROM templates_email WHERE nom = ?1",
            params![STELLIUM_PERF_TEMPLATE_NOM],
            |row| row.get(0),
        )
    }

    fn load_stellium_contract_line(
        &self,
        investissement_id: i64,
        releve_date_unix: i64,
    ) -> Result<Option<ContractPerfLine>> {
        self.conn
            .query_row(
                "SELECT i.nom_produit, i.type_produit, i.numero_contrat,
                        v.montant, v.stellium_versements_nets_centimes, v.stellium_perf_euro_centimes
                 FROM investissements i
                 INNER JOIN investissement_valorisations v ON v.investissement_id = i.id
                 WHERE i.id = ?1
                   AND (v.stellium_versements_nets_centimes IS NOT NULL OR v.stellium_perf_euro_centimes IS NOT NULL)
                   AND ABS(v.date_valorisation - ?2) <= 86400
                 ORDER BY v.date_valorisation DESC, v.id DESC
                 LIMIT 1",
                params![investissement_id, releve_date_unix],
                |row| {
                    Ok(ContractPerfLine {
                        nom_produit: row.get(0)?,
                        type_produit: row.get(1)?,
                        numero_contrat: row.get(2)?,
                        encours_centimes: row.get(3)?,
                        nets_centimes: row.get(4)?,
                        perf_euro_centimes: row.get(5)?,
                    })
                },
            )
            .optional()
    }

    fn load_beneficiary_contact(
        &self,
        contact_id: i64,
    ) -> Result<(String, String, Option<String>, Option<i64>, Option<i64>)> {
        self.conn.query_row(
            "SELECT prenom, nom, email, date_naissance, foyer_id FROM contacts WHERE id = ?1",
            params![contact_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
    }

    fn load_foyer_parents_with_email(&self, foyer_id: i64) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM contacts
             WHERE foyer_id = ?1
               AND role_foyer IN ('DECLARANT_1', 'DECLARANT_2')
               AND email IS NOT NULL AND TRIM(email) != ''",
        )?;
        let rows = stmt
            .query_map(params![foyer_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn resolve_recipient_contact_ids(
        &self,
        bundle: &BeneficiaryBundle,
        releve_date_unix: i64,
    ) -> Result<Vec<(i64, bool)>> {
        if contact_has_email(bundle.beneficiary_email.as_deref()) {
            return Ok(vec![(bundle.beneficiary_id, false)]);
        }
        let minor = is_contact_minor(bundle.beneficiary_date_naissance, releve_date_unix);
        if !minor {
            return Ok(vec![(bundle.beneficiary_id, false)]);
        }
        let Some(foyer_id) = bundle.beneficiary_foyer_id else {
            return Ok(vec![(bundle.beneficiary_id, false)]);
        };
        let parents = self.load_foyer_parents_with_email(foyer_id)?;
        if parents.is_empty() {
            return Ok(vec![(bundle.beneficiary_id, false)]);
        }
        Ok(parents.into_iter().map(|id| (id, true)).collect())
    }

    fn upsert_stellium_perf_envoi(
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

    pub fn prepare_stellium_perf_campaign(
        &self,
        input: PrepareStelliumPerfCampaignInput,
    ) -> Result<PrepareStelliumPerfCampaignResult> {
        let periode = input.periode.trim();
        if periode.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "periode obligatoire".into(),
            ));
        }
        if input.investissement_ids.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "investissement_ids vide".into(),
            ));
        }

        let template_id = self.get_stellium_perf_template_id()?;
        let batch_base = normalize_batch_key(periode);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut bundles: std::collections::HashMap<i64, BeneficiaryBundle> =
            std::collections::HashMap::new();

        for investissement_id in &input.investissement_ids {
            let contact_id: Option<i64> = self
                .conn
                .query_row(
                    "SELECT contact_id FROM investissements WHERE id = ?1",
                    params![investissement_id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();
            let Some(beneficiary_id) = contact_id else {
                continue;
            };
            let contract = match self.load_stellium_contract_line(*investissement_id, input.releve_date_unix)? {
                Some(c) => c,
                None => continue,
            };
            let entry = bundles.entry(beneficiary_id).or_insert_with(|| {
                let (prenom, nom, email, date_naissance, foyer_id) =
                    self.load_beneficiary_contact(beneficiary_id)
                        .unwrap_or_else(|_| {
                            (
                                "Client".into(),
                                "CRM".into(),
                                None,
                                None,
                                None,
                            )
                        });
                BeneficiaryBundle {
                    beneficiary_id,
                    beneficiary_prenom: prenom,
                    beneficiary_nom: nom,
                    beneficiary_email: email,
                    beneficiary_date_naissance: date_naissance,
                    beneficiary_foyer_id: foyer_id,
                    contracts: Vec::new(),
                }
            });
            entry.contracts.push(contract);
        }

        let mut contacts_matched = 0u64;
        let mut contacts_queued = 0u64;
        let mut contacts_no_email = 0u64;
        let mut contacts_proxy_to_parent = 0u64;
        let mut contacts_skipped_already_sent = 0u64;

        for bundle in bundles.values() {
            if bundle.contracts.is_empty() {
                continue;
            }
            contacts_matched += 1;
            let recipients =
                self.resolve_recipient_contact_ids(bundle, input.releve_date_unix)?;
            for (recipient_id, is_proxy) in recipients {
                let batch_key = format!("{}-b{}", batch_base, bundle.beneficiary_id);
                let campaign_variables =
                    build_campaign_variables_json(bundle, periode, is_proxy, now);

                let (prenom, nom, email, _, _) =
                    self.load_beneficiary_contact(recipient_id).unwrap_or_else(|_| {
                        ("".into(), "".into(), None, None, None)
                    });
                let has_email = contact_has_email(email.as_deref());
                if !has_email {
                    contacts_no_email += 1;
                } else if is_proxy {
                    contacts_proxy_to_parent += 1;
                }

                let email_date_prevue = Some(now);
                match self.upsert_stellium_perf_envoi(
                    recipient_id,
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
                let _ = (prenom, nom);
            }
        }

        let message = format!(
            "Campagne perf {} : {} bénéficiaire(s), {} prêt(s) à envoyer, {} via parent(s), {} sans email, {} déjà envoyé(s).",
            periode,
            contacts_matched,
            contacts_queued,
            contacts_proxy_to_parent,
            contacts_no_email,
            contacts_skipped_already_sent
        );

        Ok(PrepareStelliumPerfCampaignResult {
            periode: periode.to_string(),
            batch_key: batch_base,
            contacts_matched,
            contacts_queued,
            contacts_no_email,
            contacts_proxy_to_parent,
            contacts_skipped_already_sent,
            message,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_perf_resume_aggregates_multiple_contracts() {
        let contracts = vec![
            ContractPerfLine {
                nom_produit: "Cristalliance Avenir".into(),
                type_produit: "ASSURANCE_VIE".into(),
                numero_contrat: Some("123".into()),
                encours_centimes: 100_000_00,
                nets_centimes: Some(90_000_00),
                perf_euro_centimes: Some(10_000_00),
            },
            ContractPerfLine {
                nom_produit: "Evoluvie".into(),
                type_produit: "PER".into(),
                numero_contrat: Some("456".into()),
                encours_centimes: 50_000_00,
                nets_centimes: Some(48_000_00),
                perf_euro_centimes: Some(2_000_00),
            },
        ];
        let (plain, html) = build_perf_resume(&contracts);
        assert!(plain.contains("Cristalliance Avenir"));
        assert!(plain.contains("Evoluvie"));
        assert!(html.contains("Performance"));
    }

    #[test]
    fn prepare_campaign_groups_multi_contract_and_routes_minor_to_parent() {
        use crate::database::models::{NewContact, NewFoyer, NewInvestissement, NewInvestissementValorisation};

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
                epargne_precaution_souhaitee: None,
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
            }
        }

        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

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

        let parent = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("parent@example.com".into()),
                ..sample_client("DUPONT", "Marie")
            })
            .unwrap()
            .id
            .unwrap();

        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: None,
                date_naissance: Some("2015-06-01T00:00:00.000Z".into()),
                ..sample_client("DUPONT", "Lucas")
            })
            .unwrap()
            .id
            .unwrap();

        let mut inv_ids = Vec::new();
        for (nom, num) in [("AV 1", "111"), ("AV 2", "222")] {
            let inv = db
                .create_investissement(NewInvestissement {
                    contact_id: Some(enfant),
                    foyer_id: None,
                    type_produit: "ASSURANCE_VIE".into(),
                    partenaire_id: None,
                    nom_produit: nom.into(),
                    numero_contrat: Some(num.into()),
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
                investissement_id: inv,
                montant: 1_050_000,
                date_valorisation: Some("2026-06-19T00:00:00.000Z".into()),
                notes: Some("Import Stellium contrats".into()),
                stellium_versements_nets_centimes: Some(1_000_000),
                stellium_perf_euro_centimes: Some(50_000),
            })
            .unwrap();
            inv_ids.push(inv);
        }

        let releve: i64 = db
            .conn
            .query_row(
                "SELECT date_valorisation FROM investissement_valorisations WHERE investissement_id = ?1",
                params![inv_ids[0]],
                |row| row.get(0),
            )
            .unwrap();

        let result = db
            .prepare_stellium_perf_campaign(PrepareStelliumPerfCampaignInput {
                periode: "Juin 2026".into(),
                releve_date_unix: releve,
                investissement_ids: inv_ids,
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 1);
        assert_eq!(result.contacts_proxy_to_parent, 1);

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("AV 1"));
        assert!(vars.contains("AV 2"));
        assert!(vars.contains("\"is_proxy_for_minor\":true"));
    }
}
