# Correction rapide : Créer les contacts + foyers manquants pour les couples
Write-Host "=== CORRECTION MODULE FOYERS - CREATION AUTO ===" -ForegroundColor Cyan
Write-Host ""

# Étape 1 : Arrêter l'app
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) {
    Write-Host "   Arret du processus PID $proc" -ForegroundColor Gray
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

# Étape 2 : Relancer (pas besoin de cargo clean, juste du code TS)
Write-Host ""
Write-Host "2. Relancement de l'application..." -ForegroundColor Yellow
Write-Host "   (Compilation rapide, TypeScript seulement)" -ForegroundColor Gray
Write-Host ""

npm run tauri:dev -- --release
