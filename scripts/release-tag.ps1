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

# Lance un programme externe (cargo, git) : PowerShell 5.1 + ErrorActionPreference=Stop
# transforme sa sortie d'erreur (messages de progression) en erreur bloquante.
# On affiche tout tel quel et on juge le succes sur le seul code de retour.
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Command 2>&1 | ForEach-Object { Write-Host "$_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) {
        throw "$Label a echoue (code $code)"
    }
}

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
Invoke-Native -Label "git tag" -Command { git tag $tag }
try {
    Invoke-Native -Label "git push" -Command { git push origin $tag }
} catch {
    # Push refuse : on retire le tag local pour pouvoir relancer proprement.
    git tag -d $tag | Out-Null
    Write-Host "ERREUR: $_ (tag local $tag supprime)" -ForegroundColor Red
    exit 1
}
Write-Host "OK - suivez le workflow: https://github.com/OptiPat/crm/actions" -ForegroundColor Green
