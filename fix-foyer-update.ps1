# Script pour recompiler et relancer l'app
Write-Host "Arret de l'application..." -ForegroundColor Yellow

# Arrêter les processus sur le port 1420
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) {
    Write-Host "   Arret du processus PID $proc" -ForegroundColor Gray
    taskkill /F /PID $proc 2>$null
}

Write-Host ""
Write-Host "Nettoyage Rust..." -ForegroundColor Yellow
cd src-tauri
cargo clean
cd ..

Write-Host ""
Write-Host "Compilation et lancement..." -ForegroundColor Yellow
npm run tauri:dev -- --release
