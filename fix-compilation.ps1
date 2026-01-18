Write-Host "=== Nettoyage et recompilation ===" -ForegroundColor Cyan
Write-Host ""

# Arreter les processus
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*patrimoine*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "   OK" -ForegroundColor Green

# Nettoyer le cache de build
Write-Host ""
Write-Host "2. Nettoyage du cache de compilation..." -ForegroundColor Yellow
cd D:\crm\src-tauri
cargo clean
cd D:\crm
Write-Host "   OK" -ForegroundColor Green

# Supprimer la base pour forcer la recreation
Write-Host ""
Write-Host "3. Suppression de l'ancienne base..." -ForegroundColor Yellow
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"
if (Test-Path $dbPath) {
    Remove-Item $dbPath -Force
    Write-Host "   OK - Base supprimee" -ForegroundColor Green
} else {
    Write-Host "   OK - Aucune base a supprimer" -ForegroundColor Gray
}

# Supprimer les fichiers PDB temporaires
Write-Host ""
Write-Host "4. Nettoyage des fichiers temporaires..." -ForegroundColor Yellow
Remove-Item "$env:TEMP\rustc*" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "   OK" -ForegroundColor Green

Write-Host ""
Write-Host "5. Recompilation et lancement..." -ForegroundColor Yellow
Write-Host "   (Cela va prendre 2-3 minutes)" -ForegroundColor Gray
Write-Host ""

npm run tauri:dev
