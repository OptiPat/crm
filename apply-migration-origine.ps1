# Script pour appliquer la migration "origine" sur la base de données existante
# Exécute: .\apply-migration-origine.ps1

Write-Host "🔄 Application de la migration 'origine' sur investissements..." -ForegroundColor Cyan

# Chemin de la base de données (AppData Roaming pour Tauri)
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "❌ Base de données non trouvée: $dbPath" -ForegroundColor Red
    exit 1
}

# Utiliser Node.js avec better-sqlite3 pour appliquer la migration
$nodeScript = @"
const Database = require('better-sqlite3');
const db = new Database('$($dbPath.Replace('\', '\\'))');

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
    
} catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
} finally {
    db.close();
}
"@

# Exécuter via Node.js depuis le répertoire du projet (pour avoir accès aux node_modules)
$tempFile = Join-Path $PSScriptRoot "temp-migration.cjs"
$nodeScript | Out-File -FilePath $tempFile -Encoding UTF8

try {
    Push-Location $PSScriptRoot
    node $tempFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Migration appliquée avec succès!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ Erreur lors de la migration" -ForegroundColor Red
    }
} finally {
    Pop-Location
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}
