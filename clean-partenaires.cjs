// Script pour nettoyer les doublons et afficher les partenaires
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'com.patrimoine-crm.app',
  'patrimoine-crm.db'
);

console.log('📂 Chemin base de données:', dbPath);

try {
  const db = new Database(dbPath);
  
  // Supprimer les doublons (garder le premier de chaque raison_sociale)
  console.log('🧹 Nettoyage des doublons...');
  db.exec(`
    DELETE FROM partenaires 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM partenaires 
      GROUP BY raison_sociale
    )
  `);
  
  // Vérifier le résultat
  const { count } = db.prepare('SELECT COUNT(*) as count FROM partenaires').get();
  console.log('✅ Total après nettoyage:', count, 'partenaires');
  
  // Afficher tous les partenaires par type
  console.log('\n📋 Liste complète:');
  const types = ['ASSUREUR', 'SOCIETE_GESTION_SCPI', 'PROMOTEUR', 'SOCIETE_GESTION_FIP', 'G3F'];
  
  types.forEach(type => {
    const partenaires = db.prepare('SELECT raison_sociale FROM partenaires WHERE type_partenaire = ? ORDER BY raison_sociale').all(type);
    if (partenaires.length > 0) {
      console.log(`\n${type} (${partenaires.length}):`);
      partenaires.forEach(p => console.log(`   • ${p.raison_sociale}`));
    }
  });
  
  db.close();
  
} catch (error) {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
}
