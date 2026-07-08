# Teste le webhook notes partagées (Apps Script) avec un sync fictif.
# Prérequis : license-build.local.ps1 renseigné (NOTES_REGISTRY_*).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root "scripts\load-license-build-env.ps1") | Out-Null

if (-not $env:NOTES_REGISTRY_URL -or -not $env:NOTES_REGISTRY_TOKEN) {
    Write-Host "ERREUR : configurez NOTES_REGISTRY_URL et NOTES_REGISTRY_TOKEN dans license-build.local.ps1." -ForegroundColor Red
    exit 1
}

$payload = @{
    token  = $env:NOTES_REGISTRY_TOKEN
    action = "sync"
} | ConvertTo-Json -Compress

Write-Host "POST $($env:NOTES_REGISTRY_URL) (action=sync)" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri $env:NOTES_REGISTRY_URL -Method POST -Body $payload -ContentType "application/json" -UseBasicParsing
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
