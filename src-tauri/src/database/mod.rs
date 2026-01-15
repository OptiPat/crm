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
                categorie TEXT NOT NULL,
                civilite TEXT,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                email TEXT,
                telephone TEXT,
                adresse TEXT,
                code_postal TEXT,
                ville TEXT,
                date_naissance TEXT,
                profession TEXT,
                situation_familiale TEXT,
                source_lead TEXT,
                profil_risque_sri INTEGER,
                date_dernier_contact TEXT,
                date_prochain_suivi TEXT,
                statut_suivi TEXT NOT NULL DEFAULT 'ACTIF',
                notes TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (foyer_id) REFERENCES foyers(id) ON DELETE SET NULL
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
        
        println!("✅ Database tables initialized");
        
        Ok(())
    }
    
    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }
}
