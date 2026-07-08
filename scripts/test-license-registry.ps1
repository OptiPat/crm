# Teste le webhook Google Sheet (Apps Script) avec un événement fictif.
# Prérequis : license-build.local.ps1 renseigné (copie de .example).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root "scripts\load-license-build-env.ps1") | Out-Null

if (-not $env:LICENSE_REGISTRY_URL -or -not $env:LICENSE_REGISTRY_TOKEN) {
    Write-Host "ERREUR : configurez license-build.local.ps1 d'abord." -ForegroundColor Red
    exit 1
}

$payload = @{
    token            = $env:LICENSE_REGISTRY_TOKEN
    event            = "test_ping"
    installation_id  = "test-" + [guid]::NewGuid().ToString()
    license_type     = "test"
    client_email     = "test@example.com"
    client_name      = "TEST Ping"
    cabinet          = "Cabinet Test"
    app_version      = "0.0.0-test"
    os               = "Windows"
    activated_at     = [int][double]::Parse((Get-Date -UFormat %s))
    installed_at     = [int][double]::Parse((Get-Date -UFormat %s))
    legacy           = $false
} | ConvertTo-Json -Compress

Write-Host "POST $($env:LICENSE_REGISTRY_URL)" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri $env:LICENSE_REGISTRY_URL -Method POST -Body $payload -ContentType "application/json" -UseBasicParsing
    Write-Host "HTTP $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "Échec : $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host $reader.ReadToEnd()
    }
    exit 1
}
