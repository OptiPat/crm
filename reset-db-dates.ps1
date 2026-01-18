#!/usr/bin/env pwsh
# Script pour supprimer la base de donnees et forcer sa recreation

Write-Host "Suppression de la base de donnees pour resoudre le probleme de types..." -ForegroundColor Cyan

# Arreter l'application
Write-Host "Arret de l'application..." -ForegroundColor Yellow
Get-Process -Name "patrimoine-crm" -ErrorAction SilentlyContinue | Stop-Process -Force

Start-Sleep -Seconds 2

# Chercher et supprimer tous les fichiers .db
$dbFiles = @()
$searchPaths = @(
    "$env:APPDATA",
    "$env:LOCALAPPDATA",
    "D:\crm\src-tauri\target"
)

foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        $found = Get-ChildItem -Path $path -Recurse -Filter "*.db" -ErrorAction SilentlyContinue | 
                 Where-Object { $_.DirectoryName -like "*patrimoine-crm*" }
        $dbFiles += $found
    }
}

if ($dbFiles.Count -gt 0) {
    Write-Host "Fichiers .db trouves :" -ForegroundColor Green
    foreach ($file in $dbFiles) {
        Write-Host "   - $($file.FullName)" -ForegroundColor Gray
        try {
            Remove-Item $file.FullName -Force
            Write-Host "   Supprime" -ForegroundColor Green
        } catch {
            Write-Host "   Erreur: $_" -ForegroundColor Red
        }
    }
} else {
    Write-Host "Aucun fichier .db trouve" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Base de donnees supprimee !" -ForegroundColor Green
Write-Host "Relancez l'application avec: npm run tauri:dev" -ForegroundColor Cyan
Write-Host "La base sera recreee automatiquement avec les bons types." -ForegroundColor Gray
