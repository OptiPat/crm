# Verification Patrimoine CRM — a lancer par les AGENTS Cursor (pas par l'utilisateur).
# Sans commit / push. Arret sur la premiere erreur.
#
# Agents (obligatoire apres changements de code) :
#   npm run verify              # tsc + Vitest + Cargo
#   npm run verify:quick          # frontend seulement
#
# Options manuelles si besoin :
#   .\verify.ps1 -Build -Icons

param(
    [switch]$Quick,
    [switch]$Build,
    [switch]$Icons
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$started = Get-Date
$steps = [System.Collections.Generic.List[object]]::new()

function Invoke-VerifyStep {
    param(
        [string]$Name,
        [scriptblock]$Action
    )
    Write-Host ''
    Write-Host ">> $Name" -ForegroundColor Cyan
    $stepStart = Get-Date
    try {
        & $Action
        $elapsed = (Get-Date) - $stepStart
        $steps.Add([pscustomobject]@{ Name = $Name; Ok = $true; Seconds = [math]::Round($elapsed.TotalSeconds, 1) })
        Write-Host "   OK ($([math]::Round($elapsed.TotalSeconds, 1)) s)" -ForegroundColor Green
    } catch {
        $elapsed = (Get-Date) - $stepStart
        $steps.Add([pscustomobject]@{ Name = $Name; Ok = $false; Seconds = [math]::Round($elapsed.TotalSeconds, 1) })
        Write-Host "   ECHEC ($([math]::Round($elapsed.TotalSeconds, 1)) s)" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        throw
    }
}

Write-Host '=== Patrimoine CRM - verification ===' -ForegroundColor Cyan
Write-Host "Racine: $PSScriptRoot" -ForegroundColor Gray
if ($Quick) { Write-Host 'Mode: Quick (pas de Cargo)' -ForegroundColor Yellow }
if ($Build) { Write-Host 'Mode: + build Vite' -ForegroundColor Yellow }
if ($Icons) { Write-Host 'Mode: + icones Lucide' -ForegroundColor Yellow }

if (-not (Test-Path 'node_modules')) {
    Invoke-VerifyStep 'npm install' { npm install }
}

if ($Icons) {
    Invoke-VerifyStep 'Icones Lucide' { npm run check:icons }
}

Invoke-VerifyStep 'TypeScript (tsc --noEmit)' {
    npx tsc --noEmit
}

Invoke-VerifyStep 'Tests frontend (Vitest)' {
    npm run test
}

if (-not $Quick) {
    Invoke-VerifyStep 'Tests backend (Cargo)' {
        cargo test --manifest-path src-tauri/Cargo.toml
    }
}

if ($Build) {
    Invoke-VerifyStep 'Build frontend (tsc + Vite)' {
        npm run build
    }
}

$total = (Get-Date) - $started
Write-Host ''
Write-Host '=== Resume ===' -ForegroundColor Cyan
foreach ($s in $steps) {
    $mark = if ($s.Ok) { '[OK]' } else { '[KO]' }
    $color = if ($s.Ok) { 'Green' } else { 'Red' }
    Write-Host ("  {0,-32} {1,6} s  {2}" -f $s.Name, $s.Seconds, $mark) -ForegroundColor $color
}
Write-Host ''
Write-Host ("Tout est vert en {0:F1} s." -f $total.TotalSeconds) -ForegroundColor Green
