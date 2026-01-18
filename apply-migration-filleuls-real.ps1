# Script pour appliquer la migration filleuls sur la base de données réelle
# Ce script applique la migration 0004 à la base de données SQLite

Write-Host "🔄 Application de la migration filleuls..." -ForegroundColor Cyan

# Chemin de la base de données réelle
$appDataPath = "$env:APPDATA\com.patrimoine-crm.app"
$dbPath = "$appDataPath\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "❌ Base de données non trouvée à : $dbPath" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Base de données trouvée : $dbPath" -ForegroundColor Green

# Sauvegarder la base de données
$backupPath = "$appDataPath\patrimoine-crm_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
Write-Host "💾 Création d'une sauvegarde : $backupPath" -ForegroundColor Yellow
Copy-Item $dbPath $backupPath

Write-Host "⚠️ FERMETURE DE L'APPLICATION NÉCESSAIRE..." -ForegroundColor Yellow
Write-Host "Veuillez FERMER l'application Patrimoine CRM avant de continuer." -ForegroundColor Yellow
Write-Host ""
$confirmation = Read-Host "L'application est-elle fermée ? (o/N)"
if ($confirmation -ne "o" -and $confirmation -ne "O") {
    Write-Host "❌ Migration annulée" -ForegroundColor Red
    exit 0
}

# Utiliser SQLite intégré à .NET
Add-Type -Path "System.Data.SQLite"

try {
    # Ouvrir la connexion SQLite
    $connectionString = "Data Source=$dbPath;Version=3;"
    $connection = New-Object System.Data.SQLite.SQLiteConnection($connectionString)
    $connection.Open()
    
    Write-Host "🔧 Application de la migration..." -ForegroundColor Cyan
    
    # Lire le fichier de migration
    $migrationSQL = Get-Content "drizzle\0004_add_filleul_categories_and_parrain.sql" -Raw
    
    # Exécuter la migration
    $command = $connection.CreateCommand()
    $command.CommandText = $migrationSQL
    $command.ExecuteNonQuery() | Out-Null
    
    $connection.Close()
    
    Write-Host "✅ Migration appliquée avec succès !" -ForegroundColor Green
    Write-Host "📁 Sauvegarde conservée : $backupPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Vous pouvez maintenant relancer l'application." -ForegroundColor Green
    
} catch {
    Write-Host "❌ Erreur lors de l'application de la migration : $_" -ForegroundColor Red
    Write-Host "🔄 Restauration de la sauvegarde..." -ForegroundColor Yellow
    
    if ($connection) {
        $connection.Close()
    }
    
    Copy-Item $backupPath $dbPath -Force
    Write-Host "✅ Base de données restaurée" -ForegroundColor Green
    exit 1
}
