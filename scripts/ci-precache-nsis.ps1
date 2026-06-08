# Pre-cache NSIS pour CI (retry si 504 GitHub) — structure identique au bundler Tauri.
# Usage: .\scripts\ci-precache-nsis.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$toolsRoot = Join-Path $Root "src-tauri\target\.tauri"
$nsisPath = Join-Path $toolsRoot "NSIS"
$makensis = Join-Path $nsisPath "makensis.exe"
$utilsDll = Join-Path $nsisPath "Plugins\x86-unicode\additional\nsis_tauri_utils.dll"

function Download-WithRetry {
    param(
        [string]$Url,
        [string]$OutFile,
        [int]$MaxAttempts = 6
    )
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        try {
            Write-Host "  Telechargement (tentative $i/$MaxAttempts): $Url"
            Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -TimeoutSec 180
            return
        } catch {
            Write-Warning $_.Exception.Message
            if ($i -eq $MaxAttempts) { throw }
            $wait = [Math]::Min(120, 15 * $i)
            Write-Host "  Pause ${wait}s..."
            Start-Sleep -Seconds $wait
        }
    }
}

New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null

if (-not (Test-Path $makensis)) {
    Write-Host "NSIS absent — telechargement et extraction..."
    $zip = Join-Path $env:TEMP "nsis-3.11.zip"
    Download-WithRetry `
        -Url "https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip" `
        -OutFile $zip

    if (Test-Path $nsisPath) {
        Remove-Item $nsisPath -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
    Expand-Archive -Path $zip -DestinationPath $toolsRoot -Force
    $extracted = Join-Path $toolsRoot "nsis-3.11"
    if (-not (Test-Path $extracted)) {
        throw "Archive NSIS invalide (dossier nsis-3.11 absent)."
    }
    Move-Item $extracted $nsisPath
    Write-Host "NSIS extrait vers $nsisPath"
} else {
    Write-Host "NSIS deja present: $nsisPath"
}

$utilsDir = Split-Path $utilsDll -Parent
New-Item -ItemType Directory -Force -Path $utilsDir | Out-Null
if (-not (Test-Path $utilsDll)) {
    Write-Host "nsis_tauri_utils.dll absent — telechargement..."
    Download-WithRetry `
        -Url "https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll" `
        -OutFile $utilsDll
} else {
    Write-Host "nsis_tauri_utils.dll deja present."
}

Write-Host "Pre-cache NSIS OK."
