use rusqlite::{Connection, Result};
use tauri::{AppHandle, Manager};

pub mod email_schedule;
pub mod etiquettes_auto_engine;
pub mod models;
pub mod operations;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        Self::new_with_key(app_handle, None)
    }

    pub fn new_with_key(app_handle: &AppHandle, encryption_key: Option<&str>) -> Result<Self> {
        // Obtenir le chemin du dossier de données de l'application
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");

        // Créer le dossier s'il n'existe pas
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");

        // Chemin vers la base de données
        let db_path = app_data_dir.join("patrimoine-crm.db");
        let db_existed = db_path.exists();

        println!("Database path: {:?}", db_path);

        if db_existed {
            if let Err(e) = crate::backup::create_pre_migration_backup(&app_data_dir, &db_path) {
                eprintln!("⚠️ Backup pré-migration échoué : {e}");
            }
        }

        // Ouvrir la connexion
        let conn = Connection::open(&db_path)?;

        // TEMPORAIRE : SQLCipher désactivé (nécessite OpenSSL sur Windows)
        // Si une clé de chiffrement est fournie, l'utiliser pour SQLCipher
        // if let Some(key) = encryption_key {
        //     conn.execute(&format!("PRAGMA key = 'x\\'{}\\''", key), [])?;
        //     println!("✅ Database encryption enabled with SQLCipher");
        // }
        if encryption_key.is_some() {
            println!("⚠️ Database encryption NOT enabled (SQLCipher requires OpenSSL on Windows)");
        }

        // Activer les clés étrangères
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        let db = Database { conn };

        // Initialiser les tables
        db.init_tables()?;

        Ok(db)
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
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (etiquette_id) REFERENCES etiquettes(id) ON DELETE CASCADE
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS contact_etiquettes_unique ON contact_etiquettes (contact_id, etiquette_id)",
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

        println!("✅ Database tables initialized");

        // Migration automatique : Rendre contact_id optionnel dans investissements
        self.migrate_investissements_contact_id_optional()?;

        // Migration automatique : Ajouter famille_id aux contacts
        self.migrate_add_famille_id()?;

        // Migration automatique : Ajouter role_famille aux contacts
        self.migrate_add_role_famille()?;

        // Migration automatique : Ajouter filleul_categorie aux contacts
        self.migrate_add_filleul_categorie()?;

        // Migration automatique : Ajouter dates de suivi filleul aux contacts
        self.migrate_add_filleul_dates()?;

        // Migration automatique : Ajouter prescripteur_id aux contacts
        self.migrate_add_prescripteur_id()?;

        // Migration automatique : Ajouter date_fin_pret aux investissements
        self.migrate_add_date_fin_pret()?;

        self.migrate_alertes_crud_schema()?;
        self.migrate_backfill_filleul_categorie()?;
        self.migrate_add_email_envoi_prevu()?;
        self.migrate_add_email_envoi_heure()?;
        self.migrate_contact_etiquettes_contact_index()?;
        self.migrate_etiquettes_actif()?;
        self.migrate_templates_email_agenda_link_id()?;
        self.migrate_templates_email_relance_template_id()?;
        self.migrate_contact_etiquettes_email_suivi()?;
        self.migrate_contact_etiquette_auto_exclusions()?;

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

    fn migrate_contact_etiquettes_contact_index(&self) -> Result<()> {
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS contact_etiquettes_contact_idx ON contact_etiquettes (contact_id)",
            [],
        )?;
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
    pub fn open_in_memory_for_tests() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        let db = Database { conn };
        db.init_tables()?;
        Ok(db)
    }

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
