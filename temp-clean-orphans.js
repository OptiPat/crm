const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'com.patrimoine-crm.app', 'patrimoine-crm.db');
console.log('📂 Base de données:', dbPath);

const db = new Database(dbPath);

// Compter les orphelins
const countOrphans = db.prepare(`
    SELECT COUNT(*) as count FROM investissements 
    WHERE (contact_id IS NULL OR contact_id NOT IN (SELECT id FROM contacts))
      AND (foyer_id IS NULL OR foyer_id NOT IN (SELECT id FROM foyers))
`).get();

console.log('🔍 Investissements orphelins trouvés:', countOrphans.count);

if (countOrphans.count > 0) {
    // Afficher les détails
    const orphans = db.prepare(`
        SELECT id, type_produit, nom_produit, montant_initial, contact_id, foyer_id 
        FROM investissements 
        WHERE (contact_id IS NULL OR contact_id NOT IN (SELECT id FROM contacts))
          AND (foyer_id IS NULL OR foyer_id NOT IN (SELECT id FROM foyers))
        LIMIT 15
    `).all();
    
    console.log('\n📋 Exemples d\'investissements orphelins:');
    orphans.forEach(inv => {
        console.log(`  - ID ${inv.id}: ${inv.type_produit} - ${inv.nom_produit} - ${inv.montant_initial} EUR (contact: ${inv.contact_id}, foyer: ${inv.foyer_id})`);
    });
    
    // Supprimer les orphelins
    const deleteResult = db.prepare(`
        DELETE FROM investissements 
        WHERE (contact_id IS NULL OR contact_id NOT IN (SELECT id FROM contacts))
          AND (foyer_id IS NULL OR foyer_id NOT IN (SELECT id FROM foyers))
    `).run();
    
    console.log(`\n✅ ${deleteResult.changes} investissements orphelins supprimés`);
}

// Vérifier l'encours restant
const encours = db.prepare('SELECT SUM(montant_initial) as total FROM investissements').get();
console.log('\n💰 Encours total après nettoyage:', encours.total || 0, 'EUR');

// Vérifier le nombre de contacts
const contacts = db.prepare('SELECT COUNT(*) as count FROM contacts').get();
console.log('👥 Nombre de contacts:', contacts.count);

db.close();
console.log('\n📌 Rafraîchis le dashboard pour voir les changements');
