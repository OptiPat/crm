# SOLUTION SIMPLE : Recréer la base de données avec la nouvelle structure
# ATTENTION : Cette opération SUPPRIME toutes les données existantes

Write-Host ""
Write-Host "⚠️  ATTENTION - SUPPRESSION DE LA BASE DE DONNÉES" -ForegroundColor Red
Write-Host "=" * 60 -ForegroundColor Red
Write-Host ""
Write-Host "Ce script va :" -ForegroundColor Yellow
Write-Host "  1. Sauvegarder l'ancienne base de données" -ForegroundColor Yellow
Write-Host "  2. Supprimer la base actuelle" -ForegroundColor Yellow
Write-Host "  3. Relancer l'application (qui recréera la base avec la bonne structure)" -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  TOUTES VOS DONNÉES SERONT SUPPRIMÉES !" -ForegroundColor Red
Write-Host ""
$confirmation = Read-Host "Tapez 'OUI' en majuscules pour confirmer"

if ($confirmation -ne "OUI") {
    Write-Host "❌ Opération annulée" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "🔄 Démarrage de la procédure..." -ForegroundColor Cyan

# 1. Arrêter TOUTES les instances de l'application
Write-Host "1️⃣ Arrêt de l'application..." -ForegroundColor Yellow

# Arrêter le processus Tauri (patrimoine-crm.exe)
Get-Process -Name "patrimoine-crm" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# Arrêter aussi via le port 1420 (Vite dev server)
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1
if ($proc) {
    taskkill /F /PID $proc 2>$null
}

# Arrêter cargo/rustc si en cours
Get-Process -Name "cargo", "rustc" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 3
Write-Host "   ✅ Application arrêtée" -ForegroundColor Green

# 2. Sauvegarder
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"
if (Test-Path $dbPath) {
    Write-Host "2️⃣ Sauvegarde de l'ancienne base..." -ForegroundColor Yellow
    $backupPath = "$env:APPDATA\com.patrimoine-crm.app\OLD_patrimoine-crm_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
    Copy-Item $dbPath $backupPath
    Write-Host "   ✅ Sauvegarde : $backupPath" -ForegroundColor Green
    
    # 3. Supprimer (avec retry)
    Write-Host "3️⃣ Suppression de la base actuelle..." -ForegroundColor Yellow
    
    $maxRetries = 5
    $deleted = $false
    
    for ($i = 1; $i -le $maxRetries; $i++) {
        try {
            Remove-Item $dbPath -Force -ErrorAction Stop
            $deleted = $true
            Write-Host "   ✅ Base supprimée" -ForegroundColor Green
            break
        } catch {
            Write-Host "   ⏳ Tentative $i/$maxRetries - fichier verrouillé, attente..." -ForegroundColor Yellow
            
            # Réessayer d'arrêter les processus
            Get-Process -Name "patrimoine-crm" -ErrorAction SilentlyContinue | Stop-Process -Force
            Start-Sleep -Seconds 2
        }
    }
    
    if (-not $deleted) {
        Write-Host "   ❌ Impossible de supprimer la base. Fermez l'application manuellement." -ForegroundColor Red
        Write-Host "   Puis relancez ce script." -ForegroundColor Yellow
        exit 1
    }
}

# 4. Relancer
Write-Host "4️⃣ Redémarrage de l'application..." -ForegroundColor Yellow
Write-Host "   L'application va recréer la base avec la nouvelle structure" -ForegroundColor Cyan
Start-Sleep -Seconds 2

cd D:\crm
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1
if ($proc) { taskkill /F /PID $proc 2>$null }
npm run tauri:dev -- --release

Write-Host ""
Write-Host "✅ TERMINÉ !" -ForegroundColor Green
Write-Host "L'application démarre avec une base de données vierge incluant le support des filleuls." -ForegroundColor Cyan
