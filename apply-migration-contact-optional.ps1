# Appliquer la migration pour rendre contact_id optionnel
Write-Host "Application de la migration 0006..." -ForegroundColor Yellow

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "ERREUR : Base de donnees non trouvee a $dbPath" -ForegroundColor Red
    Write-Host "Lancez l'application au moins une fois avant d'appliquer la migration." -ForegroundColor Yellow
    exit 1
}

Write-Host "Base de donnees trouvee : $dbPath" -ForegroundColor Green

try {
    $sqlContent = Get-Content -Path "drizzle\0006_make_contact_id_optional.sql" -Raw
    $sqlContent | sqlite3 $dbPath
    
    Write-Host "Migration appliquee avec succes !" -ForegroundColor Green
} catch {
    Write-Host "ERREUR lors de l'application de la migration : $_" -ForegroundColor Red
    exit 1
}
