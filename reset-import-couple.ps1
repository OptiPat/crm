# Reset base locale puis reimport (dev uniquement)
Write-Host "=== RESET BASE LOCALE ===" -ForegroundColor Cyan
Write-Host ""

Get-Process | Where-Object { $_.ProcessName -like "*patrimoine*" -or $_.ProcessName -eq "tauri" } | Stop-Process -Force -ErrorAction SilentlyContinue

$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) { taskkill /F /PID $proc 2>$null }
Start-Sleep -Seconds 3

$dbPath = Join-Path $env:APPDATA "com.patrimoine-crm.app\patrimoine-crm.db"
if (Test-Path $dbPath) {
    Remove-Item $dbPath -Force
    Write-Host "Base supprimee : $dbPath" -ForegroundColor Green
}
Remove-Item "$dbPath*" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Relancez l'app puis reimportez. Exemple couple : « Marie et Pierre » (prénoms seuls)" -ForegroundColor Yellow
Write-Host ""

npm run tauri:dev -- --release
