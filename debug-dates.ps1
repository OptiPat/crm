#!/usr/bin/env pwsh
# Script pour débugger les dates en base de données

Write-Host "🔍 Inspection des dates dans la base de données..." -ForegroundColor Cyan

# Chercher le fichier .db
$dbPath = Get-ChildItem -Path "$env:APPDATA" -Recurse -Filter "*.db" -ErrorAction SilentlyContinue | Where-Object { $_.DirectoryName -like "*patrimoine-crm*" } | Select-Object -First 1

if (-not $dbPath) {
    Write-Host "❌ Base de données introuvable" -ForegroundColor Red
    exit 1
}

Write-Host "📂 Base trouvée: $($dbPath.FullName)" -ForegroundColor Green

# Installer sqlite3 si nécessaire
if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️ sqlite3 non installé. Installation via chocolatey..." -ForegroundColor Yellow
    choco install sqlite -y
}

# Inspecter les 5 premières dates
Write-Host "`n📅 Dates stockées (5 premiers contacts):" -ForegroundColor Cyan
sqlite3 $dbPath.FullName "SELECT id, nom, prenom, date_dernier_contact, typeof(date_dernier_contact) as type FROM contacts LIMIT 5;"

Write-Host "`n📊 Statistiques:" -ForegroundColor Cyan
sqlite3 $dbPath.FullName "SELECT COUNT(*) as total, COUNT(date_dernier_contact) as avec_date FROM contacts;"

Write-Host "`n✅ Terminé!" -ForegroundColor Green
