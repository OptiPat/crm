// Script pour appliquer la migration étiquettes
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'com.patrimoine-crm.app', 'patrimoine-crm.db');
const sqlPath = path.join(__dirname, 'drizzle', '0007_add_etiquettes.sql');

console.log('=== Application de la migration 0007_add_etiquettes ===');
console.log('Base de données:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('ERREUR: Base de données non trouvée');
    process.exit(1);
}

const db = new Database(dbPath);

// Vérifier si les tables existent déjà
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='etiquettes'").get();

if (tableExists) {
    console.log('La table "etiquettes" existe déjà. Migration annulée.');
    db.close();
    process.exit(0);
}

// Lire le fichier SQL
const sql = fs.readFileSync(sqlPath, 'utf-8');

// Découper par statement-breakpoint et exécuter chaque partie
const statements = sql.split('--> statement-breakpoint');

console.log(`Exécution de ${statements.length} statements...`);

try {
    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (stmt) {
            console.log(`  [${i + 1}/${statements.length}] Exécution...`);
            db.exec(stmt);
        }
    }
    console.log('\n✓ Migration appliquée avec succès !');
    
    // Vérifier
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%etiquette%'").all();
    console.log('Tables créées:', tables.map(t => t.name).join(', '));
} catch (error) {
    console.error('ERREUR:', error.message);
    process.exit(1);
} finally {
    db.close();
}
