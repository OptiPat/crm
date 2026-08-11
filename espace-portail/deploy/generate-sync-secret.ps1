# Genere les secrets du portail (sync CRM <-> portail + auth OTP/sessions).
# Copiez ESPACE_SYNC_SECRET dans espace-portail/.env (VPS) ET dans le CRM (Parametres espace client).
# Copiez ESPACE_AUTH_SECRET uniquement dans espace-portail/.env (VPS).

function New-RandomSecret {
    param([int]$Length = 64)
    $chars = (48..57) + (65..90) + (97..122)
    -join (1..$Length | ForEach-Object { [char]($chars | Get-Random) })
}

$syncSecret = New-RandomSecret
$authSecret = New-RandomSecret

Write-Host ""
Write-Host "=== ESPACE_SYNC_SECRET (production) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host $syncSecret
Write-Host ""
Write-Host "1. VPS : /opt/espace-portail/.env" -ForegroundColor Yellow
Write-Host "2. CRM : Apercu client > Connexion portail > Cle API" -ForegroundColor Yellow
Write-Host ""
Write-Host "=== ESPACE_AUTH_SECRET (portail uniquement) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host $authSecret
Write-Host ""
Write-Host "VPS : /opt/espace-portail/.env seulement (jamais dans le CRM)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ne partagez pas ces secrets. Different de dev-sync-secret-change-me." -ForegroundColor Gray
Write-Host "Apres deploiement : les sessions clients existantes seront invalides (nouveau code requis)." -ForegroundColor Gray

$clipboard = "ESPACE_SYNC_SECRET=$syncSecret`nESPACE_AUTH_SECRET=$authSecret"
Set-Clipboard -Value $clipboard
Write-Host "Les deux lignes sont dans le presse-papier." -ForegroundColor Green
