# Script pour créer la table alertes dans la base de données
Write-Host "🔧 Création de la table alertes..." -ForegroundColor Yellow

$dbPath = "$env:APPDATA\com.patrimoine-crm.app\patrimoine-crm.db"

if (Test-Path $dbPath) {
    Write-Host "📁 Base de données trouvée: $dbPath" -ForegroundColor Green
    
    # Utiliser sqlite3 pour exécuter le script
    sqlite3 $dbPath < create-alertes-table.sql
    
    Write-Host "✅ Table alertes créée avec succès!" -ForegroundColor Green
} else {
    Write-Host "❌ Base de données non trouvée à: $dbPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "Redémarre l'application pour voir les changements." -ForegroundColor Cyan
