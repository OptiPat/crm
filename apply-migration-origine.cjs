// Script pour appliquer la migration "origine" sur investissements
// Exécuter depuis le dossier du projet: node apply-migration-origine.cjs

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Chemin de la base de données Tauri
const dbPath = path.join(
  process.env.APPDATA || process.env.HOME,
  'com.patrimoine-crm.app',
  'patrimoine-crm.db'
);

console.log('🔄 Application de la migration "origine" sur investissements...');
console.log('📁 Base de données:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('❌ Base de données non trouvée:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  // Vérifier si la colonne existe déjà
  const columns = db.pragma('table_info(investissements)');
  const hasOrigine = columns.some(col => col.name === 'origine');
  
  if (hasOrigine) {
    console.log('✅ La colonne "origine" existe déjà.');
  } else {
    // Ajouter la colonne
    db.exec("ALTER TABLE investissements ADD COLUMN origine TEXT NOT NULL DEFAULT 'MON_CONSEIL'");
    console.log('✅ Colonne "origine" ajoutée avec succès!');
  }
  
  // Vérifier le résultat
  const updated = db.pragma('table_info(investissements)');
  console.log('📋 Colonnes actuelles:', updated.map(c => c.name).join(', '));
  
  // Compter les investissements
  const count = db.prepare('SELECT COUNT(*) as count FROM investissements').get();
  console.log(`📊 Nombre d'investissements: ${count.count}`);
  
  console.log('\n✅ Migration appliquée avec succès!');
  
} catch (error) {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
} finally {
  db.close();
}
