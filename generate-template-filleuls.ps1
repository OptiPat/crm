# Script pour generer le modele Excel d'import Filleuls
# Executer depuis le repertoire racine : .\generate-template-filleuls.ps1

Write-Host "Generation du modele Excel pour l'import de filleuls..." -ForegroundColor Cyan

# Creer un objet Excel
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$workbook = $excel.Workbooks.Add()
$worksheet = $workbook.Worksheets.Item(1)
$worksheet.Name = "Filleuls"

# Definir les en-tetes
$headers = @(
    "Nom",
    "Prenom", 
    "Email",
    "Telephone",
    "Date de naissance",
    "Categorie",
    "Nom Parrain",
    "Prenom Parrain",
    "Date inscription",
    "Date dernier suivi",
    "Commentaire"
)

# Ecrire les en-tetes
for ($i = 0; $i -lt $headers.Length; $i++) {
    $worksheet.Cells.Item(1, $i + 1) = $headers[$i]
    $worksheet.Cells.Item(1, $i + 1).Font.Bold = $true
    $worksheet.Cells.Item(1, $i + 1).Interior.Color = 15773696
}

# Ajouter un exemple de ligne
$worksheet.Cells.Item(2, 1) = "NOM1"
$worksheet.Cells.Item(2, 2) = "Marie"
$worksheet.Cells.Item(2, 3) = "marie@example.com"
$worksheet.Cells.Item(2, 4) = "06 12 34 56 78"
$worksheet.Cells.Item(2, 5) = "15/03/1985"
$worksheet.Cells.Item(2, 6) = "Filleul"
$worksheet.Cells.Item(2, 7) = "NOM2"
$worksheet.Cells.Item(2, 8) = "Jean"
$worksheet.Cells.Item(2, 9) = "01/10/2023"
$worksheet.Cells.Item(2, 10) = "15/12/2025"
$worksheet.Cells.Item(2, 11) = "Premier filleul actif"

# Ajouter une ligne avec prospect
$worksheet.Cells.Item(3, 1) = "NOM3"
$worksheet.Cells.Item(3, 2) = "Sophie"
$worksheet.Cells.Item(3, 3) = "sophie@example.com"
$worksheet.Cells.Item(3, 4) = "06 23 45 67 89"
$worksheet.Cells.Item(3, 5) = ""
$worksheet.Cells.Item(3, 6) = "Prospect"
$worksheet.Cells.Item(3, 7) = "NOM3"
$worksheet.Cells.Item(3, 8) = "Jean"
$worksheet.Cells.Item(3, 9) = "05/11/2025"
$worksheet.Cells.Item(3, 10) = "10/01/2026"
$worksheet.Cells.Item(3, 11) = "En cours de prospection"

# Ajouter une ligne avec suspect
$worksheet.Cells.Item(4, 1) = "NOM4"
$worksheet.Cells.Item(4, 2) = "Lucas"
$worksheet.Cells.Item(4, 3) = ""
$worksheet.Cells.Item(4, 4) = "06 34 56 78 90"
$worksheet.Cells.Item(4, 5) = ""
$worksheet.Cells.Item(4, 6) = "Suspect"
$worksheet.Cells.Item(4, 7) = ""
$worksheet.Cells.Item(4, 8) = ""
$worksheet.Cells.Item(4, 9) = ""
$worksheet.Cells.Item(4, 10) = ""
$worksheet.Cells.Item(4, 11) = "Contact non qualifie"

# Ajuster la largeur des colonnes
$usedRange = $worksheet.UsedRange
$usedRange.EntireColumn.AutoFit() | Out-Null

# Ajouter une note explicative
$worksheet.Cells.Item(6, 1) = "INSTRUCTIONS :"
$worksheet.Cells.Item(6, 1).Font.Bold = $true
$worksheet.Cells.Item(7, 1) = "Colonnes obligatoires : Nom, Prenom, Categorie"
$worksheet.Cells.Item(8, 1) = "Categories valides : Filleul, Prospect, Suspect, Desinscrit"
$worksheet.Cells.Item(9, 1) = "Si Nom Parrain + Prenom Parrain sont renseignes, le systeme cherchera le parrain dans la base"
$worksheet.Cells.Item(10, 1) = "Les dates peuvent etre au format DD/MM/YYYY ou laissees vides"
$worksheet.Cells.Item(11, 1) = "Supprimez les lignes d'exemple avant l'import"

# Fusionner les cellules d'instructions
$worksheet.Range("A6:K11").Merge() | Out-Null
$worksheet.Range("A6:K11").WrapText = $true
$worksheet.Range("A6:K11").VerticalAlignment = -4160
$worksheet.Range("A6:K11").Interior.Color = 15658734

# Sauvegarder le fichier
$savePath = Join-Path (Get-Location) "Modele_Import_Filleuls.xlsx"
$workbook.SaveAs($savePath)
$workbook.Close($false)
$excel.Quit()

# Liberer les objets COM
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($worksheet) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

Write-Host "Modele Excel genere : $savePath" -ForegroundColor Green
Write-Host "Vous pouvez maintenant ouvrir ce fichier, le remplir et l'importer dans l'application" -ForegroundColor Yellow
