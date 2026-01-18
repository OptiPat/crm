Write-Host "=== Solution au probleme LNK1318 ===" -ForegroundColor Cyan
Write-Host ""

# 1. Arreter les processus
Write-Host "1. Arret de tous les processus..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*patrimoine*" -or $_.ProcessName -like "*rust*" -or $_.ProcessName -like "*cargo*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Write-Host "   OK" -ForegroundColor Green

# 2. Supprimer completement le dossier target
Write-Host ""
Write-Host "2. Suppression complete du dossier target..." -ForegroundColor Yellow
$targetPath = "D:\crm\src-tauri\target"
if (Test-Path $targetPath) {
    Remove-Item $targetPath -Recurse -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "   OK - Dossier target supprime" -ForegroundColor Green
} else {
    Write-Host "   OK - Aucun dossier target" -ForegroundColor Gray
}

# 3. Nettoyer les fichiers temporaires
Write-Host ""
Write-Host "3. Nettoyage des fichiers temporaires..." -ForegroundColor Yellow
Remove-Item "$env:TEMP\rustc*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\*.pdb" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Temp\rustc*" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "   OK" -ForegroundColor Green

# 4. Supprimer la base de donnees
Write-Host ""
Write-Host "4. Suppression de la base..." -ForegroundColor Yellow
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"
if (Test-Path $dbPath) {
    Remove-Item $dbPath -Force -ErrorAction SilentlyContinue
    Write-Host "   OK - Base supprimee" -ForegroundColor Green
} else {
    Write-Host "   OK - Aucune base" -ForegroundColor Gray
}

# 5. Compiler en mode release (plus stable)
Write-Host ""
Write-Host "5. Compilation en mode RELEASE..." -ForegroundColor Yellow
Write-Host "   (Mode release = plus stable, moins de fichiers PDB)" -ForegroundColor Gray
Write-Host "   (Cela va prendre 3-5 minutes)" -ForegroundColor Gray
Write-Host ""

cd D:\crm
$env:CARGO_INCREMENTAL="0"
npm run tauri:dev -- --release
