# Lancement dev Patrimoine CRM
#
# Usage:
#   .\dev.ps1              App complete (Rust debug = rapide, ~30-90 s apres 1er build)
#   .\dev.ps1 -Ui          Frontend seul Vite (~2 s) - pas d'API Tauri
#   .\dev.ps1 -Release     Rust release (lent, 5-15 min) si debug echoue (LNK1318)
#   .\dev.ps1 -Rust        Force un cargo build avant Tauri (si OOM, faites-le seul)
#
# Astuce: gardez ce terminal ouvert ; ne modifiez pas src-tauri/ pendant le 1er build.

param(
    [switch]$Ui,
    [switch]$Release,
    [switch]$Rust
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host '=== Patrimoine CRM - mode dev ===' -ForegroundColor Cyan

$proc = netstat -ano 2>$null | Select-String ':1420\s' | ForEach-Object {
    ($_ -split '\s+')[-1]
} | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1

if ($proc) {
    Write-Host "Port 1420 occupe (PID $proc) -> arret..." -ForegroundColor Yellow
    taskkill /F /PID $proc 2>$null | Out-Null
    Start-Sleep -Seconds 1
}

if (-not (Test-Path 'node_modules')) {
    Write-Host 'Installation des dependances npm...' -ForegroundColor Yellow
    npm install
}

if ($Ui) {
    Write-Host ''
    Write-Host 'Mode: UI seule (Vite)' -ForegroundColor Green
    Write-Host '  - React/TS : http://localhost:1420/' -ForegroundColor Gray
    Write-Host '  - Pas de base SQLite / commandes Tauri' -ForegroundColor Yellow
    Write-Host ''
    npm run dev
    exit 0
}

$onWindows = ($IsWindows -or $env:OS -match 'Windows')
$useRelease = $Release.IsPresent

Write-Host ''
if ($useRelease) {
    Write-Host 'Mode: release (LENT - compilation optimisee)' -ForegroundColor Red
    Write-Host '  1er build : souvent 10-20 min. Utilisez sans -Release si possible.' -ForegroundColor Gray
} else {
    Write-Host 'Mode: debug (rapide)' -ForegroundColor Green
    Write-Host '  1er build Rust : ~1-3 min, rebuilds : ~10-40 s' -ForegroundColor Gray
    if ($onWindows) {
        Write-Host '  LNK1318 contourne via .cargo/config.toml (debuginfo=0)' -ForegroundColor Gray
    }
}
Write-Host '  - React/TS : rechargement auto (Vite)' -ForegroundColor Gray
Write-Host '  - Rust     : rebuild si src-tauri/ modifie' -ForegroundColor Gray
Write-Host '  - UI seule : .\dev.ps1 -Ui' -ForegroundColor Gray
Write-Host ''

# Limite la RAM pendant rustc/link (jobs=1 dans .cargo/config.toml aussi)
$env:CARGO_BUILD_JOBS = '1'

if ($Rust -and -not $useRelease) {
    Write-Host 'Build Rust seul (option -Rust)...' -ForegroundColor Cyan
    Push-Location (Join-Path $PSScriptRoot 'src-tauri')
    try {
        cargo build --bin patrimoine-crm
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
    Write-Host 'Rust OK.' -ForegroundColor Green
    Write-Host ''
}

if ($useRelease) {
    npm run tauri:dev:release
} else {
    npm run tauri:dev
}
