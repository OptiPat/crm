# Tests Rust isoles — meme target que verify.ps1 (evite conflit avec dev.ps1 / src-tauri/target).
# Usage: .\scripts\test-rust.ps1
#        .\scripts\test-rust.ps1 archive_pipe

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CargoArgs
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:CARGO_TARGET_DIR = Join-Path $Root 'target-cargo-verify'

$cargoTest = @('test', '--manifest-path', 'src-tauri/Cargo.toml')
if ($CargoArgs -and $CargoArgs.Count -gt 0) {
    $cargoTest += '--'
    $cargoTest += $CargoArgs
}

& cargo @cargoTest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
