//! Modèles d'e-mails (CRUD + modèles par défaut). Extrait de `operations.rs`.
//!
//! La file d'envoi et les relances vivent dans `template_email_queue.rs` /
//! `template_email_relance.rs`.

use rusqlite::{params, Result};

/// Visibilité bibliothèque Modèles email : éphémères archivées et variantes liées (tu / relance).
const TEMPLATE_EMAIL_LIBRARY_VISIBLE_WHERE: &str = "
    NOT (
        COALESCE(json_extract(variables, '$.is_ephemeral'), 0) = 1
        AND COALESCE(json_extract(variables, '$.ephemeral_campaign.status'), '') = 'archived'
    )
    AND id NOT IN (
        SELECT p.tutoiement_template_id FROM templates_email p
        WHERE p.tutoiement_template_id IS NOT NULL
          AND COALESCE(json_extract(p.variables, '$.is_ephemeral'), 0) = 1
        UNION ALL
        SELECT p.relance_template_id FROM templates_email p
        WHERE p.relance_template_id IS NOT NULL
          AND COALESCE(json_extract(p.variables, '$.is_ephemeral'), 0) = 1
        UNION ALL
        SELECT r.tutoiement_template_id FROM templates_email p
        INNER JOIN templates_email r ON r.id = p.relance_template_id
        WHERE r.tutoiement_template_id IS NOT NULL
          AND COALESCE(json_extract(p.variables, '$.is_ephemeral'), 0) = 1
        UNION ALL
        SELECT tu.id FROM templates_email tu
        INNER JOIN templates_email p
          ON trim(p.nom) = trim(substr(tu.nom, 1, length(tu.nom) - 5))
        WHERE tu.nom LIKE '% (tu)'
          AND COALESCE(json_extract(p.variables, '$.is_ephemeral'), 0) = 1
          AND NOT EXISTS (
            SELECT 1 FROM templates_email linked
            WHERE linked.tutoiement_template_id = tu.id
          )
    )";

/// Ids des modèles enfants Pipe RDV rangés dans la méta du parent.
const PIPE_CHILD_ID_PATHS: [(&str, &str); 4] = [
    ("pipe_rdv_reminder", "reminder_template_id"),
    ("pipe_rdv_reminder", "reminder_tutoiement_template_id"),
    ("pipe_rdv_follow_up", "follow_up_template_id"),
    ("pipe_rdv_follow_up", "follow_up_tutoiement_template_id"),
];

