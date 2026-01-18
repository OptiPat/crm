# Script pour appliquer la migration role_foyer
Write-Host "=== Application de la migration 0005_add_role_foyer ===" -ForegroundColor Cyan

# Chemin vers la base de donnees
$dbPath = "$env:APPDATA\com.crm-cgp.app\crm.db"

Write-Host "Chemin de la base : $dbPath" -ForegroundColor Yellow

if (-not (Test-Path $dbPath)) {
    Write-Host "ERREUR : Base de donnees non trouvee" -ForegroundColor Red
    exit 1
}

# Lire le contenu de la migration
$migrationSql = Get-Content ".\drizzle\0005_add_role_foyer.sql" -Raw

# Appliquer la migration
Write-Host "Application de la migration..." -ForegroundColor Cyan
sqlite3 $dbPath $migrationSql

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration appliquee avec succes !" -ForegroundColor Green
} else {
    Write-Host "Erreur lors de l'application de la migration" -ForegroundColor Red
    exit 1
}

# Verifier que la colonne existe
Write-Host "Verification de la structure de la table contacts..." -ForegroundColor Cyan
$result = sqlite3 $dbPath "PRAGMA table_info(contacts);" | Select-String "role_foyer"

if ($result) {
    Write-Host "Colonne role_foyer ajoutee avec succes !" -ForegroundColor Green
} else {
    Write-Host "La colonne role_foyer n'a pas ete trouvee" -ForegroundColor Red
    exit 1
}

Write-Host "=== Migration terminee ===" -ForegroundColor Cyan
