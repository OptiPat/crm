# Debug import couple + plusieurs lignes SCPI (dev local)
Write-Host "=== DEBUG SCPI COUPLE (exemple) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verifier dans les logs : lignes « Marie et Pierre » + SCPI" -ForegroundColor Yellow
Write-Host ""

$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1
if ($proc) {
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

npm run tauri:dev -- --release
