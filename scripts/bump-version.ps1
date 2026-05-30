# Met a jour la version dans les 3 fichiers du projet
# Usage: .\scripts\bump-version.ps1 0.1.1
# Ensuite: commit + push main, puis .\scripts\release-tag.ps1 0.1.1

param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "ERREUR: version attendue au format X.Y.Z (ex. 0.1.1)" -ForegroundColor Red
    exit 1
}

# package.json
$pkgPath = Join-Path $Root "package.json"
$pkgRaw = Get-Content $pkgPath -Raw
$oldPkg = if ($pkgRaw -match '"version":\s*"([^"]+)"') { $Matches[1] } else { "?" }
$pkgRaw = $pkgRaw -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
Set-Content $pkgPath $pkgRaw.TrimEnd() -Encoding utf8 -NoNewline
Add-Content $pkgPath "" -Encoding utf8

# tauri.conf.json
$tauriPath = Join-Path $Root "src-tauri/tauri.conf.json"
$tauriRaw = Get-Content $tauriPath -Raw
$oldTauri = if ($tauriRaw -match '"version":\s*"([^"]+)"') { $Matches[1] } else { "?" }
$tauriRaw = $tauriRaw -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
Set-Content $tauriPath $tauriRaw.TrimEnd() -Encoding utf8 -NoNewline
Add-Content $tauriPath "" -Encoding utf8

# Cargo.toml
$cargoPath = Join-Path $Root "src-tauri/Cargo.toml"
$cargo = Get-Content $cargoPath -Raw
$oldCargo = if ($cargo -match '(?m)^version\s*=\s*"([^"]+)"') { $Matches[1] } else { "?" }
$cargo = $cargo -replace '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`""
Set-Content $cargoPath $cargo.TrimEnd() -Encoding utf8 -NoNewline
Add-Content $cargoPath "" -Encoding utf8

Write-Host "Version $Version appliquee:" -ForegroundColor Green
Write-Host "  package.json     : $oldPkg -> $Version"
Write-Host "  tauri.conf.json  : $oldTauri -> $Version"
Write-Host "  Cargo.toml       : $oldCargo -> $Version"
Write-Host ""
Write-Host "Etapes suivantes:" -ForegroundColor Cyan
Write-Host "  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
Write-Host "  git commit -m `"chore: version $Version`""
Write-Host "  git push origin main"
Write-Host "  .\scripts\release-tag.ps1 $Version"
