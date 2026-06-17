#!/usr/bin/env pwsh
# Verifier le contenu de la base de donnees

$dbPath = Get-ChildItem -Path "$env:APPDATA" -Recurse -Filter "patrimoine-crm.db" -ErrorAction SilentlyContinue | Where-Object { $_.DirectoryName -like "*patrimoine-crm*" } | Select-Object -First 1

if (-not $dbPath) {
    Write-Host "Base de donnees introuvable" -ForegroundColor Red
    exit 1
}

Write-Host "Base trouvee: $($dbPath.FullName)" -ForegroundColor Green

# Verifier sqlite3
if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) {
    Write-Host "sqlite3 non installe" -ForegroundColor Red
    Write-Host "Installez avec: choco install sqlite" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Exemple — contact par id (remplacer 1 par l'id voulu):" -ForegroundColor Cyan
sqlite3 $dbPath.FullName "SELECT id, nom, prenom, date_naissance, date_dernier_contact, date_prochain_suivi, profil_risque_sri FROM contacts WHERE id = 1;"

Write-Host ""
Write-Host "Derniers contacts modifies:" -ForegroundColor Cyan
sqlite3 $dbPath.FullName "SELECT id, nom, prenom, updated_at, datetime(updated_at, 'unixepoch') as date_modif FROM contacts ORDER BY updated_at DESC LIMIT 5;"
