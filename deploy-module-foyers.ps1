# Script complet pour déployer le module Foyers avec détection des couples
Write-Host "=== DEPLOIEMENT MODULE FOYERS ===" -ForegroundColor Cyan
Write-Host ""

# Étape 1 : Arrêter l'app
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) {
    Write-Host "   Arret du processus PID $proc" -ForegroundColor Gray
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

# Étape 2 : Nettoyage Rust
Write-Host ""
Write-Host "2. Nettoyage Rust..." -ForegroundColor Yellow
cd src-tauri
cargo clean
cd ..

# Étape 3 : Appliquer les migrations
Write-Host ""
Write-Host "3. Application des migrations SQL..." -ForegroundColor Yellow

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (Test-Path $dbPath) {
    Write-Host "   Migration 0005 (role_foyer)..." -ForegroundColor Gray
    try {
        $sql1 = Get-Content -Path "drizzle\0005_add_role_foyer.sql" -Raw
        $sql1 | sqlite3 $dbPath
        Write-Host "   + Migration 0005 OK" -ForegroundColor Green
    } catch {
        Write-Host "   ! Migration 0005 deja appliquee ou erreur" -ForegroundColor Yellow
    }
    
    Write-Host "   Migration 0006 (contact_id optionnel)..." -ForegroundColor Gray
    try {
        $sql2 = Get-Content -Path "drizzle\0006_make_contact_id_optional.sql" -Raw
        $sql2 | sqlite3 $dbPath
        Write-Host "   + Migration 0006 OK" -ForegroundColor Green
    } catch {
        Write-Host "   ! Migration 0006 deja appliquee ou erreur" -ForegroundColor Yellow
    }
} else {
    Write-Host "   Base de donnees non trouvee (sera creee au lancement)" -ForegroundColor Gray
}

# Étape 4 : Compilation et lancement
Write-Host ""
Write-Host "4. Compilation et lancement..." -ForegroundColor Yellow
Write-Host "   (Cela peut prendre quelques minutes)" -ForegroundColor Gray
Write-Host ""

npm run tauri:dev -- --release
