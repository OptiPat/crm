# Solution sans SQLite : Migration automatique au démarrage
Write-Host "=== MIGRATION AUTOMATIQUE (SANS SQLITE3) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cette solution applique la migration directement dans le code Rust" -ForegroundColor Yellow
Write-Host "La migration se fera automatiquement au prochain démarrage de l'app" -ForegroundColor Yellow
Write-Host ""

# Arrêter l'app
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) {
    Write-Host "   Arret du processus PID $proc" -ForegroundColor Gray
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

# Nettoyage Rust
Write-Host ""
Write-Host "2. Nettoyage Rust..." -ForegroundColor Yellow
cd src-tauri
cargo clean
cd ..
Write-Host "   + Clean effectue" -ForegroundColor Green

# Relancer (la migration se fera au démarrage)
Write-Host ""
Write-Host "3. Compilation et lancement..." -ForegroundColor Yellow
Write-Host ""
Write-Host "IMPORTANT : Cherchez dans les logs au démarrage :" -ForegroundColor Cyan
Write-Host "  - 'Migration : Rendre contact_id optionnel...' " -ForegroundColor White
Write-Host "  - 'Migration appliquee : contact_id est maintenant optionnel' " -ForegroundColor White
Write-Host ""
Write-Host "Si vous voyez ces messages, la migration a reussi !" -ForegroundColor Green
Write-Host ""

npm run tauri:dev -- --release
