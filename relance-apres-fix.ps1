# Relancer après correction de la migration
Write-Host "=== RELANCEMENT APRES CORRECTION ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Correction appliquee : DROP TABLE IF EXISTS avant CREATE" -ForegroundColor Yellow
Write-Host ""

# Tuer tous les processus
Write-Host "1. Arret des processus..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -match "patrimoine|node"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Relancer
Write-Host ""
Write-Host "2. Relancement de l'application..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Cherchez dans les logs :" -ForegroundColor Cyan
Write-Host "  - 'Migration : Rendre contact_id optionnel...' " -ForegroundColor White
Write-Host "  - 'Migration appliquee : contact_id est maintenant optionnel' " -ForegroundColor White
Write-Host ""

npm run tauri:dev -- --release
