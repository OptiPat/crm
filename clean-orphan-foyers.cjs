const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'com.patrimoine-crm.app', 'patrimoine-crm.db');
const db = new Database(dbPath);

console.log('=== NETTOYAGE DES FOYERS ET INVESTISSEMENTS ORPHELINS ===\n');

// 1. Identifier les foyers sans contacts
console.log('🔍 Foyers sans contacts (orphelins):');
const orphanFoyers = db.prepare(`
    SELECT f.id, f.nom
    FROM foyers f
    WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.foyer_id = f.id)
`).all();

console.log(`  Trouvé: ${orphanFoyers.length} foyers orphelins`);
orphanFoyers.slice(0, 10).forEach(f => console.log(`  - ID ${f.id}: ${f.nom}`));
if (orphanFoyers.length > 10) console.log(`  ... et ${orphanFoyers.length - 10} autres`);

// 2. Compter les investissements sur ces foyers
const orphanFoyerIds = orphanFoyers.map(f => f.id);
if (orphanFoyerIds.length > 0) {
    const placeholders = orphanFoyerIds.map(() => '?').join(',');
    const investOnOrphanFoyers = db.prepare(`
        SELECT COUNT(*) as count, SUM(montant_initial) as total
        FROM investissements
        WHERE foyer_id IN (${placeholders})
    `).get(...orphanFoyerIds);
    
    console.log(`\n💰 Investissements sur foyers orphelins:`);
    console.log(`  - Nombre: ${investOnOrphanFoyers.count}`);
    console.log(`  - Total: ${((investOnOrphanFoyers.total || 0) / 100).toLocaleString('fr-FR')} €`);
    
    // 3. Supprimer les investissements des foyers orphelins
    console.log('\n🗑️ Suppression des investissements sur foyers orphelins...');
    const deleteInvest = db.prepare(`
        DELETE FROM investissements WHERE foyer_id IN (${placeholders})
    `).run(...orphanFoyerIds);
    console.log(`  ✅ ${deleteInvest.changes} investissements supprimés`);
    
    // 4. Supprimer les foyers orphelins
    console.log('\n🗑️ Suppression des foyers orphelins...');
    const deleteFoyers = db.prepare(`
        DELETE FROM foyers WHERE id IN (${placeholders})
    `).run(...orphanFoyerIds);
    console.log(`  ✅ ${deleteFoyers.changes} foyers supprimés`);
}

// 5. Vérification finale
console.log('\n=== ÉTAT APRÈS NETTOYAGE ===');

const remainingFoyers = db.prepare('SELECT COUNT(*) as count FROM foyers').get();
console.log(`🏠 Foyers restants: ${remainingFoyers.count}`);

const remainingInvest = db.prepare('SELECT COUNT(*) as count, SUM(montant_initial) as total FROM investissements').get();
console.log(`💰 Investissements restants: ${remainingInvest.count}`);
console.log(`💰 Encours total: ${((remainingInvest.total || 0) / 100).toLocaleString('fr-FR')} €`);

const remainingContacts = db.prepare('SELECT COUNT(*) as count FROM contacts').get();
console.log(`👥 Contacts: ${remainingContacts.count}`);

db.close();
console.log('\n📌 Rafraîchis le dashboard!');
