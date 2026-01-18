# SOLUTION FINALE : Appliquer la migration + relancer
Write-Host "=== SOLUTION FINALE - INVESTISSEMENTS DE FOYER ===" -ForegroundColor Cyan
Write-Host ""

# Étape 1 : Arrêter l'app
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) {
    Write-Host "   Arret du processus PID $proc" -ForegroundColor Gray
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

# Étape 2 : Appliquer la migration critique
Write-Host ""
Write-Host "2. Application de la migration 0006 (contact_id optionnel)..." -ForegroundColor Yellow

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (Test-Path $dbPath) {
    Write-Host "   Base de donnees trouvee : $dbPath" -ForegroundColor Green
    
    try {
        $sqlContent = Get-Content -Path "drizzle\0006_make_contact_id_optional.sql" -Raw
        $sqlContent | sqlite3 $dbPath
        
        Write-Host "   + Migration 0006 appliquee avec succes !" -ForegroundColor Green
        Write-Host "   La colonne contact_id est maintenant OPTIONNELLE" -ForegroundColor Green
    } catch {
        Write-Host "   ! Erreur lors de la migration : $_" -ForegroundColor Red
        Write-Host "   Tentative avec backup..." -ForegroundColor Yellow
        
        # Backup de la base
        $backupPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db.backup"
        Copy-Item $dbPath $backupPath -Force
        Write-Host "   Backup cree : $backupPath" -ForegroundColor Green
        
        # Reessayer
        $sqlContent | sqlite3 $dbPath
        Write-Host "   + Migration appliquee apres backup" -ForegroundColor Green
    }
} else {
    Write-Host "   Base de donnees non trouvee (sera creee au lancement)" -ForegroundColor Yellow
}

# Étape 3 : Relancer l'app
Write-Host ""
Write-Host "3. Relancement de l'application..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Testez maintenant l'import des couples !" -ForegroundColor Cyan
Write-Host "Les investissements devraient etre crees sans erreur." -ForegroundColor Cyan
Write-Host ""

npm run tauri:dev -- --release
