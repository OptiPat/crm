# Script automatique pour appliquer la migration
Write-Host "🔄 MIGRATION AUTOMATIQUE - Ajout support filleuls" -ForegroundColor Cyan
Write-Host ""

# 1. Arrêter l'application
Write-Host "1️⃣ Arrêt de l'application..." -ForegroundColor Yellow
$procs = Get-Process | Where-Object { $_.ProcessName -like "*patrimoine*" -or $_.ProcessName -like "*crm*" }
foreach ($proc in $procs) {
    try {
        $proc.Kill()
        $proc.WaitForExit(5000)
        Write-Host "   ✅ Processus $($proc.ProcessName) arrêté" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️ Impossible d'arrêter $($proc.ProcessName)" -ForegroundColor Yellow
    }
}

# Attendre que tout soit fermé
Start-Sleep -Seconds 2

# 2. Localiser la base de données
Write-Host ""
Write-Host "2️⃣ Localisation de la base de données..." -ForegroundColor Yellow
$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "   ❌ Base de données non trouvée : $dbPath" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Base trouvée : $dbPath" -ForegroundColor Green

# 3. Sauvegarde
Write-Host ""
Write-Host "3️⃣ Création d'une sauvegarde..." -ForegroundColor Yellow
$backupPath = "$env:APPDATA\com.patrimoine-crm.app\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
Copy-Item $dbPath $backupPath
Write-Host "   ✅ Sauvegarde : $backupPath" -ForegroundColor Green

# 4. Application de la migration
Write-Host ""
Write-Host "4️⃣ Application de la migration SQL..." -ForegroundColor Yellow

# Créer un script PowerShell qui utilise System.Data.SQLite
$migrationSQL = @"
PRAGMA foreign_keys = OFF;

CREATE TABLE contacts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  foyer_id INTEGER,
  categorie TEXT NOT NULL DEFAULT 'SUSPECT_CLIENT',
  parrain_id INTEGER,
  civilite TEXT,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  date_naissance INTEGER,
  profession TEXT,
  situation_familiale TEXT,
  source_lead TEXT,
  profil_risque_sri INTEGER,
  date_dernier_contact INTEGER,
  date_prochain_suivi INTEGER,
  statut_suivi TEXT NOT NULL DEFAULT 'ACTIF',
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO contacts_new SELECT id, foyer_id, categorie, NULL as parrain_id, civilite, nom, prenom, email, telephone, adresse, code_postal, ville, date_naissance, profession, situation_familiale, source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi, statut_suivi, notes, created_at, updated_at FROM contacts;

DROP TABLE contacts;

ALTER TABLE contacts_new RENAME TO contacts;

CREATE INDEX IF NOT EXISTS idx_contacts_parrain_id ON contacts(parrain_id);

PRAGMA foreign_keys = ON;
"@

# Utiliser l'API .NET System.Data.SQLite
Add-Type -Path "C:\Windows\Microsoft.NET\assembly\GAC_MSIL\System.Data.SQLite\v4.0_1.0.118.0__db937bc2d44ff139\System.Data.SQLite.dll" -ErrorAction SilentlyContinue

try {
    # Fallback : exécution manuelle avec les commandes SQL une par une
    $commands = $migrationSQL -split ";"
    
    # Créer un fichier temporaire avec les commandes SQL
    $tempSql = [System.IO.Path]::GetTempFileName()
    $migrationSQL | Out-File -FilePath $tempSql -Encoding ASCII
    
    # On va utiliser une approche native PowerShell avec ADO.NET
    $ErrorActionPreference = "Stop"
    
    # Charger l'assembly SQLite de Windows
    [System.Reflection.Assembly]::LoadWithPartialName("System.Data.SQLite") | Out-Null
    
    $connString = "Data Source=$dbPath"
    $conn = New-Object System.Data.SQLite.SQLiteConnection($connString)
    $conn.Open()
    
    foreach ($cmdText in ($migrationSQL -split ';' | Where-Object { $_.Trim() -ne '' })) {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $cmdText
        $cmd.ExecuteNonQuery() | Out-Null
    }
    
    $conn.Close()
    $conn.Dispose()
    
    Write-Host "   ✅ Migration appliquée avec succès !" -ForegroundColor Green
    Remove-Item $tempSql -ErrorAction SilentlyContinue
    
} catch {
    Write-Host "   ❌ Erreur : $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔄 Restauration de la sauvegarde..." -ForegroundColor Yellow
    Copy-Item $backupPath $dbPath -Force
    Write-Host "✅ Base restaurée" -ForegroundColor Green
    exit 1
}

# 5. Relancer l'application
Write-Host ""
Write-Host "5️⃣ Redémarrage de l'application..." -ForegroundColor Yellow
Start-Sleep -Seconds 1

cd D:\crm
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run tauri:dev -- --release"

Write-Host ""
Write-Host "✅ MIGRATION TERMINÉE AVEC SUCCÈS !" -ForegroundColor Green
Write-Host "L'application va redémarrer dans quelques secondes..." -ForegroundColor Cyan
