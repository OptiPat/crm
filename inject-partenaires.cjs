// Script Node.js pour injecter les partenaires dans la base existante
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
  
  // Vérifier le nombre actuel
  const { count: currentCount } = db.prepare('SELECT COUNT(*) as count FROM partenaires').get();
  console.log('📊 Partenaires actuels:', currentCount);
  
  if (currentCount > 0) {
    console.log('⚠️  Des partenaires existent déjà. Voulez-vous continuer ? (Ctrl+C pour annuler)');
  }
  
  // Préparer l'insertion
  const insert = db.prepare(`
    INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) 
    VALUES (?, ?, unixepoch(), unixepoch())
  `);
  
  const insertMany = db.transaction((partenaires) => {
    for (const p of partenaires) insert.run(p.type, p.nom);
  });
  
  // Liste des partenaires
  const partenaires = [
    // Assureurs
    { type: 'ASSUREUR', nom: 'Oddo' },
    { type: 'ASSUREUR', nom: 'Vie Plus' },
    { type: 'ASSUREUR', nom: 'Apicil' },
    { type: 'ASSUREUR', nom: 'Eres Swisslife' },
    { type: 'ASSUREUR', nom: 'Eres Spirica' },
    { type: 'ASSUREUR', nom: 'Eres Entreprise' },
    
    // Sociétés de gestion SCPI
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Advenis' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Altarea IM' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Alderan' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Voisin' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Sofidy' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Norma Capital' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Mata Capital' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Perial AM' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Arkea Reim' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'Atream' },
    { type: 'SOCIETE_GESTION_SCPI', nom: 'La Française' },
    
    // Promoteurs
    { type: 'PROMOTEUR', nom: 'Cogedim' },
    { type: 'PROMOTEUR', nom: 'Colosseum' },
    { type: 'PROMOTEUR', nom: 'Histoire & Patrimoine' },
    { type: 'PROMOTEUR', nom: 'CIR' },
    { type: 'PROMOTEUR', nom: 'Caractere' },
    { type: 'PROMOTEUR', nom: 'Edouard Denis' },
    { type: 'PROMOTEUR', nom: 'Tagerim' },
    { type: 'PROMOTEUR', nom: 'Corim' },
    { type: 'PROMOTEUR', nom: 'Urbis' },
    { type: 'PROMOTEUR', nom: 'Bouygues Immobilier' },
    { type: 'PROMOTEUR', nom: 'Sporting Promotion' },
    { type: 'PROMOTEUR', nom: 'Helenis' },
    
    // Sociétés de gestion FIP/FCPI/FCPR
    { type: 'SOCIETE_GESTION_FIP', nom: 'Odyssée Venture' },
    { type: 'SOCIETE_GESTION_FIP', nom: 'Elevation' },
    { type: 'SOCIETE_GESTION_FIP', nom: 'NextStage' },
    { type: 'SOCIETE_GESTION_FIP', nom: 'Eiffeil' },
    
    // G3F
    { type: 'G3F', nom: 'Inter Invest' }
  ];
  
  console.log('🚀 Insertion des', partenaires.length, 'partenaires...');
  insertMany(partenaires);
  
  // Vérifier le résultat
  const { count: newCount } = db.prepare('SELECT COUNT(*) as count FROM partenaires').get();
  console.log('✅ Terminé ! Total de partenaires:', newCount);
  
  // Afficher par type
  console.log('\n📋 Répartition par type:');
  const stats = db.prepare('SELECT type_partenaire, COUNT(*) as nb FROM partenaires GROUP BY type_partenaire').all();
  stats.forEach(s => console.log(`   • ${s.type_partenaire}: ${s.nb}`));
  
  db.close();
  console.log('\n🎉 Relance l\'application maintenant !');
  
} catch (error) {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
}
