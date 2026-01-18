const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'com.patrimoine-crm.app', 'patrimoine-crm.db');
const db = new Database(dbPath);

console.log('=== ANALYSE DU PROBLÈME D\'ENCOURS ===\n');

// 1. Contacts par catégorie
console.log('📊 CONTACTS PAR CATÉGORIE:');
const contactsByCategory = db.prepare(`
    SELECT categorie, COUNT(*) as count 
    FROM contacts 
    GROUP BY categorie
`).all();
contactsByCategory.forEach(c => console.log(`  - ${c.categorie}: ${c.count}`));

// 2. Liste des contacts
console.log('\n👥 LISTE DES CONTACTS:');
const contacts = db.prepare('SELECT id, prenom, nom, categorie, foyer_id FROM contacts').all();
contacts.forEach(c => console.log(`  - ID ${c.id}: ${c.prenom} ${c.nom} (${c.categorie}) - foyer_id: ${c.foyer_id}`));

// 3. Foyers
console.log('\n🏠 FOYERS:');
const foyers = db.prepare('SELECT id, nom FROM foyers').all();
if (foyers.length === 0) {
    console.log('  Aucun foyer');
} else {
    foyers.forEach(f => console.log(`  - ID ${f.id}: ${f.nom}`));
}

// 4. Investissements
console.log('\n💰 INVESTISSEMENTS:');
const investissements = db.prepare(`
    SELECT i.id, i.type_produit, i.nom_produit, i.montant_initial, i.contact_id, i.foyer_id,
           c.prenom as contact_prenom, c.nom as contact_nom,
           f.nom as foyer_nom
    FROM investissements i
    LEFT JOIN contacts c ON i.contact_id = c.id
    LEFT JOIN foyers f ON i.foyer_id = f.id
`).all();

let total = 0;
investissements.forEach(inv => {
    const owner = inv.contact_id ? `Contact: ${inv.contact_prenom} ${inv.contact_nom}` : 
                  inv.foyer_id ? `Foyer: ${inv.foyer_nom}` : 'ORPHELIN!';
    // Le montant est stocké en centimes
    const montantEuros = inv.montant_initial / 100;
    console.log(`  - ID ${inv.id}: ${inv.type_produit} - ${inv.nom_produit} - ${montantEuros.toLocaleString('fr-FR')} € (${owner})`);
    total += inv.montant_initial;
});

console.log(`\n📈 TOTAL ENCOURS: ${(total/100).toLocaleString('fr-FR')} €`);

// 5. Vérifier si les contacts liés aux investissements sont des CLIENTS
console.log('\n🔍 PROBLÈME IDENTIFIÉ:');
const investWithSuspects = db.prepare(`
    SELECT DISTINCT c.id, c.prenom, c.nom, c.categorie
    FROM investissements i
    JOIN contacts c ON i.contact_id = c.id
    WHERE c.categorie = 'SUSPECT'
`).all();

if (investWithSuspects.length > 0) {
    console.log('  ⚠️ Des investissements sont liés à des SUSPECTS (pas des CLIENTS):');
    investWithSuspects.forEach(c => console.log(`     - ${c.prenom} ${c.nom} (${c.categorie})`));
    console.log('\n  → Ces contacts devraient être des CLIENTS car ils ont des investissements!');
}

db.close();
