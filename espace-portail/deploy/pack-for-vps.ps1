# Prepare un zip a envoyer sur le VPS (UI deja build, sources Rust).
# Usage depuis la racine du depot :
#   .\espace-portail\deploy\pack-for-vps.ps1

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$staging = Join-Path $root '.pack-espace-portail-staging'

Write-Host "Build UI..." -ForegroundColor Cyan
Push-Location $root
try {
    # Vite ecrit ses avertissements sur stderr : avec ErrorActionPreference=Stop,
    # PowerShell les prendrait pour un echec. Seul le code de sortie fait foi.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    npm run build:espace-portail 2>&1 | ForEach-Object { "$_" }
    $buildExit = $LASTEXITCODE
    $ErrorActionPreference = $previous
    if ($buildExit -ne 0) { throw "build:espace-portail a echoue (code $buildExit)" }
} finally {
    Pop-Location
}

if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging | Out-Null

Copy-Item (Join-Path $root 'espace-portail\Cargo.toml') $staging
Copy-Item (Join-Path $root 'espace-portail\Cargo.lock') $staging
Copy-Item -Recurse (Join-Path $root 'espace-portail\src') (Join-Path $staging 'src')
New-Item -ItemType Directory -Path (Join-Path $staging 'web') | Out-Null
Copy-Item -Recurse (Join-Path $root 'espace-portail\web\dist') (Join-Path $staging 'web\dist')
Copy-Item -Recurse (Join-Path $root 'espace-portail\deploy') (Join-Path $staging 'deploy')

# Les fichiers destines au VPS doivent partir en LF : bash refuse un script en
# CRLF, et systemd comme Caddy rejettent une configuration ainsi terminee.
$lf = New-Object System.Text.UTF8Encoding($false)
Get-ChildItem (Join-Path $staging 'deploy') -File |
    Where-Object { $_.Extension -in '.sh', '.service', '.example', '' -or $_.Name -eq 'Caddyfile' } |
    ForEach-Object {
        $content = [System.IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
        [System.IO.File]::WriteAllText($_.FullName, $content, $lf)
    }

$zip = Join-Path $root 'dist-espace-portail-vps.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -Force
Remove-Item -Recurse -Force $staging

Write-Host ""
Write-Host "Archive : $zip" -ForegroundColor Green
Write-Host ""
Write-Host "Sur le VPS :" -ForegroundColor Yellow
Write-Host "  scp dist-espace-portail-vps.zip user@VPS:/tmp/"
Write-Host "  ssh user@VPS"
Write-Host "  sudo rm -rf /tmp/espace-build && mkdir /tmp/espace-build && unzip -o /tmp/dist-espace-portail-vps.zip -d /tmp/espace-build"
Write-Host "  sudo bash /tmp/espace-build/deploy/install-vps.sh VOTRE.DOMAINE.FR /tmp/espace-build"
