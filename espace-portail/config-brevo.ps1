# Enregistre la configuration Brevo dans espace-portail/.env
#
# La cle est lue dans le presse-papier : la console Windows ne gere pas
# le Ctrl+V dans une saisie masquee, elle y capte le caractere de controle.
#
# ASCII uniquement : Windows PowerShell lit mal les fichiers .ps1 accentues.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $PSScriptRoot '.env.example') $envFile
    Write-Host "Fichier .env cree." -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Configuration de l'envoi des codes (Brevo) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Copiez votre cle API Brevo (Ctrl+C) avant de continuer." -ForegroundColor Yellow
Read-Host "   Appuyez sur Entree quand c'est fait"

$apiKey = (Get-Clipboard -Raw)
if ($null -ne $apiKey) { $apiKey = $apiKey.Trim() }

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Host "Presse-papier vide. Copiez la cle puis relancez." -ForegroundColor Red
    exit 1
}

$invalid = $apiKey.ToCharArray() | Where-Object { [int]$_ -lt 32 -or [int]$_ -gt 126 }
if ($invalid.Count -gt 0) {
    Write-Host "Le presse-papier ne contient pas une cle valide (caracteres de controle)." -ForegroundColor Red
    Write-Host "Recopiez la cle depuis Brevo puis relancez." -ForegroundColor Yellow
    exit 1
}

$masque = $apiKey.Substring(0, [Math]::Min(10, $apiKey.Length))
Write-Host ("   Cle detectee : {0}... ({1} caracteres)" -f $masque, $apiKey.Length) -ForegroundColor Green
if (-not $apiKey.StartsWith('xkeysib-')) {
    Write-Host "   Attention : une cle Brevo commence normalement par 'xkeysib-'." -ForegroundColor Yellow
}

Write-Host ""
$fromEmail = Read-Host "2. Adresse d'expedition (validee dans Brevo)"
if ([string]::IsNullOrWhiteSpace($fromEmail)) {
    Write-Host "Adresse vide, abandon." -ForegroundColor Red
    exit 1
}

$fromName = Read-Host "3. Nom affiche du cabinet"
if ([string]::IsNullOrWhiteSpace($fromName)) { $fromName = "Votre conseiller" }

$lines = Get-Content $envFile
function Set-EnvLine {
    param([string[]]$Content, [string]$Name, [string]$Value)
    $found = $false
    $out = foreach ($line in $Content) {
        if ($line -match "^\s*#?\s*$Name\s*=") {
            $found = $true
            "$Name=$Value"
        } else {
            $line
        }
    }
    if (-not $found) { $out = @($out) + "$Name=$Value" }
    return $out
}

$lines = Set-EnvLine -Content $lines -Name 'ESPACE_BREVO_API_KEY' -Value $apiKey
$lines = Set-EnvLine -Content $lines -Name 'ESPACE_MAIL_FROM' -Value $fromEmail.Trim()
$lines = Set-EnvLine -Content $lines -Name 'ESPACE_MAIL_FROM_NAME' -Value $fromName.Trim()

# UTF-8 sans BOM : le BOM se retrouverait dans la premiere variable lue.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($envFile, $lines, $utf8NoBom)

Write-Host ""
Write-Host "Enregistre dans espace-portail\.env" -ForegroundColor Green
Write-Host "Le portail doit etre relance pour prendre la nouvelle cle." -ForegroundColor Yellow
