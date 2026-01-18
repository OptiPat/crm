Write-Host "=== SUPPRESSION FORCEE DE LA BASE ===" -ForegroundColor Red
Write-Host ""

# Arreter l'application
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
taskkill /F /IM patrimoine-crm.exe 2>$null
Start-Sleep -Seconds 5
Write-Host "   OK" -ForegroundColor Green

# Trouver et supprimer la base
Write-Host ""
Write-Host "2. Recherche et suppression de la base..." -ForegroundColor Yellow

$possiblePaths = @(
    "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db",
    "$env:LOCALAPPDATA\com.patrimoine-crm.app\patrimoine-crm.db",
    "D:\crm\patrimoine-crm.db",
    "D:\crm\src-tauri\patrimoine-crm.db"
)

$found = $false
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        Write-Host "   Trouvee: $path" -ForegroundColor Cyan
        Remove-Item $path -Force
        Write-Host "   SUPPRIMEE: $path" -ForegroundColor Green
        $found = $true
    }
}

if (-not $found) {
    Write-Host "   Aucune base trouvee" -ForegroundColor Yellow
}

# Chercher tous les fichiers .db
Write-Host ""
Write-Host "3. Verification..." -ForegroundColor Yellow
$allDbs = Get-ChildItem -Path "$env:APPDATA\com.patrimoine-crm.app" -Filter "*.db" -ErrorAction SilentlyContinue
if ($allDbs) {
    Write-Host "   ATTENTION: Fichiers .db restants:" -ForegroundColor Red
    $allDbs | ForEach-Object { 
        Write-Host "   - $($_.FullName)" -ForegroundColor Red
        Remove-Item $_.FullName -Force
        Write-Host "     SUPPRIME" -ForegroundColor Green
    }
} else {
    Write-Host "   OK - Aucun fichier .db restant" -ForegroundColor Green
}

Write-Host ""
Write-Host "4. Attente de 5 secondes..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "   OK" -ForegroundColor Green

Write-Host ""
Write-Host "=== BASE SUPPRIMEE ===" -ForegroundColor Green
Write-Host ""
Write-Host "MAINTENANT:" -ForegroundColor Cyan
Write-Host "1. Relancez l'application avec: npm run tauri:dev" -ForegroundColor Yellow
Write-Host "2. L'application va recreer la base avec la bonne structure" -ForegroundColor Yellow
Write-Host ""
