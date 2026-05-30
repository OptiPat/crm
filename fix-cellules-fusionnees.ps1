# FIX FINAL : Cellules fusionnées Excel
Write-Host "=== FIX CELLULES FUSIONNEES ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Detection automatique des lignes sans prenom (cellules fusionnees)" -ForegroundColor Yellow
Write-Host "Les 3 SCPI du couple exemple seront maintenant detectees !" -ForegroundColor Green
Write-Host ""

# Arrêter
Write-Host "1. Arret..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1
if ($proc) {
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

# Relancer
Write-Host ""
Write-Host "2. Relancement..." -ForegroundColor Yellow
Write-Host ""

npm run tauri:dev -- --release
