# Lance le portail espace client en local.
#
# Les secrets sont lus dans espace-portail/.env (ignore par git).
# Copier .env.example en .env et renseigner les valeurs avant le premier lancement.
#
# ASCII uniquement : Windows PowerShell lit mal les fichiers .ps1 accentues.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) {
    Write-Host "Fichier .env absent." -ForegroundColor Red
    Write-Host "Copiez .env.example en .env puis renseignez vos valeurs :" -ForegroundColor Yellow
    Write-Host "  Copy-Item espace-portail\.env.example espace-portail\.env" -ForegroundColor Gray
    exit 1
}

foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $pair = $trimmed -split '=', 2
    if ($pair.Count -ne 2) { continue }
    $name = $pair[0].Trim()
    $value = $pair[1].Trim().Trim('"')
    Set-Item -Path "env:$name" -Value $value
}

if (-not $env:ESPACE_SYNC_SECRET) {
    Write-Host "ESPACE_SYNC_SECRET manquant dans .env" -ForegroundColor Red
    exit 1
}

if ($env:ESPACE_BREVO_API_KEY -and $env:ESPACE_MAIL_FROM) {
    Write-Host "Envoi Brevo actif : les codes partent par email." -ForegroundColor Green
} else {
    Write-Host "Pas de cle Brevo : les codes s'affichent dans les logs ci-dessous." -ForegroundColor Yellow
}

Write-Host ""
cargo run
