# Script pour redémarrer l'application proprement
Write-Host "🛑 Arrêt de tous les processus..." -ForegroundColor Yellow

# Tuer tous les processus
Get-Process -Name "node","patrimoine-crm" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Attendre que les ports se libèrent
Start-Sleep -Seconds 3

Write-Host "🚀 Lancement de l'application..." -ForegroundColor Green

# Lancer en mode release
npm run tauri:dev:release
