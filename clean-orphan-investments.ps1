# Script pour nettoyer les investissements orphelins
# Ces investissements n'ont plus de contact ni de foyer associé

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "❌ Base de données non trouvée: $dbPath" -ForegroundColor Red
    exit 1
}

Write-Host "🔍 Analyse des investissements orphelins..." -ForegroundColor Cyan

# Utiliser sqlite3 pour analyser et nettoyer
$sqliteExe = "sqlite3"

# Compter les investissements orphelins
$countOrphans = @"
SELECT COUNT(*) FROM investissements 
WHERE (contact_id IS NULL OR contact_id NOT IN (SELECT id FROM contacts))
  AND (foyer_id IS NULL OR foyer_id NOT IN (SELECT id FROM foyers));
"@

$orphanCount = & $sqliteExe $dbPath $countOrphans 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur sqlite3. Tentative avec better-sqlite3..." -ForegroundColor Yellow
    
    # Fallback: utiliser Node.js avec better-sqlite3
    $nodeScript = @"
const Database = require('better-sqlite3');
const db = new Database('$($dbPath -replace '\\', '\\\\')');

// Compter les orphelins
const countOrphans = db.prepare(\`
    SELECT COUNT(*) as count FROM investissements 
    WHERE (contact_id IS NULL OR contact_id NOT IN (SELECT id FROM contacts))
      AND (foyer_id IS NULL OR foyer_id NOT IN (SELECT id FROM foyers))
\`).get();

console.log('Investissements orphelins trouvés:', countOrphans.count);

if (countOrphans.count > 0) {
    // Afficher les détails
    const orphans = db.prepare(\`
        SELECT id, type_produit, nom_produit, montant_initial, contact_id, foyer_id 
        FROM investissements 
        WHERE (contact_id IS NULL OR contact_id NOT IN (SELECT id FROM contacts))
          AND (foyer_id IS NULL OR foyer_id NOT IN (SELECT id FROM foyers))
    \`).all();
    
    console.log('\\nDétails des investissements orphelins:');
    orphans.forEach(inv => {
        console.log(\`  - ID \${inv.id}: \${inv.type_produit} - \${inv.nom_produit} - \${inv.montant_initial}€ (contact_id: \${inv.contact_id}, foyer_id: \${inv.foyer_id})\`);
    });
    
    // Supprimer les orphelins
    const deleteResult = db.prepare(\`
        DELETE FROM investissements 
        WHERE (contact_id IS NULL OR contact_id NOT IN (SELECT id FROM contacts))
          AND (foyer_id IS NULL OR foyer_id NOT IN (SELECT id FROM foyers))
    \`).run();
    
    console.log(\`\\n✅ \${deleteResult.changes} investissements orphelins supprimés\`);
}

// Vérifier l'encours restant
const encours = db.prepare('SELECT SUM(montant_initial) as total FROM investissements').get();
console.log('\\nEncours total après nettoyage:', encours.total || 0, '€');

db.close();
"@
    
    $nodeScript | node
} else {
    Write-Host "Investissements orphelins trouvés: $orphanCount" -ForegroundColor Yellow
    
    if ([int]$orphanCount -gt 0) {
        Write-Host "`n🗑️ Suppression des investissements orphelins..." -ForegroundColor Cyan
        
        $deleteOrphans = @"
DELETE FROM investissements 
WHERE (contact_id IS NULL OR contact_id NOT IN (SELECT id FROM contacts))
  AND (foyer_id IS NULL OR foyer_id NOT IN (SELECT id FROM foyers));
"@
        & $sqliteExe $dbPath $deleteOrphans
        
        Write-Host "✅ Investissements orphelins supprimés" -ForegroundColor Green
    }
    
    # Vérifier l'encours restant
    $encours = & $sqliteExe $dbPath "SELECT COALESCE(SUM(montant_initial), 0) FROM investissements;"
    Write-Host "`nEncours total après nettoyage: $encours €" -ForegroundColor Cyan
}

Write-Host "`n📌 Redémarre l'application pour voir les changements" -ForegroundColor Yellow
