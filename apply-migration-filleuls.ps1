# Script pour appliquer la migration filleuls
# Ce script applique la migration 0004 à la base de données SQLite

Write-Host "🔄 Application de la migration filleuls..." -ForegroundColor Cyan

# Chemin vers sqlite3 (à ajuster selon votre installation)
$sqlitePath = "sqlite3"

# Trouver le fichier de base de données
$appDataPath = "$env:APPDATA\com.patrimoine.crm"
$dbPath = "$appDataPath\patrimoine.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "❌ Base de données non trouvée à : $dbPath" -ForegroundColor Red
    Write-Host "💡 L'application créera la nouvelle structure au premier démarrage." -ForegroundColor Yellow
    exit 0
}

Write-Host "✅ Base de données trouvée : $dbPath" -ForegroundColor Green

# Sauvegarder la base de données
$backupPath = "$appDataPath\patrimoine_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
Write-Host "💾 Création d'une sauvegarde : $backupPath" -ForegroundColor Yellow
Copy-Item $dbPath $backupPath

# Vérifier que sqlite3 est disponible
try {
    $null = & $sqlitePath -version
} catch {
    Write-Host "❌ sqlite3 n'est pas installé ou accessible." -ForegroundColor Red
    Write-Host "💡 Installez SQLite ou ajoutez-le au PATH système." -ForegroundColor Yellow
    exit 1
}

# Appliquer la migration
Write-Host "🔧 Application de la migration..." -ForegroundColor Cyan
$migrationFile = "drizzle\0004_add_filleul_categories_and_parrain.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Fichier de migration non trouvé : $migrationFile" -ForegroundColor Red
    exit 1
}

try {
    Get-Content $migrationFile | & $sqlitePath $dbPath
    Write-Host "✅ Migration appliquée avec succès !" -ForegroundColor Green
    Write-Host "📁 Sauvegarde conservée : $backupPath" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur lors de l'application de la migration : $_" -ForegroundColor Red
    Write-Host "🔄 Restauration de la sauvegarde..." -ForegroundColor Yellow
    Copy-Item $backupPath $dbPath -Force
    Write-Host "✅ Base de données restaurée" -ForegroundColor Green
    exit 1
}
