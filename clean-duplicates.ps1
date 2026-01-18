# Script pour nettoyer les doublons d'investissements
# Garde le plus ancien investissement et supprime les doublons

Write-Host ""
Write-Host "🧹 NETTOYAGE DES DOUBLONS D'INVESTISSEMENTS" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "❌ Base de données non trouvée: $dbPath" -ForegroundColor Red
    exit 1
}

# 1. Sauvegarder d'abord
Write-Host "1️⃣ Sauvegarde de la base..." -ForegroundColor Yellow
$backupPath = "$env:APPDATA\com.patrimoine-crm.app\BACKUP_before_cleanup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
Copy-Item $dbPath $backupPath
Write-Host "   ✅ Sauvegarde: $backupPath" -ForegroundColor Green

# 2. Arrêter l'application
Write-Host "2️⃣ Arrêt de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1
if ($proc) {
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
    Write-Host "   ✅ Application arrêtée" -ForegroundColor Green
}

# 3. Nettoyer les doublons avec SQLite
Write-Host "3️⃣ Nettoyage des doublons..." -ForegroundColor Yellow

$sqlCleanup = @"
-- Supprimer les doublons d'investissements (garder le plus ancien = id le plus petit)
DELETE FROM investissements 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM investissements 
    GROUP BY 
        COALESCE(contact_id, 0), 
        COALESCE(foyer_id, 0), 
        type_produit, 
        nom_produit, 
        montant_initial
);

-- Supprimer les foyers en double (garder le plus ancien)
DELETE FROM foyers 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM foyers 
    GROUP BY nom
);

-- Réassigner les contacts aux foyers restants si nécessaire
UPDATE contacts 
SET foyer_id = (
    SELECT MIN(f.id) 
    FROM foyers f 
    WHERE f.nom LIKE '%' || contacts.nom || '%'
)
WHERE foyer_id IS NOT NULL 
AND foyer_id NOT IN (SELECT id FROM foyers);

-- Afficher le résultat
SELECT 'Investissements restants: ' || COUNT(*) FROM investissements;
SELECT 'Foyers restants: ' || COUNT(*) FROM foyers;
"@

# Utiliser sqlite3 si disponible, sinon afficher les instructions
$sqlite3 = Get-Command sqlite3 -ErrorAction SilentlyContinue

if ($sqlite3) {
    $sqlCleanup | sqlite3 $dbPath
    Write-Host "   ✅ Nettoyage effectué" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️  SQLite non trouvé. Exécutez manuellement:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   1. Téléchargez SQLite: https://www.sqlite.org/download.html" -ForegroundColor White
    Write-Host "   2. Ouvrez la base: sqlite3 '$dbPath'" -ForegroundColor White
    Write-Host "   3. Exécutez ces commandes:" -ForegroundColor White
    Write-Host ""
    Write-Host $sqlCleanup -ForegroundColor Gray
    Write-Host ""
    
    # Alternative: utiliser Node.js avec better-sqlite3
    Write-Host "📦 Alternative avec Node.js..." -ForegroundColor Cyan
    
    $nodeScript = @"
const Database = require('better-sqlite3');
const db = new Database('$($dbPath -replace '\\', '\\\\')');

// Compter avant
const before = db.prepare('SELECT COUNT(*) as count FROM investissements').get();
console.log('Investissements avant: ' + before.count);

// Supprimer les doublons
const result = db.prepare(\`
    DELETE FROM investissements 
    WHERE id NOT IN (
        SELECT MIN(id) 
        FROM investissements 
        GROUP BY 
            COALESCE(contact_id, 0), 
            COALESCE(foyer_id, 0), 
            type_produit, 
            nom_produit, 
            montant_initial
    )
\`).run();

console.log('Doublons supprimés: ' + result.changes);

// Compter après
const after = db.prepare('SELECT COUNT(*) as count FROM investissements').get();
console.log('Investissements après: ' + after.count);

db.close();
"@
    
    Set-Content -Path "D:\crm\temp-cleanup.js" -Value $nodeScript
    
    Push-Location D:\crm
    npm exec -- node temp-cleanup.js 2>&1
    Remove-Item "D:\crm\temp-cleanup.js" -ErrorAction SilentlyContinue
    Pop-Location
}

# 4. Relancer l'application
Write-Host ""
Write-Host "4️⃣ Redémarrage de l'application..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

cd D:\crm
npm run tauri:dev -- --release

Write-Host ""
Write-Host "✅ TERMINÉ !" -ForegroundColor Green
Write-Host "Les doublons ont été supprimés. L'encours total devrait être correct." -ForegroundColor Cyan
