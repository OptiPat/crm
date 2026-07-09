//! Modèles d'e-mails (CRUD + modèles par défaut). Extrait de `operations.rs`.
//!
//! La file d'envoi et les relances vivent dans `template_email_queue.rs` /
//! `template_email_relance.rs`.

use rusqlite::{params, Result};

/// Visibilité bibliothèque Modèles email : campagnes éphémères archivées et variantes liées (tu / relance).
const TEMPLATE_EMAIL_LIBRARY_VISIBLE_WHERE: &str = "
    NOT (
        COALESCE(json_extract(variables, '$.is_ephemeral'), 0) = 1
        AND COALESCE(json_extract(variables, '$.ephemeral_campaign.status'), '') = 'archived'
    )
    AND id NOT IN (
        SELECT p.tutoiement_template_id FROM templates_email p
        WHERE p.tutoiement_template_id IS NOT NULL
          AND COALESCE(json_extract(p.variables, '$.is_ephemeral'), 0) = 1
          AND COALESCE(json_extract(p.variables, '$.ephemeral_campaign.status'), '') = 'archived'
        UNION ALL
        SELECT p.relance_template_id FROM templates_email p
        WHERE p.relance_template_id IS NOT NULL
          AND COALESCE(json_extract(p.variables, '$.is_ephemeral'), 0) = 1
          AND COALESCE(json_extract(p.variables, '$.ephemeral_campaign.status'), '') = 'archived'
        UNION ALL
        SELECT r.tutoiement_template_id FROM templates_email p
        INNER JOIN templates_email r ON r.id = p.relance_template_id
        WHERE r.tutoiement_template_id IS NOT NULL
          AND COALESCE(json_extract(p.variables, '$.is_ephemeral'), 0) = 1
          AND COALESCE(json_extract(p.variables, '$.ephemeral_campaign.status'), '') = 'archived'
    )";

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
    pub(crate) fn delete_auxiliary_template_email(&self, id: i64) -> Result<()> {
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

    pub fn delete_template_email(&self, id: i64) -> Result<()> {
        let tpl = self.get_template_email_by_id(id)?;
        if let Some(cfg) = self.parse_ephemeral_campaign_config(tpl.variables.as_deref()) {
            if cfg.status != "archived" {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Impossible de supprimer une campagne éphémère active — terminez-la d'abord"
                        .into(),
                ));
            }
            self.delete_ephemeral_linked_templates(&tpl)?;
        }
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
        if only_if_empty {
            let count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM templates_email",
                [],
                |row| row.get(0),
            )?;
            if count > 0 {
                return Ok(0);
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
                agenda_link_id: Some("principal".into()),
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
                categorie: "SUIVI_ANNUEL".into(),
                variables: None,
                agenda_link_id: Some("suivi".into()),
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
                agenda_link_id: Some("principal".into()),
                relance_template_id: None,
                tutoiement_template_id: None,
            },
        ];

        let mut created = 0;
        for t in defaults {
            if !self.template_email_nom_exists(&t.nom)? {
                self.create_template_email(t)?;
                created += 1;
            }
        }
        Ok(created)
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
}
