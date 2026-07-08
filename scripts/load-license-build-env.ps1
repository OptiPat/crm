# Charge license-build.local.ps1 (hors dépôt) pour les variables de compilation Rust.
param(
    [switch]$Quiet
)

$Root = if ($PSScriptRoot) {
    Split-Path -Parent $PSScriptRoot
} else {
    Get-Location
}
$localFile = Join-Path $Root "license-build.local.ps1"

if (-not (Test-Path $localFile)) {
    if (-not $Quiet) {
        Write-Host "Licences : license-build.local.ps1 absent - registre Sheet inactif au build." -ForegroundColor DarkYellow
        Write-Host "  Copiez license-build.local.ps1.example vers license-build.local.ps1" -ForegroundColor DarkGray
    }
    return $false
}

. $localFile

$missing = @()
if (-not $env:LICENSE_REGISTRY_URL) { $missing += "LICENSE_REGISTRY_URL" }
if (-not $env:LICENSE_REGISTRY_TOKEN) { $missing += "LICENSE_REGISTRY_TOKEN" }
if (-not $env:LICENSE_SIGNING_SECRET) { $missing += "LICENSE_SIGNING_SECRET" }

if ($missing.Count -gt 0) {
    Write-Host ('Licences : variables manquantes dans license-build.local.ps1 : ' + ($missing -join ', ')) -ForegroundColor Red
    return $false
}

if (-not $Quiet) {
    Write-Host "Licences : registre Sheet configuré pour ce build." -ForegroundColor Green
}
return $true
