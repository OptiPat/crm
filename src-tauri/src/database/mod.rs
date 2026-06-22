use rusqlite::{Connection, Result};
use tauri::{AppHandle, Manager};

pub mod email_schedule;
pub mod etiquette_rule_ast;
pub mod etiquette_actions;
pub mod etiquette_assignments;
pub mod etiquette_email;
pub mod etiquettes;
pub mod etiquettes_auto_engine;
pub mod etiquette_fiscal;
pub mod alertes;
pub mod contact_row;
pub mod contacts;
pub mod custom_fields;
pub mod dashboard_stats;
pub mod documents;
pub mod exchange_history;
pub mod email_send_log;
pub mod google_contact_name_dismissals;
pub mod etiquette_pipeline;
pub mod calendar_events;
pub mod familles;
pub mod filleuls;
pub mod foyers;
pub mod interactions;
pub mod investissements;
pub mod partenaires;
pub mod settings;
pub mod templates_email;
pub mod models;
pub mod newsletter_ops;
pub mod notifications_summary;
pub mod birthdays;
pub mod scpi_campaigns;
pub mod stellium_perf_campaigns;
pub mod stellium_perf_dashboard;
pub mod operations;
pub mod segments;
pub mod tache_recurrence;
pub mod taches;
pub mod template_email_trigger;
pub mod template_email_relance;
pub mod template_email_queue;
pub mod template_formality_sql;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub(crate) fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Ouvre la base SQLite locale (non chiffrée) et garantit le schéma à jour.
    ///
    /// - Fichier absent : base créée automatiquement.
    /// - Fichier présent : ouverture directe + migrations idempotentes (`init_tables`).
    ///
    /// Une sauvegarde de sécurité est créée avant toute migration de schéma, puis
    /// une sauvegarde quotidienne si nécessaire.
    pub fn open(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");

        let db_path = app_data_dir.join("patrimoine-crm.db");
        let db_existed = db_path.exists();
        println!("Database path: {:?}", db_path);

        if db_existed {
            if let Err(e) = crate::backup::create_pre_migration_backup(&app_data_dir, &db_path) {
                eprintln!("⚠️ Backup pré-migration échoué : {e}");
            }
        }

        let conn = Connection::open(&db_path)?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        let db = Database { conn };
        db.init_tables().map_err(|e| {
            eprintln!("❌ Échec init_tables / migration : {e}");
            e
        })?;

        if let Err(e) = crate::backup::create_daily_backup_if_needed(&app_data_dir, &db_path) {
            eprintln!("⚠️ Sauvegarde automatique échouée : {e}");
        }

        Ok(db)
    }

    /// Ouverture secondaire (API locale n8n) — sans migrations (déjà appliquées au déverrouillage).
    pub fn open_at_path(db_path: &std::path::Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        conn.busy_timeout(std::time::Duration::from_secs(10))?;
        Ok(Database { conn })
    }

    fn init_tables(&self) -> Result<()> {
        // Table familles (lien de sang/parenté)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS familles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT NOT NULL,
                notes TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;

        // Table foyers (unité fiscale)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS foyers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT NOT NULL,
                type_foyer TEXT NOT NULL,
                nombre_parts_fiscales REAL,
                tranche_imposition TEXT,
                revenu_fiscal_reference REAL,
                ir_net_a_payer REAL,
                situation_patrimoniale TEXT,
                objectifs_patrimoniaux TEXT,
                notes TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;

        // Table contacts
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                famille_id INTEGER,
                foyer_id INTEGER,
                role_foyer TEXT,
                role_famille TEXT,
                categorie TEXT NOT NULL,
                parrain_id INTEGER,
                civilite TEXT,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                email TEXT,
                telephone TEXT,
                adresse TEXT,
                code_postal TEXT,
                ville TEXT,
                date_naissance INTEGER,
                profession TEXT,
                situation_familiale TEXT,
                source_lead TEXT,
                profil_risque_sri INTEGER,
                date_dernier_contact INTEGER,
                date_prochain_suivi INTEGER,
                statut_suivi TEXT NOT NULL DEFAULT 'ACTIF',
                notes TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (famille_id) REFERENCES familles(id) ON DELETE SET NULL,
                FOREIGN KEY (foyer_id) REFERENCES foyers(id) ON DELETE SET NULL,
                FOREIGN KEY (parrain_id) REFERENCES contacts(id) ON DELETE SET NULL
            )",
            [],
        )?;

        // Table partenaires
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS partenaires (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type_partenaire TEXT NOT NULL,
                raison_sociale TEXT NOT NULL,
                nom_contact TEXT,
                prenom_contact TEXT,
                email TEXT,
                telephone TEXT,
                adresse TEXT,
                code_postal TEXT,
                ville TEXT,
                specialite TEXT,
                zone_geo TEXT,
                niveau_collaboration TEXT,
                notes TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;

        // Table documents
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER,
                foyer_id INTEGER,
                type_document TEXT NOT NULL,
                nom_fichier TEXT NOT NULL,
                chemin_fichier TEXT NOT NULL,
                taille_fichier INTEGER NOT NULL,
                mime_type TEXT,
                date_document TEXT,
                notes TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (foyer_id) REFERENCES foyers(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Table investissements
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS investissements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                foyer_id INTEGER,
                type_produit TEXT NOT NULL,
                nom_produit TEXT NOT NULL,
                partenaire_id INTEGER,
                montant_initial INTEGER,
                date_souscription INTEGER,
                date_fin_demembrement INTEGER,
                date_fin_pret INTEGER,
                mensualite_credit INTEGER,
                credit_crd INTEGER,
                loyer_mensuel INTEGER,
                versement_programme INTEGER NOT NULL DEFAULT 0,
                montant_versement_programme INTEGER,
                frequence_versement TEXT,
                reinvestissement_dividendes INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                origine TEXT NOT NULL DEFAULT 'MON_CONSEIL',
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (foyer_id) REFERENCES foyers(id) ON DELETE CASCADE,
                FOREIGN KEY (partenaire_id) REFERENCES partenaires(id) ON DELETE SET NULL
            )",
            [],
        )?;

        // Table alertes (schéma aligné sur operations.rs / Drizzle)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS alertes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                type_alerte TEXT NOT NULL,
                message TEXT NOT NULL,
                date_alerte INTEGER NOT NULL,
                lue INTEGER NOT NULL DEFAULT 0,
                traitee INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Templates email
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS templates_email (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT NOT NULL,
                sujet TEXT NOT NULL,
                corps TEXT NOT NULL,
                categorie TEXT NOT NULL,
                variables TEXT,
                agenda_link_id TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;

        // Étiquettes
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS etiquettes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT NOT NULL,
                couleur TEXT NOT NULL DEFAULT '#3B82F6',
                icone TEXT,
                description TEXT,
                priorite INTEGER NOT NULL DEFAULT 0,
                auto_condition_type TEXT,
                auto_condition_config TEXT,
                auto_categories TEXT,
                email_template_id INTEGER,
                email_delai_jours INTEGER NOT NULL DEFAULT 0,
                email_envoi_prevu INTEGER,
                email_actif INTEGER NOT NULL DEFAULT 0,
                is_default INTEGER NOT NULL DEFAULT 0,
                actif INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (email_template_id) REFERENCES templates_email(id) ON DELETE SET NULL
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS contact_etiquettes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                etiquette_id INTEGER NOT NULL,
                date_attribution INTEGER NOT NULL DEFAULT (unixepoch()),
                attribue_par TEXT NOT NULL DEFAULT 'AUTO',
                email_envoye INTEGER NOT NULL DEFAULT 0,
                email_date_prevue INTEGER,
                email_date_envoi INTEGER,
                notes TEXT,
                tache_id INTEGER,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (etiquette_id) REFERENCES etiquettes(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS contact_etiquettes_unique ON contact_etiquettes (contact_id, etiquette_id)",
            [],
        )?;

        // Action « créer une tâche » liée à une étiquette (déclenchée à l'attribution AUTO).
        // Table dédiée : actions génériques extensibles sans toucher au modèle Etiquette.
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS etiquette_actions (
                etiquette_id INTEGER PRIMARY KEY,
                tache_actif INTEGER NOT NULL DEFAULT 0,
                tache_titre TEXT,
                tache_priorite TEXT NOT NULL DEFAULT 'NORMALE',
                tache_delai_jours INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (etiquette_id) REFERENCES etiquettes(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS contact_etiquettes_contact_idx ON contact_etiquettes (contact_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                type_interaction TEXT NOT NULL,
                sujet TEXT,
                contenu TEXT,
                date_interaction INTEGER NOT NULL,
                email_id INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS interactions_contact_idx ON interactions (contact_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS interactions_date_idx ON interactions (date_interaction DESC)",
            [],
        )?;

        // Table settings (configuration CGP et wizard)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;

        // Table taches (tâches / rappels, liés ou non à un contact)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS taches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER,
                titre TEXT NOT NULL,
                description TEXT,
                date_echeance INTEGER,
                priorite TEXT NOT NULL DEFAULT 'NORMALE',
                statut TEXT NOT NULL DEFAULT 'A_FAIRE',
                completed_at INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS taches_contact_idx ON taches (contact_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS taches_statut_echeance_idx ON taches (statut, date_echeance)",
            [],
        )?;

        // Liaison tâche ↔ contacts (N-N) : une tâche peut concerner plusieurs contacts.
        // Source de vérité des contacts liés (la colonne taches.contact_id reste pour l'historique).
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS tache_contacts (
                tache_id INTEGER NOT NULL,
                contact_id INTEGER NOT NULL,
                PRIMARY KEY (tache_id, contact_id),
                FOREIGN KEY (tache_id) REFERENCES taches(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS tache_contacts_contact_idx ON tache_contacts (contact_id)",
            [],
        )?;

        // Champs personnalisés : définitions + valeurs (modèle clé-valeur générique,
        // pas de table par champ ni de SQL dynamique).
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS custom_field_defs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity TEXT NOT NULL DEFAULT 'contact',
                field_key TEXT NOT NULL,
                label TEXT NOT NULL,
                field_type TEXT NOT NULL DEFAULT 'text',
                options TEXT,
                position INTEGER NOT NULL DEFAULT 0,
                actif INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS custom_field_defs_entity_key
             ON custom_field_defs (entity, field_key)",
            [],
        )?;
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS custom_field_values (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                def_id INTEGER NOT NULL,
                entity_id INTEGER NOT NULL,
                value TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (def_id) REFERENCES custom_field_defs(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS custom_field_values_def_entity
             ON custom_field_values (def_id, entity_id)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS custom_field_values_entity_idx
             ON custom_field_values (entity_id)",
            [],
        )?;

        println!("✅ Database tables initialized");

        // Migration automatique : Rendre contact_id optionnel dans investissements
        self.migrate_investissements_contact_id_optional()?;

        // Migration automatique : Ajouter famille_id aux contacts
        self.migrate_add_famille_id()?;

        // Migration automatique : Ajouter role_famille aux contacts
        self.migrate_add_role_famille()?;

        self.migrate_add_famille_regroupement_exclu()?;

        // Migration automatique : Ajouter filleul_categorie aux contacts
        self.migrate_add_filleul_categorie()?;

        // Migration automatique : Ajouter dates de suivi filleul aux contacts
        self.migrate_add_filleul_dates()?;

        // Migration automatique : Ajouter prescripteur_id aux contacts
        self.migrate_add_prescripteur_id()?;

        // Migration automatique : Ajouter date_fin_pret aux investissements
        self.migrate_add_date_fin_pret()?;
        self.migrate_add_investissement_immo_financing_fields()?;
        self.migrate_add_investissement_numero_contrat()?;
        self.migrate_investissement_valorisations()?;
        self.migrate_stellium_fields_on_valorisations()?;

        self.migrate_investissement_versements()?;

        self.migrate_alertes_crud_schema()?;
        self.migrate_backfill_filleul_categorie()?;
        self.migrate_add_email_envoi_prevu()?;
        self.migrate_add_email_envoi_heure()?;
        self.migrate_add_email_envoi_jours_semaine()?;
        self.migrate_add_newsletter_desinscrit()?;
        self.migrate_newsletter_editions()?;
        self.migrate_protect_newsletter_etiquette()?;
        self.migrate_contact_etiquettes_contact_index()?;
        self.migrate_contact_etiquettes_tache_id()?;
        self.migrate_alertes_traitee_at()?;
        self.migrate_taches_multi_contacts()?;
        self.migrate_taches_recurrence()?;
        self.migrate_etiquettes_actif()?;
        self.migrate_templates_email_agenda_link_id()?;
        self.migrate_templates_email_relance_template_id()?;
        self.migrate_templates_email_tutoiement_template_id()?;
        self.migrate_contacts_registre()?;
        self.migrate_contact_etiquettes_email_suivi()?;
        self.migrate_contact_etiquette_auto_exclusions()?;
        self.migrate_investissements_lookup_indexes()?;
        self.migrate_segments_and_rule_engine()?;
        self.migrate_contact_gmail_messages()?;
        self.migrate_contact_mail_sync_state()?;
        self.migrate_drop_emails_message_id_smtp()?;
        self.migrate_contact_template_envois()?;
        self.migrate_scpi_campaign_envois()?;
        self.migrate_email_campaign_cancelled()?;
        self.migrate_fix_agenda_template_token_typos()?;
        self.migrate_email_send_log()?;
        self.migrate_etiquette_pipeline()?;
        self.migrate_calendar_events()?;
        self.migrate_contacts_google_sync()?;
        self.migrate_google_contact_name_proposal_dismissals()?;
        self.migrate_add_lieu_naissance()?;
        self.migrate_add_contact_pays()?;
        self.migrate_add_contact_rio_financial_fields()?;
        self.migrate_add_contact_fiscal_fields()?;
        self.migrate_add_foyer_ir_net()?;
        self.migrate_documents_sensibilite_extra_financiere()?;
        self.migrate_documents_connaissances_financieres()?;
        self.migrate_documents_experience_investissement()?;
        self.migrate_contacts_profil_risque_echelle_5()?;
        self.migrate_drop_contacts_date_expiration_identite()?;

        Ok(())
    }

    fn migrate_documents_sensibilite_extra_financiere(&self) -> Result<()> {
        if self.table_has_column("documents", "sensibilite_extra_financiere")? {
            return Ok(());
        }
        println!("🔄 Migration : sensibilite_extra_financiere sur documents...");
        self.conn.execute(
            "ALTER TABLE documents ADD COLUMN sensibilite_extra_financiere TEXT",
            [],
        )?;
        println!("✅ Migration sensibilite_extra_financiere appliquée");
        Ok(())
    }

    fn migrate_documents_connaissances_financieres(&self) -> Result<()> {
        if self.table_has_column("documents", "connaissances_financieres")? {
            return Ok(());
        }
        println!("🔄 Migration : connaissances_financieres sur documents...");
        self.conn.execute(
            "ALTER TABLE documents ADD COLUMN connaissances_financieres TEXT",
            [],
        )?;
        println!("✅ Migration connaissances_financieres appliquée");
        Ok(())
    }

    fn migrate_documents_experience_investissement(&self) -> Result<()> {
        if self.table_has_column("documents", "experience_investissement")? {
            return Ok(());
        }
        if self.table_has_column("documents", "connaissances_financieres")? {
            println!("🔄 Migration : renommage connaissances_financieres → experience_investissement...");
            self.conn.execute(
                "ALTER TABLE documents RENAME COLUMN connaissances_financieres TO experience_investissement",
                [],
            )?;
            println!("✅ Migration experience_investissement appliquée (rename)");
            return Ok(());
        }
        println!("🔄 Migration : experience_investissement sur documents...");
        self.conn.execute(
            "ALTER TABLE documents ADD COLUMN experience_investissement TEXT",
            [],
        )?;
        println!("✅ Migration experience_investissement appliquée");
        Ok(())
    }

    /// Ancienne échelle profil 1–7 → nouvelle échelle QPI 1–5 (réglementaire).
    fn migrate_contacts_profil_risque_echelle_5(&self) -> Result<()> {
        if self.get_setting("migration_profil_risque_echelle_5_v1")?.is_some() {
            return Ok(());
        }
        if !self.table_has_column("contacts", "profil_risque_sri")? {
            return Ok(());
        }

        println!("🔄 Migration : profil_risque_sri échelle 1–5…");
        // Ancien niveau 5 = « Dynamique + » → Dynamique (4), avant de remapper 6–7.
        let n5 = self.conn.execute(
            "UPDATE contacts SET profil_risque_sri = 4 WHERE profil_risque_sri = 5",
            [],
        )?;
        let n67 = self.conn.execute(
            "UPDATE contacts SET profil_risque_sri = 5 WHERE profil_risque_sri IN (6, 7)",
            [],
        )?;
        self.set_setting("migration_profil_risque_echelle_5_v1", "1")?;
        println!(
            "✅ Migration profil_risque_sri : {} contact(s) 5→4, {} contact(s) 6–7→5",
            n5, n67
        );
        Ok(())
    }

    fn migrate_drop_contacts_date_expiration_identite(&self) -> Result<()> {
        if self.table_has_column("contacts", "date_expiration_identite")? {
            self.conn.execute(
                "ALTER TABLE contacts DROP COLUMN date_expiration_identite",
                [],
            )?;
            println!("✅ Migration: colonne orpheline date_expiration_identite supprimée");
        }
        Ok(())
    }

    fn migrate_add_lieu_naissance(&self) -> Result<()> {
        if self.table_has_column("contacts", "lieu_naissance")? {
            return Ok(());
        }
        println!("🔄 Migration : Ajout de lieu_naissance aux contacts...");
        self.conn
            .execute("ALTER TABLE contacts ADD COLUMN lieu_naissance TEXT", [])?;
        println!("✅ Migration lieu_naissance appliquée");
        Ok(())
    }

    fn migrate_add_contact_pays(&self) -> Result<()> {
        if self.table_has_column("contacts", "pays")? {
            return Ok(());
        }
        println!("🔄 Migration : Ajout de pays aux contacts...");
        self.conn
            .execute("ALTER TABLE contacts ADD COLUMN pays TEXT", [])?;
        println!("✅ Migration pays appliquée");
        Ok(())
    }

    fn migrate_add_contact_rio_financial_fields(&self) -> Result<()> {
        let columns: [(&str, &str); 5] = [
            ("regime_matrimonial", "TEXT"),
            ("revenus_annuels", "REAL"),
            ("charges_emprunts", "REAL"),
            ("objectifs_patrimoniaux", "TEXT"),
            ("epargne_precaution_souhaitee", "REAL"),
        ];
        let mut added = false;
        for (name, sql_type) in columns {
            if self.table_has_column("contacts", name)? {
                continue;
            }
            if !added {
                println!("🔄 Migration : champs RIO sur contacts (régime, revenus, charges, objectifs)...");
                added = true;
            }
            self.conn.execute(
                &format!("ALTER TABLE contacts ADD COLUMN {name} {sql_type}"),
                [],
            )?;
        }
        if added {
            println!("✅ Migration champs RIO contacts appliquée");
        }
        Ok(())
    }

    /// Fiscalité au niveau du CONTACT (personne seule sans foyer, ou copie synchronisée
    /// d'un membre de foyer). Mêmes champs que `foyers`, pour ne pas forcer la création
    /// d'un foyer quand on saisit la TMI d'un célibataire.
    fn migrate_add_contact_fiscal_fields(&self) -> Result<()> {
        let columns: [(&str, &str); 4] = [
            ("tranche_imposition", "TEXT"),
            ("nombre_parts_fiscales", "REAL"),
            ("revenu_fiscal_reference", "REAL"),
            ("ir_net_a_payer", "REAL"),
        ];
        let mut added = false;
        for (name, sql_type) in columns {
            if self.table_has_column("contacts", name)? {
                continue;
            }
            if !added {
                println!("🔄 Migration : fiscalité sur contacts (TMI, parts, RBG, IR net)...");
                added = true;
            }
            self.conn.execute(
                &format!("ALTER TABLE contacts ADD COLUMN {name} {sql_type}"),
                [],
            )?;
        }
        if added {
            println!("✅ Migration fiscalité contacts appliquée");
        }
        Ok(())
    }

    fn migrate_add_foyer_ir_net(&self) -> Result<()> {
        if !self.table_has_column("foyers", "ir_net_a_payer")? {
            self.conn
                .execute("ALTER TABLE foyers ADD COLUMN ir_net_a_payer REAL", [])?;
            println!("✅ Migration : ir_net_a_payer sur foyers");
        }
        Ok(())
    }

    fn migrate_google_contact_name_proposal_dismissals(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS google_contact_name_proposal_dismissals (
                contact_id INTEGER NOT NULL PRIMARY KEY,
                dismissed_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        Ok(())
    }

    fn migrate_contacts_google_sync(&self) -> Result<()> {
        if !self.table_has_column("contacts", "google_contact_resource_name")? {
            self.conn.execute(
                "ALTER TABLE contacts ADD COLUMN google_contact_resource_name TEXT",
                [],
            )?;
            println!("✅ Migration: google_contact_resource_name sur contacts");
        }
        if !self.table_has_column("contacts", "google_synced_at")? {
            self.conn.execute(
                "ALTER TABLE contacts ADD COLUMN google_synced_at INTEGER",
                [],
            )?;
            println!("✅ Migration: google_synced_at sur contacts");
        }
        Ok(())
    }

    fn migrate_email_send_log(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS email_send_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                contact_etiquette_id INTEGER,
                etiquette_id INTEGER,
                etiquette_nom TEXT,
                template_nom TEXT,
                subject TEXT,
                status TEXT NOT NULL,
                error_message TEXT,
                gmail_message_id TEXT,
                batch_id TEXT,
                send_mode TEXT NOT NULL DEFAULT 'individual',
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS email_send_log_created_idx ON email_send_log (created_at DESC)",
            [],
        )?;
        Ok(())
    }

    fn migrate_etiquette_pipeline(&self) -> Result<()> {
        if !self.table_has_column("etiquettes", "pipeline_actif")? {
            self.conn.execute(
                "ALTER TABLE etiquettes ADD COLUMN pipeline_actif INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
            println!("✅ Migration: pipeline_actif sur etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "pipeline_status")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN pipeline_status TEXT",
                [],
            )?;
            println!("✅ Migration: pipeline_status sur contact_etiquettes");
        }
        Ok(())
    }

    fn migrate_calendar_events(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS calendar_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                alerte_id INTEGER,
                tache_id INTEGER,
                google_event_id TEXT NOT NULL,
                title TEXT NOT NULL,
                start_at INTEGER NOT NULL,
                end_at INTEGER NOT NULL,
                attendee_email TEXT,
                attendee_status TEXT,
                event_status TEXT NOT NULL DEFAULT 'confirmed',
                rdv_effectue INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS calendar_events_start_idx ON calendar_events (start_at)",
            [],
        )?;
        Ok(())
    }

    /// Corrige les variables agenda dupliquées dans les modèles (ex. lien_agenda_lien_agenda_suivi).
    fn migrate_fix_agenda_template_token_typos(&self) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE templates_email SET
                sujet = REPLACE(REPLACE(sujet,
                    '{{lien_agenda_lien_agenda_suivi}}', '{{lien_agenda_suivi}}'),
                    '{{lien_agenda_lien_agenda}}', '{{lien_agenda}}'),
                corps = REPLACE(REPLACE(corps,
                    '{{lien_agenda_lien_agenda_suivi}}', '{{lien_agenda_suivi}}'),
                    '{{lien_agenda_lien_agenda}}', '{{lien_agenda}}'),
                variables = REPLACE(REPLACE(COALESCE(variables, ''),
                    '{{lien_agenda_lien_agenda_suivi}}', '{{lien_agenda_suivi}}'),
                    '{{lien_agenda_lien_agenda}}', '{{lien_agenda}}')
             WHERE sujet LIKE '%lien_agenda_lien_agenda%'
                OR corps LIKE '%lien_agenda_lien_agenda%'
                OR COALESCE(variables, '') LIKE '%lien_agenda_lien_agenda%'",
            [],
        )?;
        if updated > 0 {
            println!(
                "✅ Migration: tokens agenda corrigés dans {} modèle(s) email",
                updated
            );
        }
        Ok(())
    }

    /// Envoi planifié annulé manuellement (Suivi → Envois → Ignorer).
    fn migrate_email_campaign_cancelled(&self) -> Result<()> {
        if !self.table_has_column("contact_etiquettes", "email_annule")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_annule INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
            println!("✅ Migration: email_annule sur contact_etiquettes");
        }
        if !self.table_has_column("contact_template_envois", "email_annule")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN email_annule INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
            println!("✅ Migration: email_annule sur contact_template_envois");
        }
        Ok(())
    }

    /// Table `emails` (schéma Drizzle legacy) — colonne SMTP inutilisée.
    fn migrate_drop_emails_message_id_smtp(&self) -> Result<()> {
        let table_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='emails'",
            [],
            |row| row.get(0),
        )?;
        if table_exists == 0 {
            return Ok(());
        }
        if self.table_has_column("emails", "message_id_smtp")? {
            self.conn
                .execute("ALTER TABLE emails DROP COLUMN message_id_smtp", [])?;
            println!("✅ Migration: message_id_smtp supprimée de emails");
        }
        Ok(())
    }

    fn migrate_contact_gmail_messages(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS contact_gmail_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                gmail_message_id TEXT NOT NULL,
                gmail_thread_id TEXT,
                direction TEXT NOT NULL,
                subject TEXT,
                snippet TEXT,
                body_text TEXT,
                sent_at INTEGER NOT NULL,
                synced_at INTEGER NOT NULL DEFAULT (unixepoch()),
                UNIQUE (contact_id, gmail_message_id),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        if !self.table_has_column("contact_gmail_messages", "provider")? {
            self.conn.execute(
                "ALTER TABLE contact_gmail_messages ADD COLUMN provider TEXT NOT NULL DEFAULT 'google'",
                [],
            )?;
        }
        if !self.table_has_column("contact_gmail_messages", "attachments_json")? {
            self.conn.execute(
                "ALTER TABLE contact_gmail_messages ADD COLUMN attachments_json TEXT",
                [],
            )?;
        }
        if !self.table_has_column("contact_gmail_messages", "body_fetched")? {
            self.conn.execute(
                "ALTER TABLE contact_gmail_messages ADD COLUMN body_fetched INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_contact_gmail_messages_contact_sent
             ON contact_gmail_messages(contact_id, sent_at DESC)",
            [],
        )?;
        Ok(())
    }

    fn migrate_contact_mail_sync_state(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS contact_mail_sync_state (
                contact_id INTEGER PRIMARY KEY,
                last_sync_at INTEGER,
                last_message_sent_at INTEGER,
                initial_sync_complete INTEGER NOT NULL DEFAULT 0,
                backfill_complete INTEGER NOT NULL DEFAULT 0,
                list_page_token TEXT,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        if !self.table_has_column("contact_mail_sync_state", "backfill_complete")? {
            self.conn.execute(
                "ALTER TABLE contact_mail_sync_state ADD COLUMN backfill_complete INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        if !self.table_has_column("contact_mail_sync_state", "list_page_token")? {
            self.conn.execute(
                "ALTER TABLE contact_mail_sync_state ADD COLUMN list_page_token TEXT",
                [],
            )?;
        }
        Ok(())
    }

    fn migrate_contact_etiquette_auto_exclusions(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS contact_etiquette_auto_exclusions (
                contact_id INTEGER NOT NULL,
                etiquette_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY (contact_id, etiquette_id),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (etiquette_id) REFERENCES etiquettes(id) ON DELETE CASCADE
            )",
            [],
        )?;
        Ok(())
    }

    fn migrate_investissements_lookup_indexes(&self) -> Result<()> {
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_investissements_contact_id
             ON investissements(contact_id) WHERE contact_id IS NOT NULL",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_investissements_foyer_id
             ON investissements(foyer_id) WHERE foyer_id IS NOT NULL",
            [],
        )?;
        Ok(())
    }

    fn migrate_contact_etiquettes_email_suivi(&self) -> Result<()> {
        if !self.table_has_column("contact_etiquettes", "email_reponse_at")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_reponse_at INTEGER",
                [],
            )?;
            println!("✅ Migration: email_reponse_at sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_reponse_type")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_reponse_type TEXT",
                [],
            )?;
            println!("✅ Migration: email_reponse_type sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_suivi_ignore")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_suivi_ignore INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
            println!("✅ Migration: email_suivi_ignore sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_gmail_thread_id")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_gmail_thread_id TEXT",
                [],
            )?;
            println!("✅ Migration: email_gmail_thread_id sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_gmail_message_id")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_gmail_message_id TEXT",
                [],
            )?;
            println!("✅ Migration: email_gmail_message_id sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_relance_active")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_relance_active INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
            println!("✅ Migration: email_relance_active sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_sent_subject")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_sent_subject TEXT",
                [],
            )?;
            println!("✅ Migration: email_sent_subject sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_sent_body")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_sent_body TEXT",
                [],
            )?;
            println!("✅ Migration: email_sent_body sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_sent_template_nom")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_sent_template_nom TEXT",
                [],
            )?;
            println!("✅ Migration: email_sent_template_nom sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_reponse_body")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_reponse_body TEXT",
                [],
            )?;
            println!("✅ Migration: email_reponse_body sur contact_etiquettes");
        }
        if !self.table_has_column("contact_etiquettes", "email_reponse_gmail_message_id")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN email_reponse_gmail_message_id TEXT",
                [],
            )?;
            println!("✅ Migration: email_reponse_gmail_message_id sur contact_etiquettes");
        }
        Ok(())
    }

    fn migrate_templates_email_relance_template_id(&self) -> Result<()> {
        if !self.table_has_column("templates_email", "relance_template_id")? {
            self.conn.execute(
                "ALTER TABLE templates_email ADD COLUMN relance_template_id INTEGER REFERENCES templates_email(id)",
                [],
            )?;
            println!("✅ Migration: relance_template_id sur templates_email");
        }
        Ok(())
    }

    fn migrate_templates_email_tutoiement_template_id(&self) -> Result<()> {
        if !self.table_has_column("templates_email", "tutoiement_template_id")? {
            self.conn.execute(
                "ALTER TABLE templates_email ADD COLUMN tutoiement_template_id INTEGER REFERENCES templates_email(id)",
                [],
            )?;
            println!("✅ Migration: tutoiement_template_id sur templates_email");
        }
        Ok(())
    }

    fn migrate_contacts_registre(&self) -> Result<()> {
        if !self.table_has_column("contacts", "registre")? {
            self.conn.execute(
                "ALTER TABLE contacts ADD COLUMN registre TEXT NOT NULL DEFAULT 'VOUS'",
                [],
            )?;
            println!("✅ Migration: registre (TU/VOUS) sur contacts");
        }
        Ok(())
    }

    fn migrate_templates_email_agenda_link_id(&self) -> Result<()> {
        if !self.table_has_column("templates_email", "agenda_link_id")? {
            self.conn.execute(
                "ALTER TABLE templates_email ADD COLUMN agenda_link_id TEXT",
                [],
            )?;
            println!("✅ Migration: colonne agenda_link_id sur templates_email");
        }
        Ok(())
    }

    fn migrate_etiquettes_actif(&self) -> Result<()> {
        if !self.table_has_column("etiquettes", "actif")? {
            self.conn.execute(
                "ALTER TABLE etiquettes ADD COLUMN actif INTEGER NOT NULL DEFAULT 1",
                [],
            )?;
            println!("✅ Migration: colonne actif sur etiquettes");
        }
        Ok(())
    }

    fn migrate_segments_and_rule_engine(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT NOT NULL,
                description TEXT,
                rule_json TEXT NOT NULL,
                actif INTEGER NOT NULL DEFAULT 1,
                is_system INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS alerte_segment_links (
                type_alerte TEXT PRIMARY KEY,
                segment_id INTEGER NOT NULL,
                FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS contact_etiquette_auto_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                etiquette_id INTEGER NOT NULL,
                matched INTEGER NOT NULL,
                reason TEXT,
                evaluated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (etiquette_id) REFERENCES etiquettes(id) ON DELETE CASCADE
            )",
            [],
        )?;
        if !self.table_has_column("etiquettes", "segment_id")? {
            self.conn.execute(
                "ALTER TABLE etiquettes ADD COLUMN segment_id INTEGER REFERENCES segments(id) ON DELETE SET NULL",
                [],
            )?;
            println!("✅ Migration: segment_id sur etiquettes");
        }
        let _ = self.ensure_default_segments_and_alerte_links();
        Ok(())
    }

    fn migrate_contact_etiquettes_contact_index(&self) -> Result<()> {
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS contact_etiquettes_contact_idx ON contact_etiquettes (contact_id)",
            [],
        )?;
        Ok(())
    }

    /// Colonne de déduplication pour l'action « tâche » d'une étiquette (1 tâche / liaison).
    fn migrate_contact_etiquettes_tache_id(&self) -> Result<()> {
        if !self.table_has_column("contact_etiquettes", "tache_id")? {
            self.conn.execute(
                "ALTER TABLE contact_etiquettes ADD COLUMN tache_id INTEGER",
                [],
            )?;
            println!("✅ Migration: colonne tache_id sur contact_etiquettes");
        }
        Ok(())
    }

    fn migrate_alertes_traitee_at(&self) -> Result<()> {
        if !self.table_has_column("alertes", "traitee_at")? {
            self.conn.execute(
                "ALTER TABLE alertes ADD COLUMN traitee_at INTEGER",
                [],
            )?;
            println!("✅ Migration: colonne traitee_at sur alertes");
        }
        // KPI Suivi « traitées cette semaine » : reprise des lignes déjà clôturées.
        let updated = self.conn.execute(
            "UPDATE alertes
             SET traitee_at = COALESCE(date_alerte, created_at)
             WHERE traitee = 1 AND traitee_at IS NULL",
            [],
        )?;
        if updated > 0 {
            println!(
                "✅ Migration traitee_at : {} alerte(s) historique(s) backfill",
                updated
            );
        }
        Ok(())
    }

    /// Table de liaison tâche ↔ contacts + reprise des liens mono-contact existants.
    fn migrate_taches_multi_contacts(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS tache_contacts (
                tache_id INTEGER NOT NULL,
                contact_id INTEGER NOT NULL,
                PRIMARY KEY (tache_id, contact_id),
                FOREIGN KEY (tache_id) REFERENCES taches(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS tache_contacts_contact_idx ON tache_contacts (contact_id)",
            [],
        )?;
        // Backfill : reprendre les tâches déjà liées à un contact encore existant.
        // Le JOIN évite toute violation de clé étrangère si un contact a été supprimé.
        let migrated = self.conn.execute(
            "INSERT OR IGNORE INTO tache_contacts (tache_id, contact_id)
             SELECT t.id, t.contact_id
             FROM taches t
             JOIN contacts c ON c.id = t.contact_id
             WHERE t.contact_id IS NOT NULL",
            [],
        )?;
        if migrated > 0 {
            println!("✅ Migration: {} liaison(s) tâche↔contact reprises", migrated);
        }
        Ok(())
    }

    fn migrate_taches_recurrence(&self) -> Result<()> {
        if !self.table_has_column("taches", "recurrence")? {
            self.conn.execute(
                "ALTER TABLE taches ADD COLUMN recurrence TEXT",
                [],
            )?;
            println!("✅ Migration: colonne recurrence sur taches");
        }
        Ok(())
    }

    fn migrate_add_email_envoi_prevu(&self) -> Result<()> {
        if !self.table_has_column("etiquettes", "email_envoi_prevu")? {
            self.conn.execute(
                "ALTER TABLE etiquettes ADD COLUMN email_envoi_prevu INTEGER",
                [],
            )?;
            println!("✅ Migration: colonne email_envoi_prevu sur etiquettes");
        }
        Ok(())
    }

    fn migrate_add_email_envoi_heure(&self) -> Result<()> {
        if !self.table_has_column("etiquettes", "email_envoi_heure")? {
            self.conn.execute(
                "ALTER TABLE etiquettes ADD COLUMN email_envoi_heure TEXT",
                [],
            )?;
            println!("✅ Migration: colonne email_envoi_heure sur etiquettes");
        }
        Ok(())
    }

    fn migrate_add_email_envoi_jours_semaine(&self) -> Result<()> {
        if !self.table_has_column("etiquettes", "email_envoi_jours_semaine")? {
            self.conn.execute(
                "ALTER TABLE etiquettes ADD COLUMN email_envoi_jours_semaine TEXT",
                [],
            )?;
            println!("✅ Migration: colonne email_envoi_jours_semaine sur etiquettes");
        }
        Ok(())
    }

    fn migrate_add_newsletter_desinscrit(&self) -> Result<()> {
        if !self.table_has_column("contacts", "newsletter_desinscrit_at")? {
            self.conn
                .execute(
                    "ALTER TABLE contacts ADD COLUMN newsletter_desinscrit_at INTEGER",
                    [],
                )?;
            println!("✅ Migration: colonne newsletter_desinscrit_at sur contacts");
        }
        if !self.table_has_column("contacts", "newsletter_desinscrit_note")? {
            self.conn.execute(
                "ALTER TABLE contacts ADD COLUMN newsletter_desinscrit_note TEXT",
                [],
            )?;
            println!("✅ Migration: colonne newsletter_desinscrit_note sur contacts");
        }
        Ok(())
    }

    fn migrate_newsletter_editions(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS newsletter_editions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                etiquette_id INTEGER NOT NULL,
                template_id INTEGER,
                edition_label TEXT NOT NULL,
                subject TEXT NOT NULL,
                plain_body TEXT NOT NULL,
                content_json TEXT NOT NULL,
                theme TEXT,
                edition_instructions TEXT,
                audience_filters_json TEXT NOT NULL,
                prepared_at INTEGER NOT NULL,
                send_started_at INTEGER,
                send_completed_at INTEGER,
                queued_count INTEGER NOT NULL DEFAULT 0,
                sent_count INTEGER NOT NULL DEFAULT 0,
                error_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'prepared',
                FOREIGN KEY (etiquette_id) REFERENCES etiquettes(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS newsletter_edition_recipients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                edition_id INTEGER NOT NULL,
                contact_id INTEGER NOT NULL,
                contact_etiquette_id INTEGER NOT NULL,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                email TEXT NOT NULL,
                sent_at INTEGER,
                error_message TEXT,
                gmail_message_id TEXT,
                FOREIGN KEY (edition_id) REFERENCES newsletter_editions(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_newsletter_editions_prepared_at
             ON newsletter_editions(prepared_at DESC)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_newsletter_edition_recipients_edition
             ON newsletter_edition_recipients(edition_id)",
            [],
        )?;
        Ok(())
    }

    fn migrate_protect_newsletter_etiquette(&self) -> Result<()> {
        self.conn.execute(
            "UPDATE etiquettes SET is_default = 1
             WHERE id IN (
               SELECT e.id FROM etiquettes e
               INNER JOIN templates_email t ON e.email_template_id = t.id
               WHERE t.categorie = 'NEWSLETTER'
             )",
            [],
        )?;
        self.conn.execute(
            "UPDATE etiquettes SET is_default = 1 WHERE lower(trim(nom)) = 'newsletter'",
            [],
        )?;
        Ok(())
    }

    fn table_has_column(&self, table: &str, column: &str) -> Result<bool> {
        let mut stmt = self
            .conn
            .prepare(&format!("PRAGMA table_info({})", table))?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let name: String = row.get(1)?;
            if name == column {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Ancien schéma alertes (titre/date_echeance) → schéma CRUD (message/date_alerte).
    fn migrate_alertes_crud_schema(&self) -> Result<()> {
        let table_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='alertes'",
            [],
            |row| row.get(0),
        )?;

        if table_exists == 0 {
            return Ok(());
        }

        if self.table_has_column("alertes", "message")? {
            return Ok(());
        }

        println!("🔄 Migration : alertes vers schéma message/date_alerte...");
        self.conn.execute_batch(
            "CREATE TABLE alertes_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                type_alerte TEXT NOT NULL,
                message TEXT NOT NULL,
                date_alerte INTEGER NOT NULL,
                lue INTEGER NOT NULL DEFAULT 0,
                traitee INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            );
            DROP TABLE alertes;
            ALTER TABLE alertes_new RENAME TO alertes;",
        )?;
        println!("✅ Migration alertes appliquée");
        Ok(())
    }

    /// Déplace les statuts filleul legacy de categorie vers filleul_categorie.
    fn migrate_backfill_filleul_categorie(&self) -> Result<()> {
        if !self.table_has_column("contacts", "filleul_categorie")? {
            return Ok(());
        }

        let updated = self.conn.execute(
            "UPDATE contacts
             SET filleul_categorie = categorie,
                 categorie = 'AUCUN'
             WHERE (filleul_categorie IS NULL OR filleul_categorie = '')
               AND categorie IN ('FILLEUL', 'PROSPECT_FILLEUL', 'SUSPECT_FILLEUL', 'FILLEUL_DESINSCRIT')",
            [],
        )?;

        if updated > 0 {
            println!(
                "✅ Migration filleul_categorie : {} contact(s) corrigé(s)",
                updated
            );
        }
        Ok(())
    }

    /// Migration : versements complémentaires ponctuels (AV, PER, capi…)
    fn migrate_investissement_versements(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS investissement_versements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                investissement_id INTEGER NOT NULL,
                montant INTEGER NOT NULL,
                date_versement INTEGER NOT NULL,
                notes TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (investissement_id) REFERENCES investissements(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS investissement_versements_inv_idx
             ON investissement_versements (investissement_id, date_versement DESC)",
            [],
        )?;
        Ok(())
    }

    /// Migration : historique des valorisations (encours à date) par investissement
    fn migrate_investissement_valorisations(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS investissement_valorisations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                investissement_id INTEGER NOT NULL,
                montant INTEGER NOT NULL,
                date_valorisation INTEGER NOT NULL,
                notes TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (investissement_id) REFERENCES investissements(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS investissement_valorisations_inv_idx
             ON investissement_valorisations (investissement_id, date_valorisation DESC)",
            [],
        )?;
        Ok(())
    }

    /// Migration : champs Stellium sur relevés d'encours (versements nets, perf €).
    fn migrate_stellium_fields_on_valorisations(&self) -> Result<()> {
        if !self.table_has_column("investissement_valorisations", "stellium_versements_nets_centimes")?
        {
            self.conn.execute(
                "ALTER TABLE investissement_valorisations ADD COLUMN stellium_versements_nets_centimes INTEGER",
                [],
            )?;
            println!("✅ Migration: stellium_versements_nets_centimes sur investissement_valorisations");
        }
        if !self.table_has_column("investissement_valorisations", "stellium_perf_euro_centimes")? {
            self.conn.execute(
                "ALTER TABLE investissement_valorisations ADD COLUMN stellium_perf_euro_centimes INTEGER",
                [],
            )?;
            println!("✅ Migration: stellium_perf_euro_centimes sur investissement_valorisations");
        }
        Ok(())
    }

    /// Migration : N° contrat (AV/PER — import perf Stellium).
    fn migrate_add_investissement_numero_contrat(&self) -> Result<()> {
        if !self.table_has_column("investissements", "numero_contrat")? {
            self.conn.execute(
                "ALTER TABLE investissements ADD COLUMN numero_contrat TEXT",
                [],
            )?;
            println!("✅ Migration appliquée : colonne numero_contrat sur investissements");
        }
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_investissements_numero_contrat
             ON investissements(numero_contrat)
             WHERE numero_contrat IS NOT NULL AND TRIM(numero_contrat) != ''",
            [],
        )?;
        Ok(())
    }

    /// Migration : Ajouter date_fin_pret aux investissements existants
    fn migrate_add_date_fin_pret(&self) -> Result<()> {
        // Vérifier si la colonne date_fin_pret existe déjà
        let has_date_fin_pret = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(investissements)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == "date_fin_pret" {
                    found = true;
                    break;
                }
            }
            found
        };

        if !has_date_fin_pret {
            self.conn.execute(
                "ALTER TABLE investissements ADD COLUMN date_fin_pret INTEGER",
                [],
            )?;
            println!("✅ Migration appliquée : colonne date_fin_pret ajoutée aux investissements");
        }

        Ok(())
    }

    /// Migration : mensualité crédit, CRD et loyer mensuel (centimes) sur investissements immo.
    fn migrate_add_investissement_immo_financing_fields(&self) -> Result<()> {
        for column in ["mensualite_credit", "credit_crd", "loyer_mensuel"] {
            let exists = {
                let mut stmt = self.conn.prepare("PRAGMA table_info(investissements)")?;
                let mut rows = stmt.query([])?;
                let mut found = false;
                while let Some(row) = rows.next()? {
                    let name: String = row.get(1)?;
                    if name == column {
                        found = true;
                        break;
                    }
                }
                found
            };
            if !exists {
                self.conn.execute(
                    &format!("ALTER TABLE investissements ADD COLUMN {column} INTEGER"),
                    [],
                )?;
                println!("✅ Migration appliquée : colonne {column} ajoutée aux investissements");
            }
        }
        Ok(())
    }

    /// Migration : Ajouter prescripteur_id aux contacts existants
    fn migrate_add_prescripteur_id(&self) -> Result<()> {
        // Vérifier si la colonne prescripteur_id existe déjà
        let has_prescripteur_id = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(contacts)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let col_name: String = row.get(1)?;
                if col_name == "prescripteur_id" {
                    found = true;
                    break;
                }
            }
            found
        };

        if has_prescripteur_id {
            println!("✅ Migration prescripteur_id déjà appliquée");
            return Ok(());
        }

        println!("🔄 Migration : Ajout de prescripteur_id aux contacts...");
        self.conn.execute("ALTER TABLE contacts ADD COLUMN prescripteur_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL", [])?;
        println!("✅ Migration prescripteur_id appliquée");
        Ok(())
    }

    /// Migration : Ajouter les champs date_dernier_contact_filleul et date_prochain_suivi_filleul
    fn migrate_add_filleul_dates(&self) -> Result<()> {
        // Vérifier si les colonnes existent déjà
        let has_date_dernier_contact_filleul = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(contacts)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let col_name: String = row.get(1)?;
                if col_name == "date_dernier_contact_filleul" {
                    found = true;
                    break;
                }
            }
            found
        };

        if has_date_dernier_contact_filleul {
            println!("✅ Migration filleul_dates déjà appliquée");
            return Ok(());
        }

        println!("🔄 Migration : Ajout des dates de suivi filleul...");

        // Ajouter les colonnes
        self.conn.execute(
            "ALTER TABLE contacts ADD COLUMN date_dernier_contact_filleul INTEGER",
            [],
        )?;

        self.conn.execute(
            "ALTER TABLE contacts ADD COLUMN date_prochain_suivi_filleul INTEGER",
            [],
        )?;

        println!("✅ Migration filleul_dates appliquée");

        Ok(())
    }

    /// Migration : Ajouter role_famille aux contacts existants
    fn migrate_add_role_famille(&self) -> Result<()> {
        // Vérifier si la colonne role_famille existe déjà
        let has_role_famille = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(contacts)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let col_name: String = row.get(1)?;
                if col_name == "role_famille" {
                    found = true;
                    break;
                }
            }
            found
        };

        if has_role_famille {
            println!("✅ Migration role_famille déjà appliquée");
            return Ok(());
        }

        println!("🔄 Migration : Ajout de role_famille aux contacts...");

        // Ajouter la colonne role_famille
        self.conn
            .execute("ALTER TABLE contacts ADD COLUMN role_famille TEXT", [])?;

        println!("✅ Migration role_famille appliquée");

        Ok(())
    }

    /// Migration : exclure un contact du regroupement automatique par nom (homonymes)
    fn migrate_add_famille_regroupement_exclu(&self) -> Result<()> {
        let has_col = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(contacts)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let col_name: String = row.get(1)?;
                if col_name == "famille_regroupement_exclu" {
                    found = true;
                    break;
                }
            }
            found
        };

        if has_col {
            return Ok(());
        }

        println!("🔄 Migration : Ajout de famille_regroupement_exclu aux contacts...");
        self.conn.execute(
            "ALTER TABLE contacts ADD COLUMN famille_regroupement_exclu INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
        println!("✅ Migration famille_regroupement_exclu appliquée");
        Ok(())
    }

    /// Migration : Ajouter filleul_categorie aux contacts existants
    fn migrate_add_filleul_categorie(&self) -> Result<()> {
        // Vérifier si la colonne filleul_categorie existe déjà
        let has_filleul_categorie = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(contacts)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let col_name: String = row.get(1)?;
                if col_name == "filleul_categorie" {
                    found = true;
                    break;
                }
            }
            found
        };

        if has_filleul_categorie {
            println!("✅ Migration filleul_categorie déjà appliquée");
            return Ok(());
        }

        println!("🔄 Migration : Ajout de filleul_categorie aux contacts...");

        // Ajouter la colonne filleul_categorie
        self.conn
            .execute("ALTER TABLE contacts ADD COLUMN filleul_categorie TEXT", [])?;

        println!("✅ Migration filleul_categorie appliquée");

        Ok(())
    }

    /// Migration : Ajouter famille_id aux contacts existants
    fn migrate_add_famille_id(&self) -> Result<()> {
        // Vérifier si la colonne famille_id existe déjà
        let has_famille_id = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(contacts)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let col_name: String = row.get(1)?;
                if col_name == "famille_id" {
                    found = true;
                    break;
                }
            }
            found
        };

        if has_famille_id {
            println!("✅ Migration famille_id déjà appliquée");
            return Ok(());
        }

        println!("🔄 Migration : Ajout de famille_id aux contacts...");

        // Ajouter la colonne famille_id
        self.conn.execute(
            "ALTER TABLE contacts ADD COLUMN famille_id INTEGER REFERENCES familles(id) ON DELETE SET NULL",
            [],
        )?;

        println!("✅ Migration famille_id appliquée");

        Ok(())
    }

    /// Migration : Rendre contact_id optionnel pour les investissements de foyer
    fn migrate_investissements_contact_id_optional(&self) -> Result<()> {
        // Vérifier si la migration est nécessaire
        // ⚠️ On utilise un bloc pour libérer le Statement avant de continuer
        let contact_id_is_not_null = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(investissements)")?;
            let mut rows = stmt.query([])?;

            let mut is_not_null = false;
            while let Some(row) = rows.next()? {
                let col_name: String = row.get(1)?;
                let not_null: i64 = row.get(3)?;

                if col_name == "contact_id" && not_null == 1 {
                    is_not_null = true;
                    break;
                }
            }
            is_not_null
        }; // ← stmt et rows sont libérés ici, le lock SQLite est relâché

        if !contact_id_is_not_null {
            println!("✅ Migration contact_id déjà appliquée");
            return Ok(());
        }

        println!("🔄 Migration : Rendre contact_id optionnel dans investissements...");

        // Supprimer la table temporaire si elle existe déjà (migration précédente interrompue)
        self.conn
            .execute("DROP TABLE IF EXISTS investissements_new", [])?;

        // Créer table temporaire sans NOT NULL sur contact_id
        self.conn.execute(
            "CREATE TABLE investissements_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER,
                foyer_id INTEGER,
                type_produit TEXT NOT NULL,
                nom_produit TEXT NOT NULL,
                partenaire_id INTEGER,
                montant_initial INTEGER,
                date_souscription INTEGER,
                date_fin_demembrement INTEGER,
                date_fin_pret INTEGER,
                mensualite_credit INTEGER,
                credit_crd INTEGER,
                loyer_mensuel INTEGER,
                versement_programme INTEGER NOT NULL DEFAULT 0,
                montant_versement_programme INTEGER,
                frequence_versement TEXT,
                reinvestissement_dividendes INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                origine TEXT NOT NULL DEFAULT 'MON_CONSEIL',
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (foyer_id) REFERENCES foyers(id) ON DELETE CASCADE,
                FOREIGN KEY (partenaire_id) REFERENCES partenaires(id) ON DELETE SET NULL
            )",
            [],
        )?;

        // Copier les données
        self.conn.execute(
            "INSERT INTO investissements_new SELECT * FROM investissements",
            [],
        )?;

        // Supprimer l'ancienne table
        self.conn.execute("DROP TABLE investissements", [])?;

        // Renommer la nouvelle table
        self.conn.execute(
            "ALTER TABLE investissements_new RENAME TO investissements",
            [],
        )?;

        println!("✅ Migration appliquée : contact_id est maintenant optionnel");

        Ok(())
    }

    /// Base SQLite en mémoire pour les tests (`cargo test`).
    #[cfg(test)]
    pub fn open_in_memory_for_tests() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        let db = Database { conn };
        db.init_tables()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }

    /// Démarre une transaction pour import atomique (tout commit ou tout rollback).
    pub fn begin_import_transaction(&self) -> Result<()> {
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        Ok(())
    }

    pub fn commit_import_transaction(&self) -> Result<()> {
        self.conn.execute_batch("COMMIT")?;
        Ok(())
    }

    pub fn rollback_import_transaction(&self) -> Result<()> {
        self.conn.execute_batch("ROLLBACK")?;
        Ok(())
    }
}

