# Script de test de la migration des partenaires
# Ce script supprime la base et relance l'app pour tester la migration

Write-Host "🧪 Test de la migration des partenaires..." -ForegroundColor Cyan

# Chemin de la base de données
$dbPath = "$env:APPDATA\com.crm.app\crm.db"

Write-Host ""
Write-Host "⚠️  ATTENTION: Ce script va SUPPRIMER la base de données actuelle !" -ForegroundColor Yellow
Write-Host "📂 Chemin: $dbPath" -ForegroundColor Gray
Write-Host ""

$confirmation = Read-Host "Continuer? (o/N)"

if ($confirmation -ne "o" -and $confirmation -ne "O") {
    Write-Host "❌ Annulé." -ForegroundColor Red
    exit 0
}

# Supprimer la base si elle existe
if (Test-Path $dbPath) {
    Remove-Item $dbPath -Force
    Write-Host "✅ Base de données supprimée" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Aucune base existante" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🚀 Lance maintenant l'application avec: npm run tauri dev" -ForegroundColor Cyan
Write-Host "✅ Les 43 partenaires seront automatiquement créés !" -ForegroundColor Green
