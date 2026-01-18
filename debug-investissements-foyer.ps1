# Test avec logs ultra-détaillés pour les investissements de foyer
Write-Host "=== DEBUG INVESTISSEMENTS DE FOYER ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Logs ajoutés :" -ForegroundColor Yellow
Write-Host "  - Compteur dans couplesLines lors de l'ajout" -ForegroundColor Gray
Write-Host "  - Detection si row.data.produit est vide" -ForegroundColor Gray
Write-Host "  - Details complets lors de la creation des investissements" -ForegroundColor Gray
Write-Host ""

# Étape 1 : Arrêter l'app
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) {
    Write-Host "   Arret du processus PID $proc" -ForegroundColor Gray
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

# Étape 2 : Relancer
Write-Host ""
Write-Host "2. Relancement de l'application..." -ForegroundColor Yellow
Write-Host ""
Write-Host "IMPORTANT : Apres l'import, verifiez les logs pour :" -ForegroundColor Cyan
Write-Host "  1. Combien de lignes dans couplesLines ?" -ForegroundColor White
Write-Host "  2. Est-ce que 'row.data.produit' contient bien le produit ?" -ForegroundColor White
Write-Host "  3. Est-ce que la section 'Traitement des investissements de foyer' apparait ?" -ForegroundColor White
Write-Host ""

npm run tauri:dev -- --release
