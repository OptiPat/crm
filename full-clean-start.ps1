#!/usr/bin/env pwsh
# Nettoyage complet incluant les fichiers temporaires

Write-Host "Nettoyage complet..." -ForegroundColor Cyan

# Arreter l'app
Get-Process -Name "patrimoine-crm" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# Supprimer le dossier target complet
Write-Host "Suppression du dossier target..." -ForegroundColor Yellow
if (Test-Path "D:\crm\src-tauri\target") {
    Remove-Item "D:\crm\src-tauri\target" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   Supprime" -ForegroundColor Green
}

# Nettoyer les fichiers temporaires Windows
Write-Host "Nettoyage des fichiers temporaires..." -ForegroundColor Yellow
$tempPath = "$env:TEMP\rustc*"
Get-ChildItem $env:TEMP -Filter "rustc*" -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Supprimer node_modules/.vite
if (Test-Path "node_modules\.vite") {
    Remove-Item "node_modules\.vite" -Recurse -Force
}

Write-Host ""
Write-Host "Nettoyage termine !" -ForegroundColor Green
Write-Host "Lancement en mode dev..." -ForegroundColor Cyan

Set-Location "D:\crm"
npm run tauri:dev
