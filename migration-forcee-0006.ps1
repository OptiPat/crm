# MIGRATION FORCEE - contact_id optionnel
Write-Host "=== MIGRATION FORCEE 0006 ===" -ForegroundColor Cyan
Write-Host ""

# Arrêter l'app
Write-Host "1. Arret de l'application..." -ForegroundColor Yellow
$proc = netstat -ano | findstr :1420 | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Select-Object -First 1
if ($proc) {
    taskkill /F /PID $proc 2>$null
    Start-Sleep -Seconds 2
}

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "ERREUR : Base de donnees non trouvee" -ForegroundColor Red
    exit 1
}

Write-Host "Base de donnees : $dbPath" -ForegroundColor Green
Write-Host ""

# Backup
Write-Host "2. Creation backup..." -ForegroundColor Yellow
$backupPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $dbPath $backupPath -Force
Write-Host "   Backup : $backupPath" -ForegroundColor Green
Write-Host ""

# Vérifier structure actuelle
Write-Host "3. Verification structure actuelle..." -ForegroundColor Yellow
$query = "PRAGMA table_info(investissements);"
$currentStructure = $query | sqlite3 $dbPath

Write-Host "   Structure actuelle :" -ForegroundColor Gray
Write-Host $currentStructure
Write-Host ""

# Appliquer la migration en plusieurs étapes
Write-Host "4. Application de la migration..." -ForegroundColor Yellow

try {
    # Étape 1 : Créer table temporaire
    Write-Host "   Etape 1/4 : Creation table temporaire..." -ForegroundColor Gray
    $sql1 = @"
CREATE TABLE IF NOT EXISTS investissements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    foyer_id INTEGER REFERENCES foyers(id) ON DELETE SET NULL,
    type_produit TEXT NOT NULL,
    nom_produit TEXT NOT NULL,
    partenaire_id INTEGER REFERENCES partenaires(id) ON DELETE SET NULL,
    montant_initial INTEGER,
    date_souscription INTEGER,
    date_fin_demembrement INTEGER,
    versement_programme INTEGER DEFAULT 0,
    montant_versement_programme INTEGER,
    frequence_versement TEXT,
    reinvestissement_dividendes INTEGER DEFAULT 0,
    notes TEXT,
    origine TEXT DEFAULT 'MON_CONSEIL',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);
"@
    $sql1 | sqlite3 $dbPath
    Write-Host "   + Table temporaire creee" -ForegroundColor Green
    
    # Étape 2 : Copier données
    Write-Host "   Etape 2/4 : Copie des donnees..." -ForegroundColor Gray
    $sql2 = "INSERT INTO investissements_new SELECT * FROM investissements;"
    $sql2 | sqlite3 $dbPath
    Write-Host "   + Donnees copiees" -ForegroundColor Green
    
    # Étape 3 : Supprimer ancienne table
    Write-Host "   Etape 3/4 : Suppression ancienne table..." -ForegroundColor Gray
    $sql3 = "DROP TABLE investissements;"
    $sql3 | sqlite3 $dbPath
    Write-Host "   + Ancienne table supprimee" -ForegroundColor Green
    
    # Étape 4 : Renommer
    Write-Host "   Etape 4/4 : Renommage..." -ForegroundColor Gray
    $sql4 = "ALTER TABLE investissements_new RENAME TO investissements;"
    $sql4 | sqlite3 $dbPath
    Write-Host "   + Table renommee" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "Migration appliquee avec succes !" -ForegroundColor Green
    
    # Vérifier nouvelle structure
    Write-Host ""
    Write-Host "5. Verification nouvelle structure..." -ForegroundColor Yellow
    $newStructure = $query | sqlite3 $dbPath
    Write-Host $newStructure
    Write-Host ""
    
    if ($newStructure -match "contact_id.*0.*") {
        Write-Host "SUCCES : contact_id est maintenant OPTIONNEL !" -ForegroundColor Green
    } else {
        Write-Host "ATTENTION : Verification manuelle necessaire" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "ERREUR lors de la migration : $_" -ForegroundColor Red
    Write-Host "Restauration du backup..." -ForegroundColor Yellow
    Copy-Item $backupPath $dbPath -Force
    Write-Host "Backup restaure" -ForegroundColor Green
    exit 1
}

Write-Host ""
Write-Host "6. Relancement de l'application..." -ForegroundColor Yellow
Write-Host ""

npm run tauri:dev -- --release
