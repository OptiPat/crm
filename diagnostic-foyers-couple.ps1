# Diagnostic foyers en doublon (dev local — filtre optionnel sur le nom du foyer)
param(
    [string]$FiltreNom = "Foyer"
)

Write-Host "=== DIAGNOSTIC FOYERS (filtre: $FiltreNom) ===" -ForegroundColor Cyan
Write-Host ""

$dbPath = Join-Path $env:APPDATA "com.patrimoine-crm.app\patrimoine-crm.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "Erreur : base introuvable : $dbPath" -ForegroundColor Red
    exit 1
}

Write-Host "Base : $dbPath" -ForegroundColor Gray
Write-Host ""

Add-Type -Path "C:\Windows\Microsoft.NET\assembly\GAC_MSIL\System.Data\v4.0_4.0.0.0__b77a5c561934e089\System.Data.dll"

$connection = New-Object System.Data.SQLite.SQLiteConnection("Data Source=$dbPath")
$connection.Open()

Write-Host "--- FOYERS ---"
$cmdFoyers = $connection.CreateCommand()
$cmdFoyers.CommandText = "SELECT id, nom, type_foyer FROM foyers WHERE nom LIKE '%' || @filtre || '%' ORDER BY id"
$null = $cmdFoyers.Parameters.AddWithValue("@filtre", $FiltreNom)
$readerFoyers = $cmdFoyers.ExecuteReader()

$foyers = @()
while ($readerFoyers.Read()) {
    $foyerId = $readerFoyers["id"]
    $foyerNom = $readerFoyers["nom"]
    Write-Host "Foyer ID: $foyerId - $foyerNom" -ForegroundColor Cyan
    $foyers += @{ Id = $foyerId }
}

$readerFoyers.Close()
$connection.Close()

if ($foyers.Count -gt 1) {
    Write-Host "PROBLEME : $($foyers.Count) foyers pour le filtre '$FiltreNom'" -ForegroundColor Red
} elseif ($foyers.Count -eq 1) {
    Write-Host "OK : 1 seul foyer" -ForegroundColor Green
} else {
    Write-Host "Aucun foyer pour '$FiltreNom'" -ForegroundColor Yellow
}
