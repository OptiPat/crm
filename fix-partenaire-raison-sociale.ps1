# Correction rapide : raison_sociale pour les partenaires
Write-Host "=== CORRECTION PARTENAIRES ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Correction appliquee : 'nom' remplace par 'raison_sociale'" -ForegroundColor Yellow
Write-Host ""

# Arrêter l'app
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) {
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

# Relancer (pas de cargo clean, juste du TS)
Write-Host ""
Write-Host "2. Relancement..." -ForegroundColor Yellow
Write-Host "   (Rapide, TypeScript seulement)" -ForegroundColor Gray
Write-Host ""

npm run tauri:dev -- --release