impl super::Database {
    fn map_template_email_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<super::models::TemplateEmail> {
        Ok(super::models::TemplateEmail {
            id: row.get(0)?,
            nom: row.get(1)?,
            sujet: row.get(2)?,
            corps: row.get(3)?,
            categorie: row.get(4)?,
            variables: row.get(5)?,
            agenda_link_id: row.get(6)?,
            relance_template_id: row.get(7)?,
            tutoiement_template_id: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    }

    pub fn get_all_templates_email(&self) -> Result<Vec<super::models::TemplateEmail>> {
        let sql = format!(
            "SELECT id, nom, sujet, corps, categorie, variables, agenda_link_id, relance_template_id, tutoiement_template_id, created_at, updated_at
             FROM templates_email
             WHERE {TEMPLATE_EMAIL_LIBRARY_VISIBLE_WHERE}
             ORDER BY created_at DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;

        let templates = stmt.query_map([], Self::map_template_email_row)?;

        let mut result = Vec::new();
        for template in templates {
            result.push(template?);
        }
        Ok(result)
    }

    pub fn create_template_email(
        &self,
        template: super::models::NewTemplateEmail,
    ) -> Result<super::models::TemplateEmail> {
        self.conn.execute(
            "INSERT INTO templates_email (nom, sujet, corps, categorie, variables, agenda_link_id, relance_template_id, tutoiement_template_id) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &template.nom,
                &template.sujet,
                &template.corps,
                &template.categorie,
                &template.variables,
                &template.agenda_link_id,
                &template.relance_template_id,
                &template.tutoiement_template_id,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_template_email_by_id(id)
    }

    pub fn get_template_email_by_id(&self, id: i64) -> Result<super::models::TemplateEmail> {
        self.conn.query_row(
            "SELECT id, nom, sujet, corps, categorie, variables, agenda_link_id, relance_template_id, tutoiement_template_id, created_at, updated_at
             FROM templates_email 
             WHERE id = ?1",
            params![id],
            Self::map_template_email_row,
        )
    }

    pub fn update_template_email(
        &self,
        id: i64,
        template: &super::models::NewTemplateEmail,
    ) -> Result<super::models::TemplateEmail> {
        if template.relance_template_id == Some(id) {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le template de relance ne peut pas être le modèle lui-même".into(),
            ));
        }
        if template.tutoiement_template_id == Some(id) {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le modèle tutoiement lié ne peut pas être le modèle lui-même".into(),
            ));
        }
        self.conn.execute(
            "UPDATE templates_email SET 
                nom = ?1,
                sujet = ?2,
                corps = ?3,
                categorie = ?4,
                variables = ?5,
                agenda_link_id = ?6,
                relance_template_id = ?7,
                tutoiement_template_id = ?8,
                updated_at = unixepoch()
            WHERE id = ?9",
            params![
                &template.nom,
                &template.sujet,
                &template.corps,
                &template.categorie,
                &template.variables,
                &template.agenda_link_id,
                &template.relance_template_id,
                &template.tutoiement_template_id,
                id
            ],
        )?;

        let _ = self.resync_pending_template_envois_for_template(id)?;
        let _ = self.purge_excluded_template_trigger_envois(id)?;
        let _ = self.sync_template_email_trigger_for_all_contacts(id)?;

        self.get_template_email_by_id(id)
    }

