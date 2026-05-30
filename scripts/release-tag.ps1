# Crée un tag Git vX.Y.Z et pousse → déclenche le workflow GitHub Actions Release
# Usage: .\scripts\release-tag.ps1 0.1.1
# Prérequis: version déjà mise à jour dans package.json, tauri.conf.json, Cargo.toml

param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$pkg = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tauri = (Select-String -Path src-tauri/tauri.conf.json -Pattern '"version":\s*"([^"]+)"' | ForEach-Object { $_.Matches.Groups[1].Value })
$cargo = (Select-String -Path src-tauri/Cargo.toml -Pattern '^version\s*=\s*"([^"]+)"' | ForEach-Object { $_.Matches.Groups[1].Value })

if ($pkg -ne $Version -or $tauri -ne $Version -or $cargo -ne $Version) {
    Write-Host "ERREUR: versions incohérentes" -ForegroundColor Red
    Write-Host "  package.json     : $pkg"
    Write-Host "  tauri.conf.json  : $tauri"
    Write-Host "  Cargo.toml       : $cargo"
    Write-Host "  attendu          : $Version"
    exit 1
}

$tag = "v$Version"
$existing = git tag -l $tag
if ($existing) {
    Write-Host "ERREUR: le tag $tag existe deja. Supprimez-le ou choisissez une autre version." -ForegroundColor Red
    Write-Host "  git tag -d $tag"
    Write-Host "  git push origin :refs/tags/$tag"
    exit 1
}

Write-Host "Creation du tag $tag ..." -ForegroundColor Cyan
git tag $tag
git push origin $tag
Write-Host "OK — suivez le workflow: https://github.com/OptiPat/crm/actions" -ForegroundColor Green
