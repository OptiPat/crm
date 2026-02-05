const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'com.patrimoine-crm.app', 'patrimoine-crm.db');
const db = new Database(dbPath);

console.log('=== Création de la table templates_email ===');

// Vérifier si la table existe déjà
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='templates_email'").get();

if (tableExists) {
    console.log('La table "templates_email" existe déjà.');
    db.close();
    process.exit(0);
}

// Créer la table
const sql = `
CREATE TABLE templates_email (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    nom text NOT NULL,
    sujet text NOT NULL,
    corps text NOT NULL,
    categorie text NOT NULL,
    variables text,
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    updated_at integer DEFAULT (unixepoch()) NOT NULL
);
`;

try {
    db.exec(sql);
    console.log('✓ Table templates_email créée avec succès !');
} catch (error) {
    console.error('ERREUR:', error.message);
    process.exit(1);
} finally {
    db.close();
}
