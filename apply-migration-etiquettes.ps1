# Script pour appliquer la migration etiquettes
Write-Host "=== Application de la migration 0007_add_etiquettes ===" -ForegroundColor Cyan

# Chemin vers la base de donnees
$dbPath = "$env:APPDATA\com.crm-cgp.app\crm.db"

Write-Host "Chemin de la base : $dbPath" -ForegroundColor Yellow

if (-not (Test-Path $dbPath)) {
    Write-Host "ERREUR : Base de donnees non trouvee" -ForegroundColor Red
    Write-Host "L'application doit etre lancee au moins une fois pour creer la base." -ForegroundColor Yellow
    exit 1
}

# Verifier si les tables existent deja
Write-Host "Verification si les tables existent deja..." -ForegroundColor Cyan
$existingTables = sqlite3 $dbPath ".tables" | Select-String "etiquettes"

if ($existingTables) {
    Write-Host "Les tables etiquettes existent deja. Migration ignoree." -ForegroundColor Yellow
    exit 0
}

# Lire et nettoyer le contenu de la migration (enlever les commentaires drizzle)
$migrationContent = Get-Content ".\drizzle\0007_add_etiquettes.sql" -Raw
# Enlever les marqueurs --> statement-breakpoint
$migrationSql = $migrationContent -replace "--> statement-breakpoint", ""

# Appliquer la migration
Write-Host "Application de la migration..." -ForegroundColor Cyan
$migrationSql | sqlite3 $dbPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration appliquee avec succes !" -ForegroundColor Green
} else {
    Write-Host "Erreur lors de l'application de la migration" -ForegroundColor Red
    exit 1
}

# Verifier que les tables existent
Write-Host "Verification de la structure..." -ForegroundColor Cyan

$etiquettesTable = sqlite3 $dbPath "PRAGMA table_info(etiquettes);" 
$contactEtiquettesTable = sqlite3 $dbPath "PRAGMA table_info(contact_etiquettes);"

if ($etiquettesTable -and $contactEtiquettesTable) {
    Write-Host "Tables creees avec succes !" -ForegroundColor Green
    Write-Host ""
    Write-Host "Table etiquettes :" -ForegroundColor Cyan
    sqlite3 $dbPath "PRAGMA table_info(etiquettes);"
    Write-Host ""
    Write-Host "Table contact_etiquettes :" -ForegroundColor Cyan
    sqlite3 $dbPath "PRAGMA table_info(contact_etiquettes);"
} else {
    Write-Host "Les tables n'ont pas ete trouvees" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Migration terminee ===" -ForegroundColor Cyan
