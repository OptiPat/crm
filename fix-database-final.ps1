# Script de correction finale de la base de données
Write-Host "=== CORRECTION DE LA BASE DE DONNEES ===" -ForegroundColor Cyan
Write-Host ""

# 1. Arrêter tous les processus
Write-Host "1. Arrêt des processus..." -ForegroundColor Yellow
try {
    Get-Process -Name "*patrimoine*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "   ✓ Processus arrêtés" -ForegroundColor Green
} catch {
    Write-Host "   ℹ Aucun processus à arrêter" -ForegroundColor Gray
}

# 2. Vérifier et supprimer la base
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"
Write-Host ""
Write-Host "2. Suppression de la base..." -ForegroundColor Yellow

if (Test-Path $dbPath) {
    try {
        # Créer une sauvegarde
        $backupPath = "$env:APPDATA\com.patrimoine-crm.app\BACKUP_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
        Copy-Item $dbPath $backupPath -Force
        Write-Host "   ✓ Sauvegarde créée: $backupPath" -ForegroundColor Green
        
        # Attendre un peu
        Start-Sleep -Seconds 3
        
        # Supprimer la base
        Remove-Item $dbPath -Force
        Write-Host "   ✓ Base de données supprimée" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Erreur: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "VEUILLEZ FERMER L'APPLICATION MANUELLEMENT ET RELANCER CE SCRIPT" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ℹ Aucune base à supprimer" -ForegroundColor Gray
}

# 3. Attendre
Write-Host ""
Write-Host "3. Attente..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Write-Host "   ✓ Prêt" -ForegroundColor Green

# 4. Relancer l'application
Write-Host ""
Write-Host "4. Relancement de l'application..." -ForegroundColor Yellow
Write-Host "   (Cela peut prendre 30-60 secondes)" -ForegroundColor Gray
Write-Host ""

try {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\crm; npm run tauri:dev"
    Write-Host "✅ APPLICATION LANCEE AVEC SUCCES !" -ForegroundColor Green
    Write-Host ""
    Write-Host "L'application va se compiler et démarrer dans un nouveau terminal." -ForegroundColor Cyan
    Write-Host "Attendez que la fenêtre s'ouvre, puis testez l'import de vos clients." -ForegroundColor Cyan
} catch {
    Write-Host "✗ Erreur lors du lancement: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Lancez manuellement: npm run tauri:dev" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== FIN ===" -ForegroundColor Cyan
