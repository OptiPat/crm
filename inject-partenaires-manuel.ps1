# Script d'injection manuelle des partenaires dans la base existante
# À utiliser si l'app ne compile pas à cause de l'erreur PDB

Write-Host "🔧 Injection manuelle des partenaires..." -ForegroundColor Cyan

# Chemin de la base de données
$dbPath = "$env:APPDATA\com.crm.app\patrimoine-crm.db"

# Vérifier si la base existe
if (-not (Test-Path $dbPath)) {
    Write-Host "❌ Base de données non trouvée: $dbPath" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Base trouvée: $dbPath" -ForegroundColor Green

# Vérifier le nombre de partenaires existants
$count = sqlite3 $dbPath "SELECT COUNT(*) FROM partenaires"
Write-Host "📊 Partenaires actuels: $count" -ForegroundColor Yellow

if ($count -gt 0) {
    Write-Host "⚠️  Des partenaires existent déjà. Voulez-vous continuer? (o/N)" -ForegroundColor Yellow
    $confirmation = Read-Host
    if ($confirmation -ne "o" -and $confirmation -ne "O") {
        Write-Host "❌ Annulé." -ForegroundColor Red
        exit 0
    }
}

Write-Host ""
Write-Host "🚀 Insertion des 43 partenaires..." -ForegroundColor Cyan

# Exécuter le script SQL
Get-Content "init-partenaires.sql" | sqlite3 $dbPath

# Vérifier le résultat
$newCount = sqlite3 $dbPath "SELECT COUNT(*) FROM partenaires"
Write-Host ""
Write-Host "✅ Terminé ! Total de partenaires: $newCount" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Vérification par type:" -ForegroundColor Cyan
sqlite3 $dbPath "SELECT type_partenaire, COUNT(*) as nb FROM partenaires GROUP BY type_partenaire" | ForEach-Object {
    Write-Host "   • $_" -ForegroundColor White
}

Write-Host ""
Write-Host "🎉 Relance l'application maintenant !" -ForegroundColor Green
