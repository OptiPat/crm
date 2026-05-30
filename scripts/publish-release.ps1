# Build release signée + repère les artefacts pour GitHub Releases
# Usage: .\scripts\publish-release.ps1
# Prérequis: TAURI_SIGNING_PRIVATE_KEY_PATH ou TAURI_SIGNING_PRIVATE_KEY

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$keyPath = "$env:USERPROFILE\.tauri\patrimoine-crm.key"
if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and -not $env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
    if (Test-Path $keyPath) {
        $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $keyPath
        # Tauri build lit surtout TAURI_SIGNING_PRIVATE_KEY (chemin ou contenu)
        $env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
        Write-Host "Cle de signature: $keyPath"
    } else {
        Write-Host "ERREUR: Generez d'abord une cle:" -ForegroundColor Red
        Write-Host '  npx tauri signer generate --write-keys "$env:USERPROFILE\.tauri\patrimoine-crm.key" --force'
        exit 1
    }
}

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Build version $version ..." -ForegroundColor Cyan

npm run tauri:build

$bundleRoot = Join-Path $Root "src-tauri\target\release\bundle"
$nsis = Get-ChildItem -Path (Join-Path $bundleRoot "nsis") -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$msi = Get-ChildItem -Path (Join-Path $bundleRoot "msi") -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1

Write-Host ""
Write-Host "=== Artefacts ===" -ForegroundColor Green
if ($nsis) {
    Write-Host "Installateur NSIS: $($nsis.FullName)"
    $sig = "$($nsis.FullName).sig"
    if (-not (Test-Path $sig) -and (Test-Path $keyPath)) {
        Write-Host "Signature manquante, signature en cours..." -ForegroundColor Yellow
        npx tauri signer sign -f $keyPath $nsis.FullName
    }
    if (Test-Path $sig) { Write-Host "Signature:       $sig" } else { Write-Host "ATTENTION: pas de fichier .sig — MAJ auto impossible" -ForegroundColor Red }
}
if ($msi) {
    Write-Host "MSI:               $($msi.FullName)"
}

$exampleJson = @{
    version = $version
    notes   = "Notes de version"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            url = "https://github.com/OptiPat/crm/releases/download/v$version/REMPLACER_PAR_NOM_FICHIER.exe"
            signature = "COLLER_CONTENU_DU_FICHIER_SIG"
        }
    }
} | ConvertTo-Json -Depth 5

$outDir = Join-Path $Root "release-artifacts"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$jsonPath = Join-Path $outDir "latest.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($jsonPath, $exampleJson, $utf8NoBom)

Write-Host ""
Write-Host "Modele latest.json: $jsonPath" -ForegroundColor Yellow
Write-Host "1. Creer release GitHub v$version"
Write-Host "2. Uploader installateur + .sig"
Write-Host "3. Completer latest.json (url + signature) et l'uploader sur la release"