#[cfg(test)]
mod open_tests {
    use super::*;

    /// La base en mémoire (ouverture sans clé) initialise bien le schéma.
    #[test]
    fn in_memory_db_initializes_schema() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let count: i64 = db
            .get_connection()
            .query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get(0))
            .unwrap();
        assert!(count > 0, "le schéma doit contenir des tables");
    }

    #[test]
    fn migrate_alertes_traitee_at_backfills_legacy_traitee_rows() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let legacy_ts = 1_704_067_200_i64; // 2024-01-01 UTC
        db.get_connection()
            .execute_batch(&format!(
                "INSERT INTO contacts (nom, prenom, categorie) VALUES ('TEST', 'Backfill', 'CLIENT');
                 INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee, created_at)
                 VALUES (1, 'SUIVI', 'Relance', {legacy_ts}, 1, 1, {legacy_ts});
                 UPDATE alertes SET traitee_at = NULL WHERE id = 1;"
            ))
            .unwrap();

        db.migrate_alertes_traitee_at().unwrap();

        let traitee_at: i64 = db
            .get_connection()
            .query_row("SELECT traitee_at FROM alertes WHERE id = 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(
            traitee_at, legacy_ts,
            "backfill doit reprendre date_alerte pour les alertes déjà traitées"
        );
    }
}
