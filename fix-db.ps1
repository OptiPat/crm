Write-Host "=== Correction de la base ===" -ForegroundColor Cyan

Write-Host "1. Arret des processus..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*patrimoine*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Write-Host "OK" -ForegroundColor Green

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

Write-Host "2. Suppression de la base..." -ForegroundColor Yellow
if (Test-Path $dbPath) {
    $backupPath = "$env:APPDATA\com.patrimoine-crm.app\BACKUP_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
    Copy-Item $dbPath $backupPath -Force
    Write-Host "Sauvegarde: $backupPath" -ForegroundColor Gray
    
    Start-Sleep -Seconds 3
    Remove-Item $dbPath -Force
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "Aucune base a supprimer" -ForegroundColor Gray
}

Write-Host "3. Relancement..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\crm; npm run tauri:dev"

Write-Host "TERMINE - Une nouvelle fenetre va s'ouvrir" -ForegroundColor Green
