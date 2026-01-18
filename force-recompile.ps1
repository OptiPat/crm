#!/usr/bin/env pwsh
# Force la recompilation complete

Write-Host "Arret de l'application..." -ForegroundColor Yellow
Get-Process -Name "patrimoine-crm" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "Nettoyage complet du cache Rust..." -ForegroundColor Cyan
Set-Location "D:\crm\src-tauri"
cargo clean
Set-Location "D:\crm"

Write-Host "Relancement en mode release..." -ForegroundColor Green
npm run tauri:dev -- --release
