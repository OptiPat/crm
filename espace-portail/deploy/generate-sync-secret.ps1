# Genere un secret de synchronisation CRM <-> portail (64 caracteres).
# Copiez la valeur dans espace-portail/.env (VPS) ET dans le CRM (Parametres espace client).

$chars = (48..57) + (65..90) + (97..122)
$secret = -join (1..64 | ForEach-Object { [char]($chars | Get-Random) })

Write-Host ""
Write-Host "=== ESPACE_SYNC_SECRET (production) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host $secret
Write-Host ""
Write-Host "1. VPS : /opt/espace-portail/.env" -ForegroundColor Yellow
Write-Host "2. CRM : Apercu client > Connexion portail > Cle API" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ne partagez pas ce secret. Different de dev-sync-secret-change-me." -ForegroundColor Gray

Set-Clipboard -Value $secret
Write-Host "Copie dans le presse-papier." -ForegroundColor Green
