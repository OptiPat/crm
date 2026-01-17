# Script d'initialisation des partenaires dans la base de données
# Exécute le script SQL init-partenaires.sql

Write-Host "🚀 Initialisation des partenaires..." -ForegroundColor Cyan

# Chemin de la base de données
$dbPath = "$env:APPDATA\com.crm.app\crm.db"

# Vérifier si la base existe
if (-not (Test-Path $dbPath)) {
    Write-Host "❌ Base de données non trouvée: $dbPath" -ForegroundColor Red
    Write-Host "ℹ️  Lance l'application une première fois pour créer la base." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Base de données trouvée: $dbPath" -ForegroundColor Green

# Exécuter le script SQL avec sqlite3
try {
    Get-Content "init-partenaires.sql" | sqlite3 $dbPath
    Write-Host "✅ Partenaires initialisés avec succès!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Liste des partenaires ajoutés:" -ForegroundColor Cyan
    Write-Host "   • Assureurs: Oddo, Vie Plus, Apicil, Eres Swisslife, Eres Spirica, Eres Entreprise" -ForegroundColor White
    Write-Host "   • SCPI: Advenis, Altarea IM, Alderan, Voisin, Sofidy, Norma Capital, Mata Capital, Perial AM, Arkea Reim, Atream, La Française" -ForegroundColor White
    Write-Host "   • Promoteurs: Cogedim, Colosseum, Histoire & Patrimoine, CIR, Caractere, Edouard Denis, Tagerim, Corim, Urbis, Bouygues Immobilier, Sporting Promotion, Helenis" -ForegroundColor White
    Write-Host "   • FIP/FCPI/FCPR: Odyssée Venture, Elevation, NextStage, Eiffeil" -ForegroundColor White
    Write-Host "   • G3F: Inter Invest" -ForegroundColor White
} catch {
    Write-Host "❌ Erreur lors de l'initialisation: $_" -ForegroundColor Red
    exit 1
}
