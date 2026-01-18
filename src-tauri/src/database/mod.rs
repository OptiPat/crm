use rusqlite::{Connection, Result};
use tauri::{AppHandle, Manager};

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
        
        println!("Database path: {:?}", db_path);
        
        // Ouvrir la connexion
        let conn = Connection::open(db_path)?;
        
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
        // Table foyers
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
                foyer_id INTEGER,
                role_foyer TEXT,
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
        
        // Table alertes
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS alertes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                type_alerte TEXT NOT NULL,
                titre TEXT NOT NULL,
                description TEXT,
                date_echeance TEXT NOT NULL,
                statut TEXT NOT NULL DEFAULT 'EN_ATTENTE',
                priorite TEXT NOT NULL DEFAULT 'NORMALE',
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        
        println!("✅ Database tables initialized");
        
        // Migration automatique : Rendre contact_id optionnel dans investissements
        self.migrate_investissements_contact_id_optional()?;
        
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
        self.conn.execute("DROP TABLE IF EXISTS investissements_new", [])?;
        
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
    
    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }
}