    /// Supprime un modèle auxiliaire (tu / relance) sans contrôle éphémère.
    /// Modèle de RELANCE supprimé : les relances préparées qui l'utilisaient repartiraient avec le
    /// texte du 1er mail. Elles sont ignorées (l'envoi parti reste suivi, WhatsApp possible).
    /// À appeler AVANT de retirer le lien `relance_template_id` des modèles parents.
    fn skip_prepared_relances_using_template(&self, relance_template_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_template_envois SET email_envoye = 1, email_relance_active = 0,
                email_date_prevue = NULL, relance_email_skipped_at = unixepoch()
             WHERE email_envoye = 0 AND COALESCE(email_relance_active, 0) = 1
               AND template_id IN (SELECT id FROM templates_email WHERE relance_template_id = ?1)",
            params![relance_template_id],
        )?;
        self.conn.execute(
            "UPDATE contact_etiquettes SET email_envoye = 1, email_relance_active = 0,
                email_date_prevue = NULL, relance_email_skipped_at = unixepoch()
             WHERE email_envoye = 0 AND COALESCE(email_relance_active, 0) = 1
               AND etiquette_id IN (
                 SELECT e.id FROM etiquettes e
                 INNER JOIN templates_email t ON t.id = e.email_template_id
                 WHERE t.relance_template_id = ?1
               )",
            params![relance_template_id],
        )?;
        Ok(())
    }

    pub(crate) fn delete_auxiliary_template_email(&self, id: i64) -> Result<()> {
        self.skip_prepared_relances_using_template(id)?;
        self.conn.execute(
            "UPDATE templates_email SET relance_template_id = NULL WHERE relance_template_id = ?1",
            params![id],
        )?;
        self.conn.execute(
            "UPDATE templates_email SET tutoiement_template_id = NULL WHERE tutoiement_template_id = ?1",
            params![id],
        )?;
        self.conn
            .execute("DELETE FROM templates_email WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Modèles enfants : variante tu, relance dédiée (et sa variante tu), rappel / suivi Pipe RDV
    /// (et leurs variantes tu).
    pub(crate) fn template_child_ids(&self, tpl: &super::models::TemplateEmail) -> Vec<i64> {
        let mut ids: Vec<i64> = Vec::new();
        ids.extend(tpl.tutoiement_template_id);
        if let Some(rel_id) = tpl.relance_template_id {
            ids.push(rel_id);
            if let Ok(rel) = self.get_template_email_by_id(rel_id) {
                ids.extend(rel.tutoiement_template_id);
            }
        }
        if let Some(meta) = tpl
            .variables
            .as_deref()
            .and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok())
        {
            for (key, field) in PIPE_CHILD_ID_PATHS {
                if let Some(id) = meta.get(key).and_then(|o| o.get(field)).and_then(|v| v.as_i64()) {
                    ids.push(id);
                }
            }
        }
        ids.retain(|id| *id > 0 && *id != tpl.id);
        ids.dedup();
        ids
    }

    /// Modèle encore utilisé : relié à un autre modèle (tu, relance, Pipe RDV) ou à une étiquette.
    fn template_still_referenced(&self, id: i64) -> Result<bool> {
        let by_column: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM templates_email
                           WHERE tutoiement_template_id = ?1 OR relance_template_id = ?1)
                 OR EXISTS(SELECT 1 FROM etiquettes WHERE email_template_id = ?1)
                 -- Rappel / suivi RDV déjà planifié avec ce message : il doit pouvoir partir.
                 OR EXISTS(SELECT 1 FROM pipe_rdv_scheduled_emails
                           WHERE template_id = ?1 AND sent_at IS NULL AND cancelled_at IS NULL)",
            params![id],
            |row| row.get(0),
        )?;
        if by_column {
            return Ok(true);
        }
        let mut stmt = self.conn.prepare(
            "SELECT variables FROM templates_email
             WHERE variables LIKE '%pipe_rdv_reminder%' OR variables LIKE '%pipe_rdv_follow_up%'",
        )?;
        let variables = stmt
            .query_map([], |row| row.get::<_, Option<String>>(0))?
            .collect::<Result<Vec<_>>>()?;
        Ok(variables.iter().flatten().any(|raw| {
            serde_json::from_str::<serde_json::Value>(raw)
                .ok()
                .is_some_and(|meta| {
                    PIPE_CHILD_ID_PATHS.iter().any(|(key, field)| {
                        meta.get(key).and_then(|o| o.get(field)).and_then(|v| v.as_i64())
                            == Some(id)
                    })
                })
        }))
    }

    /// Variantes détachées d'un modèle (tu désactivé, relance revenue au même message, Pipe coupé,
    /// modèle parent supprimé) : supprimées si plus rien ne les utilise, pour ne pas réapparaître
    /// comme modèles « fantômes ». Retourne les ids supprimés.
    pub fn delete_detached_template_children(&self, candidates: &[i64]) -> Result<Vec<i64>> {
        self.with_savepoint("detached_children", || {
            let mut queue: Vec<i64> = candidates.to_vec();
            let mut deleted = Vec::new();
            while let Some(id) = queue.pop() {
                if deleted.contains(&id) {
                    continue;
                }
                let Ok(child) = self.get_template_email_by_id(id) else {
                    continue;
                };
                if self.template_still_referenced(id)? || self.template_has_own_activity(&child)? {
                    continue;
                }
                // Ses propres variantes (ex. relance tu) deviennent à leur tour candidates.
                queue.extend(self.template_child_ids(&child));
                self.delete_auxiliary_template_email(id)?;
                deleted.push(id);
            }
            Ok(deleted)
        })
    }

    /// Modèle d'une ligne d'envoi « modèle » et ses variantes (nettoyage des fichiers si la
    /// campagne est supprimée après ce dernier envoi).
    pub fn template_ids_with_children_for_envoi(&self, row_id: i64) -> Result<Vec<i64>> {
        let template_id: i64 = self.conn.query_row(
            "SELECT template_id FROM contact_template_envois WHERE id = ?1",
            params![row_id],
            |row| row.get(0),
        )?;
        let tpl = self.get_template_email_by_id(template_id)?;
        let mut ids = self.template_child_ids(&tpl);
        ids.push(template_id);
        Ok(ids)
    }

    /// Modèle qui vit par lui-même (jamais supprimé comme simple variante) : campagne éphémère,
    /// newsletter, envoi automatique actif, ou envois encore en file.
    fn template_has_own_activity(&self, tpl: &super::models::TemplateEmail) -> Result<bool> {
        let meta = tpl
            .variables
            .as_deref()
            .and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok())
            .unwrap_or(serde_json::Value::Null);
        let enabled = |key: &str| {
            meta.get(key)
                .and_then(|o| o.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        };
        // Variante tu / relance d'une campagne éphémère : marquée « brouillon » sans aucun envoi.
        // Ce n'est pas une campagne à part entière, elle peut partir quand on la détache.
        let ephemeral_status = meta
            .get("ephemeral_campaign")
            .and_then(|c| c.get("status"))
            .and_then(|v| v.as_str());
        let ephemeral_variant_without_sends = ephemeral_status == Some("draft")
            && !self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM contact_template_envois WHERE template_id = ?1)",
                params![tpl.id],
                |row| row.get::<_, bool>(0),
            )?;
        if (meta.get("ephemeral_campaign").is_some() && !ephemeral_variant_without_sends)
            || meta.get("newsletter_html").is_some()
            || enabled("email_trigger")
            || enabled("pipe_rdv_trigger")
            || enabled("placement_conforme_trigger")
        {
            return Ok(true);
        }
        self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM contact_template_envois
                           WHERE template_id = ?1
                             AND ((email_envoye = 0 AND COALESCE(email_annule, 0) = 0)
                                  OR COALESCE(email_relance_active, 0) = 1))",
            params![tpl.id],
            |row| row.get(0),
        )
    }

    /// Suppressions en plusieurs étapes : tout ou rien (point de sauvegarde, imbriquable).
    pub(crate) fn with_savepoint<T>(&self, name: &str, f: impl FnOnce() -> Result<T>) -> Result<T> {
        self.conn.execute_batch(&format!("SAVEPOINT {name}"))?;
        match f() {
            Ok(value) => {
                self.conn.execute_batch(&format!("RELEASE {name}"))?;
                Ok(value)
            }
            Err(e) => {
                let _ = self
                    .conn
                    .execute_batch(&format!("ROLLBACK TO {name}; RELEASE {name}"));
                Err(e)
            }
        }
    }

    /// True si un autre modèle (hors `exclude_parent_id`) référence encore `child_id`.
    pub(crate) fn template_linked_by_other_parent(
        &self,
        child_id: i64,
        exclude_parent_id: i64,
    ) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email
             WHERE id != ?1 AND (tutoiement_template_id = ?2 OR relance_template_id = ?2)",
            params![exclude_parent_id, child_id],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Supprime un modèle et ses variantes (tu, relance, Pipe) non utilisées ailleurs.
    /// Retourne les ids supprimés (pour nettoyer leurs pièces jointes).
    pub fn delete_template_email(&self, id: i64) -> Result<Vec<i64>> {
        self.with_savepoint("template_delete", || self.delete_template_email_inner(id))
    }

    fn delete_template_email_inner(&self, id: i64) -> Result<Vec<i64>> {
        let tpl = self.get_template_email_by_id(id)?;
        // Modèle géré par la page Newsletter (HTML de l'édition) — pas les autres modèles
        // de catégorie NEWSLETTER (ex. Performance Stellium).
        let is_managed_newsletter = tpl.categorie == "NEWSLETTER"
            && tpl
                .variables
                .as_deref()
                .and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok())
                .is_some_and(|v| v.get("newsletter_html").is_some());
        // Seulement s'il sert encore (étiquette Newsletter) : un ancien modèle orphelin reste supprimable.
        let in_use = is_managed_newsletter
            && self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM etiquettes WHERE email_template_id = ?1)",
                params![id],
                |row| row.get::<_, bool>(0),
            )?;
        if in_use {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le modèle Newsletter est géré par la page Newsletter — il ne peut pas être supprimé"
                    .into(),
            ));
        }
        if let Some(cfg) = self.parse_ephemeral_campaign_config(tpl.variables.as_deref()) {
            if cfg.status != "archived" {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Impossible de supprimer une campagne éphémère active — terminez-la d'abord"
                        .into(),
                ));
            }
        }
        let mut deleted = Vec::new();
        if self.parse_ephemeral_campaign_config(tpl.variables.as_deref()).is_some() {
            deleted.extend(self.delete_ephemeral_linked_templates(&tpl)?);
        }
        let children = self.template_child_ids(&tpl);
        self.skip_prepared_relances_using_template(id)?;
        self.conn.execute(
            "UPDATE templates_email SET relance_template_id = NULL WHERE relance_template_id = ?1",
            params![id],
        )?;
        self.conn.execute(
            "UPDATE templates_email SET tutoiement_template_id = NULL WHERE tutoiement_template_id = ?1",
            params![id],
        )?;
        self.conn
            .execute("DELETE FROM templates_email WHERE id = ?1", params![id])?;
        deleted.push(id);
        // Sa version tu, sa relance et ses messages Pipe partent avec lui (s'ils ne servent pas ailleurs).
        deleted.extend(self.delete_detached_template_children(&children)?);
        Ok(deleted)
    }

    fn template_email_nom_exists(&self, nom: &str) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![nom],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Crée les modèles par défaut. Si `only_if_empty`, ne fait rien dès qu’au moins un modèle existe.
    pub fn ensure_default_email_templates(&self, only_if_empty: bool) -> Result<usize> {
        Ok(self.default_email_templates_to_add(only_if_empty, false)?.len())
    }

    /// Modèles par défaut absents de la bibliothèque (pour les montrer avant de les ajouter).
    pub fn missing_default_email_template_names(&self) -> Result<Vec<String>> {
        self.default_email_templates_to_add(false, true)
    }

    /// Noms des modèles par défaut absents ; les crée sauf en `dry_run`.
    fn default_email_templates_to_add(&self, only_if_empty: bool, dry_run: bool) -> Result<Vec<String>> {
        if only_if_empty {
            let count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM templates_email",
                [],
                |row| row.get(0),
            )?;
            if count > 0 {
                return Ok(Vec::new());
            }
        }

        use super::models::NewTemplateEmail;

        let defaults: Vec<NewTemplateEmail> = vec![
            NewTemplateEmail {
                nom: "Relance — client 1 an sans contact".into(),
                sujet: "{{prenom}}, reprenons contact".into(),
                corps: "Bonjour {{prenom}} {{nom}},\n\nIl y a plus d'un an que nous n'avons pas échangé. Je serais ravi de faire un point sur votre situation et vos objectifs.\n\n{{cgp_prenom}} {{cgp_nom}}\n{{cgp_telephone}}\n{{lien_agenda}}".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            },
            NewTemplateEmail {
                nom: "Relance — prospect 6 mois".into(),
                sujet: "{{prenom}}, un échange rapide ?".into(),
                corps: "Bonjour {{prenom}},\n\nJe me permets de vous recontacter : nous n'avons pas échangé depuis quelques mois. Souhaitez-vous un court appel ?\n\nBien cordialement,\n{{cgp_prenom}} {{cgp_nom}}".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            },
            NewTemplateEmail {
                nom: "Rappel déclaration IR".into(),
                sujet: "Déclaration d'impôts — {{prenom}}".into(),
                corps: "Bonjour {{prenom}},\n\nLa période de déclaration d'impôts approche. Je reste disponible si vous souhaitez un échange.\n\n{{cgp_prenom}} {{cgp_nom}}\n{{cgp_email}}".into(),
                categorie: "FISCALITE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            },
            NewTemplateEmail {
                nom: "Prise de rendez-vous suivi".into(),
                sujet: "Prochain rendez-vous de suivi — {{prenom}}".into(),
                corps: "Bonjour {{prenom}} {{nom}},\n\nVotre prochain rendez-vous de suivi approche. Réservez un créneau sur Google Agenda : {{lien_agenda}}\n\nÀ bientôt,\n{{cgp_prenom}} {{cgp_nom}}".into(),
                categorie: "RENDEZ_VOUS".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            },
            NewTemplateEmail {
                nom: "Bienvenue nouveau client".into(),
                sujet: "Bienvenue {{prenom}}".into(),
                corps: "Bonjour {{prenom}},\n\nJe suis ravi de vous accompagner. N'hésitez pas à me joindre au {{cgp_telephone}} ou par email.\n\nCordialement,\n{{cgp_prenom}} {{cgp_nom}}".into(),
                categorie: "BIENVENUE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            },
            NewTemplateEmail {
                nom: "Relance — échéance patrimoine".into(),
                sujet: "Échéance à venir — {{prenom}}".into(),
                corps: "Bonjour {{prenom}},\n\nUne échéance importante approche sur votre patrimoine. Je vous propose d'en discuter rapidement.\n\n{{cgp_prenom}} {{cgp_nom}}\n{{cgp_telephone}}".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            },
            NewTemplateEmail {
                nom: "Rappel assurance-vie 69 ans".into(),
                sujet: "Point assurance-vie — {{prenom}}".into(),
                corps: "Bonjour {{prenom}} {{nom}},\n\nVous approchez d'une étape clé pour l'organisation de votre assurance-vie. Souhaitez-vous un rendez-vous ?\n\n{{cgp_prenom}} {{cgp_nom}}".into(),
                categorie: "SUIVI_ANNUEL".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            },
            NewTemplateEmail {
                nom: "Exceltis — remboursement et arbitrage".into(),
                sujet: "Exceltis {{millesime}} — remboursement et prochaines étapes, {{prenom}}".into(),
                corps: "Bonjour {{prenom}} {{nom}},\n\n\
Stellium vient de procéder au remboursement de votre support {{etiquette_nom}} avec une performance de {{rendement_exceltis}}.\n\
Ils seront officiellement disponibles d'ici 2 à 3 semaines.\n\n\
Concrètement :\n\
• les fonds seront de nouveau disponibles sur votre contrat ;\n\
• c'est le moment de faire le point : réinvestissement, arbitrage vers d'autres supports, ou maintien en trésorerie selon votre stratégie.\n\n\
Je vous propose d'en discuter lors d'un court échange. Vous pouvez réserver un créneau ici : {{lien_agenda}}\n\n\
Si vous préférez, répondez à ce message ou appelez-moi au {{cgp_telephone}}.\n\n\
Bien cordialement,\n\
{{cgp_prenom}} {{cgp_nom}}\n\
{{cgp_email}}".into(),
                categorie: "ARBITRAGE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            },
        ];

        let mut names = Vec::new();
        for t in defaults {
            if !self.template_email_nom_exists(&t.nom)? {
                names.push(t.nom.clone());
                if !dry_run {
                    self.create_template_email(t)?;
                }
            }
        }
        Ok(names)
    }

    #[allow(dead_code)]
    fn link_default_relance_templates(&self) -> Result<usize> {
        let pairs: [(&str, &str); 5] = [
            ("Prise de rendez-vous suivi", "Relance — suite sans réponse"),
            ("Relance — client 1 an sans contact", "Relance — suite sans réponse"),
            ("Rappel déclaration IR", "Relance — suite sans réponse"),
            ("Rappel assurance-vie 69 ans", "Relance — suite sans réponse"),
            ("Exceltis — remboursement et arbitrage", "Relance — suite sans réponse"),
        ];
        let mut linked = 0;
        for (initial_nom, relance_nom) in pairs {
            let updated = self.conn.execute(
                "UPDATE templates_email SET relance_template_id = (
                    SELECT id FROM templates_email WHERE nom = ?2 LIMIT 1
                 )
                 WHERE nom = ?1 AND relance_template_id IS NULL
                   AND EXISTS (SELECT 1 FROM templates_email WHERE nom = ?2)",
                params![initial_nom, relance_nom],
            )?;
            linked += updated;
        }
        Ok(linked)
    }

    /// Rattrapage catégories Rendez-vous / Pipe et Bulletins (une fois).
    pub fn migrate_templates_email_rendez_vous_bulletins_categories(&self) -> Result<()> {
        if self.get_setting("migration_templates_email_rendez_vous_bulletins_v1")?.is_some() {
            return Ok(());
        }

        let rendez_vous = self.conn.execute(
            "UPDATE templates_email SET categorie = 'RENDEZ_VOUS', updated_at = unixepoch()
             WHERE categorie != 'RENDEZ_VOUS'
               AND (
                 nom = 'Prise de rendez-vous suivi'
                 OR COALESCE(json_extract(variables, '$.pipe_rdv_trigger.enabled'), 0) = 1
                 OR COALESCE(json_extract(variables, '$.pipe_rdv_trigger.enabled'), '') = 'true'
               )",
            [],
        )?;

        let bulletins = self.conn.execute(
            "UPDATE templates_email SET categorie = 'BULLETINS', updated_at = unixepoch()
             WHERE categorie != 'BULLETINS'
               AND (
                 nom IN ('Bulletin SCPI trimestriel', 'Bulletin SCPI trimestriel (tu)')
                 OR COALESCE(json_extract(variables, '$.scpi_template_version'), 0) > 0
                 OR sujet LIKE '%bulletin%SCPI%' COLLATE NOCASE
                 OR sujet LIKE '%bulletins SCPI%' COLLATE NOCASE
                 OR corps LIKE '%{{scpi_intro_%'
                 OR corps LIKE '%{{bulletin_resume%'
                 OR COALESCE(variables, '') LIKE '%scpi_template_version%'
               )",
            [],
        )?;

        self.set_setting("migration_templates_email_rendez_vous_bulletins_v1", "1")?;
        if rendez_vous > 0 || bulletins > 0 {
            println!(
                "✅ Migration catégories modèles email : {} rendez-vous/pipe, {} bulletins",
                rendez_vous, bulletins
            );
        }
        Ok(())
    }

    /// Catégorie Éphémère pour les campagnes éphémères actives (une fois).
    pub fn migrate_templates_email_ephemere_category(&self) -> Result<()> {
        if self.get_setting("migration_templates_email_ephemere_category_v1")?.is_some() {
            return Ok(());
        }

        let updated = self.conn.execute(
            "UPDATE templates_email SET categorie = 'EPHEMERE', updated_at = unixepoch()
             WHERE categorie != 'EPHEMERE'
               AND COALESCE(json_extract(variables, '$.is_ephemeral'), 0) = 1",
            [],
        )?;

        self.set_setting("migration_templates_email_ephemere_category_v1", "1")?;
        if updated > 0 {
            println!(
                "✅ Migration catégories modèles email : {} campagne(s) éphémère(s)",
                updated
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::database::models::{NewEtiquette, NewTemplateEmail};
    use crate::database::Database;
    use rusqlite::params;

    fn tpl(db: &Database, nom: &str, variables: Option<String>) -> i64 {
        db.create_template_email(NewTemplateEmail {
            nom: nom.into(),
            sujet: "Objet".into(),
            corps: "Corps".into(),
            categorie: "AUTRE".into(),
            variables,
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })
        .unwrap()
        .id
    }

    fn link(db: &Database, parent: i64, tu: Option<i64>, relance: Option<i64>) {
        db.conn
            .execute(
                "UPDATE templates_email SET tutoiement_template_id = ?1, relance_template_id = ?2
                 WHERE id = ?3",
                params![tu, relance, parent],
            )
            .unwrap();
    }

    fn exists(db: &Database, id: i64) -> bool {
        db.get_template_email_by_id(id).is_ok()
    }

    #[test]
    fn detached_children_are_deleted_unless_still_used() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let parent = tpl(&db, "Suivi", None);
        let tu = tpl(&db, "Suivi (tu)", None);
        let rel = tpl(&db, "Relance — Suivi", None);
        let rel_tu = tpl(&db, "Relance — Suivi (tu)", None);
        link(&db, rel, Some(rel_tu), None);
        link(&db, parent, Some(tu), Some(rel));

        // Toujours reliés : rien n'est supprimé.
        assert!(db.delete_detached_template_children(&[tu, rel]).unwrap().is_empty());

        // Tu désactivé et relance revenue au même message : tu, relance et relance tu partent.
        link(&db, parent, None, None);
        let mut deleted = db.delete_detached_template_children(&[tu, rel]).unwrap();
        deleted.sort();
        assert_eq!(deleted, {
            let mut v = vec![tu, rel, rel_tu];
            v.sort();
            v
        });
        assert!(exists(&db, parent));

        // Variante utilisée par une étiquette : conservée.
        let standalone = tpl(&db, "Autre (tu)", None);
        let etiquette = db
            .create_etiquette(NewEtiquette {
                nom: "Étiquette".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(standalone),
                email_delai_jours: None,
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();
        assert!(etiquette.id > 0);
        assert!(db.delete_detached_template_children(&[standalone]).unwrap().is_empty());
    }

    #[test]
    fn deleting_parent_removes_its_variants_but_keeps_shared_pipe_children() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let reminder = tpl(&db, "Rappel RDV — Confirmation", None);
        let pipe_meta = serde_json::json!({
            "pipe_rdv_reminder": { "enabled": true, "reminder_template_id": reminder }
        })
        .to_string();
        let parent = tpl(&db, "Confirmation", Some(pipe_meta.clone()));
        let tu = tpl(&db, "Confirmation (tu)", None);
        link(&db, parent, Some(tu), None);
        // Ancien doublon qui partage encore le même rappel.
        let copy = tpl(&db, "Confirmation (copie)", Some(pipe_meta));

        db.delete_template_email(parent).unwrap();
        assert!(!exists(&db, tu), "la version tu part avec le modèle");
        assert!(exists(&db, reminder), "rappel encore utilisé par la copie");

        db.delete_template_email(copy).unwrap();
        assert!(!exists(&db, reminder));
    }

    #[test]
    fn detached_pipe_reminder_kept_while_a_reminder_is_still_scheduled() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let reminder = tpl(&db, "Rappel RDV — Confirmation", None);
        db.conn
            .execute(
                "INSERT INTO pipe_rdv_scheduled_emails
                    (pipe_timeline_entry_id, pipe_id, contact_id, template_id, send_at, rdv_at, rdv_end_at)
                 VALUES (1, 1, 1, ?1, 0, 0, 0)",
                params![reminder],
            )
            .unwrap();
        assert!(db.delete_detached_template_children(&[reminder]).unwrap().is_empty());
        db.conn
            .execute("UPDATE pipe_rdv_scheduled_emails SET sent_at = 1", [])
            .unwrap();
        assert_eq!(db.delete_detached_template_children(&[reminder]).unwrap(), vec![reminder]);
    }

    #[test]
    fn detached_candidate_with_its_own_activity_is_never_deleted() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let with_trigger = tpl(
            &db,
            "Bienvenue (tu)",
            Some(r#"{"email_trigger":{"enabled":true}}"#.into()),
        );
        let campaign = tpl(&db, "Campagne", Some(r#"{"ephemeral_campaign":{"status":"prepared"}}"#.into()));
        let queued = tpl(&db, "Autre (tu)", None);
        db.conn
            .execute(
                "INSERT INTO contact_template_envois (contact_id, template_id, email_envoye)
                 VALUES (1, ?1, 0)",
                params![queued],
            )
            .ok();
        let deleted = db
            .delete_detached_template_children(&[with_trigger, campaign])
            .unwrap();
        assert!(deleted.is_empty());
        assert!(exists(&db, with_trigger) && exists(&db, campaign));
    }

    #[test]
    fn missing_default_templates_listed_without_creating_them() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let before = db.missing_default_email_template_names().unwrap();
        assert!(!before.is_empty());
        let count = |db: &Database| -> i64 {
            db.conn.query_row("SELECT COUNT(*) FROM templates_email", [], |r| r.get(0)).unwrap()
        };
        let n0 = count(&db);
        // La liste ne crée rien.
        assert_eq!(db.missing_default_email_template_names().unwrap(), before);
        assert_eq!(count(&db), n0);
        // L'ajout crée exactement ces modèles, sans lien d'agenda imposé.
        assert_eq!(db.ensure_default_email_templates(false).unwrap(), before.len());
        assert!(db.missing_default_email_template_names().unwrap().is_empty());
        let forced: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM templates_email WHERE agenda_link_id IN ('principal', 'suivi')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(forced, 0);
    }
}
