#!/usr/bin/env pwsh
# Nettoyage complet et relance

Write-Host "Nettoyage complet..." -ForegroundColor Cyan

# Arreter l'app
Get-Process -Name "patrimoine-crm" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# Nettoyer cargo
Write-Host "Nettoyage du cache Cargo..." -ForegroundColor Yellow
Set-Location "D:\crm\src-tauri"
cargo clean
Set-Location "D:\crm"

# Supprimer node_modules/.vite
Write-Host "Nettoyage du cache Vite..." -ForegroundColor Yellow
if (Test-Path "node_modules\.vite") {
    Remove-Item "node_modules\.vite" -Recurse -Force
}

Write-Host "Lancement en mode dev normal..." -ForegroundColor Green
npm run tauri:dev
