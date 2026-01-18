# Script simplifié pour appliquer la migration
# ATTENTION : Fermez l'application avant d'exécuter ce script !

Write-Host "🔄 Application de la migration filleuls..." -ForegroundColor Cyan
Write-Host ""

# Arrêter l'application si elle tourne
Write-Host "🛑 Arrêt de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -First 1
if ($proc) {
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
    Write-Host "✅ Application arrêtée" -ForegroundColor Green
} else {
    Write-Host "ℹ️ L'application n'était pas en cours d'exécution" -ForegroundColor Gray
}

# Chemin de la base de données
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "❌ Base de données non trouvée : $dbPath" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Base de données trouvée" -ForegroundColor Green

# Sauvegarde
$backupPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
Copy-Item $dbPath $backupPath
Write-Host "💾 Sauvegarde créée : $backupPath" -ForegroundColor Yellow

# Appliquer la migration avec PowerShell
Write-Host "🔧 Application de la migration SQL..." -ForegroundColor Cyan

# Charger System.Data.SQLite si disponible, sinon utiliser un autre moyen
$migrationSQL = Get-Content "drizzle\0004_add_filleul_categories_and_parrain.sql" -Raw

# Méthode alternative : créer un fichier .sql temporaire et l'exécuter
try {
    # Tentative avec sqlite3 s'il est disponible
    $null = sqlite3 -version 2>&1
    $hasSqlite3 = $true
} catch {
    $hasSqlite3 = $false
}

if ($hasSqlite3) {
    # Utiliser sqlite3
    $tempFile = [System.IO.Path]::GetTempFileName() + ".sql"
    $migrationSQL | Out-File -FilePath $tempFile -Encoding UTF8
    sqlite3 $dbPath < $tempFile
    Remove-Item $tempFile
    Write-Host "✅ Migration appliquée avec succès !" -ForegroundColor Green
} else {
    # Plan B : Exécuter directement avec .NET
    Write-Host "ℹ️ sqlite3 non trouvé, utilisation de System.Data.SQLite..." -ForegroundColor Gray
    
    # Charger SQLite
    $sqliteDll = "System.Data.SQLite"
    try {
        Add-Type -AssemblyName $sqliteDll -ErrorAction Stop
    } catch {
        Write-Host "❌ System.Data.SQLite n'est pas installé" -ForegroundColor Red
        Write-Host "💡 Solution : Installez sqlite3 ou System.Data.SQLite" -ForegroundColor Yellow
        exit 1
    }
    
    $connectionString = "Data Source=$dbPath;Version=3;"
    $connection = New-Object System.Data.SQLite.SQLiteConnection($connectionString)
    $connection.Open()
    
    $command = $connection.CreateCommand()
    $command.CommandText = $migrationSQL
    $command.ExecuteNonQuery() | Out-Null
    
    $connection.Close()
    Write-Host "✅ Migration appliquée avec succès !" -ForegroundColor Green
}

Write-Host ""
Write-Host "🚀 Relancement de l'application..." -ForegroundColor Cyan
Start-Sleep -Seconds 1

# Relancer l'application
cd D:\crm
npm run tauri:dev -- --release
