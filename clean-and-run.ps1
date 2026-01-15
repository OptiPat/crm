# Script pour nettoyer les processus et relancer Tauri
Write-Host "🧹 Nettoyage des processus en cours..." -ForegroundColor Yellow

# Tuer tous les processus Node
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Tuer les processus patrimoine-crm
Get-Process -Name "patrimoine-crm" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Attendre que les ports se libèrent
Start-Sleep -Seconds 2

Write-Host "✅ Processus nettoyés" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Lancement de Tauri en mode release..." -ForegroundColor Cyan

# Lancer Tauri en mode release
npm run tauri:dev:release
