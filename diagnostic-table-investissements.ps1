# DIAGNOSTIC : Vérifier la structure de la table investissements
Write-Host "=== DIAGNOSTIC TABLE INVESTISSEMENTS ===" -ForegroundColor Cyan
Write-Host ""

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (Test-Path $dbPath) {
    Write-Host "Base de donnees trouvee : $dbPath" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "Structure actuelle de la table investissements :" -ForegroundColor Yellow
    Write-Host "------------------------------------------------" -ForegroundColor Gray
    
    $query = "PRAGMA table_info(investissements);"
    $result = $query | sqlite3 $dbPath
    
    Write-Host $result
    Write-Host ""
    
    # Chercher si contact_id a NOT NULL
    if ($result -match "contact_id.*1.*") {
        Write-Host "PROBLEME DETECTE : contact_id a toujours la contrainte NOT NULL !" -ForegroundColor Red
        Write-Host "La migration n'a pas ete appliquee correctement." -ForegroundColor Red
    } else {
        Write-Host "OK : contact_id est optionnel" -ForegroundColor Green
    }
    
} else {
    Write-Host "Base de donnees non trouvee : $dbPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "Appuyez sur une touche pour continuer..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
