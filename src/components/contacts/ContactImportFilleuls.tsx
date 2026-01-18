import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X } from "lucide-react";
import * as XLSX from "xlsx";
import { createContact, findContactByName, type NewContact } from "@/lib/api/tauri-contacts";
import { Badge } from "@/components/ui/badge";

interface ContactImportFilleulsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportRow {
  data: Record<string, any>;
  status: "pending" | "success" | "error" | "warning";
  message?: string;
  warnings?: string[];
}

export function ContactImportFilleuls({ open, onOpenChange, onSuccess }: ContactImportFilleulsProps) {
  const [_file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing">("upload");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldOptions = [
    { value: "SKIP", label: "Ne pas importer" },
    { value: "nom", label: "Nom *" },
    { value: "prenom", label: "Prénom *" },
    { value: "email", label: "Email" },
    { value: "telephone", label: "Téléphone" },
    { value: "date_naissance", label: "Date de naissance" },
    { value: "categorie", label: "Catégorie *" },
    { value: "nom_parrain", label: "Nom Parrain" },
    { value: "prenom_parrain", label: "Prénom Parrain" },
    { value: "date_inscription", label: "Date inscription" },
    { value: "date_dernier_suivi", label: "Date dernier suivi" },
    { value: "commentaire", label: "Commentaire" },
  ];

  // Détection intelligente des colonnes
  const detectColumnMapping = (cols: string[]) => {
    const detectedMapping: Record<string, string> = {};
    
    cols.forEach(col => {
      const colLower = col.toLowerCase().trim();
      
      // Colonnes de base du filleul
      if (colLower === "nom" || colLower === "nom filleul") {
        detectedMapping[col] = "nom";
      } else if (colLower === "prénom" || colLower === "prenom" || colLower === "prénom filleul") {
        detectedMapping[col] = "prenom";
      } else if (colLower.includes("mail") || colLower === "email") {
        detectedMapping[col] = "email";
      } else if (colLower.includes("tel") || colLower.includes("téléphone") || colLower === "telephone") {
        detectedMapping[col] = "telephone";
      } else if (colLower.includes("date") && colLower.includes("naissance")) {
        detectedMapping[col] = "date_naissance";
      } else if (colLower === "catégorie" || colLower === "categorie" || colLower === "statut") {
        detectedMapping[col] = "categorie";
      } 
      // Colonnes du parrain (vérifier prénom AVANT nom pour éviter les conflits)
      else if (
        colLower === "prénom parrain" || 
        colLower === "prenom parrain" ||
        colLower === "prénomparrain" ||
        colLower === "prenomparrain"
      ) {
        detectedMapping[col] = "prenom_parrain";
      } else if (
        colLower === "nom parrain" || 
        colLower === "nomparrain"
      ) {
        detectedMapping[col] = "nom_parrain";
      }
      // Autres colonnes
      else if (colLower.includes("date") && colLower.includes("inscription")) {
        detectedMapping[col] = "date_inscription";
      } else if (colLower.includes("date") && colLower.includes("suivi")) {
        detectedMapping[col] = "date_dernier_suivi";
      } else if (colLower.includes("commentaire") || colLower.includes("note")) {
        detectedMapping[col] = "commentaire";
      }
    });
    
    return detectedMapping;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 10 * 1024 * 1024) {
      alert("Le fichier est trop volumineux (max 10MB)");
      return;
    }

    setFile(selectedFile);
    
    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      
      if (workbook.SheetNames.length === 0) {
        alert("Le fichier ne contient aucune feuille");
        return;
      }
      
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      
      if (jsonData.length === 0) {
        alert("Le fichier est vide");
        return;
      }

      // Détecter toutes les colonnes
      const allColumns = new Set<string>();
      jsonData.forEach((row: any) => {
        Object.keys(row).forEach(col => allColumns.add(col));
      });
      const cols = Array.from(allColumns);
      
      setColumns(cols);
      setRows(jsonData);
      
      // Détection automatique du mapping
      const detectedMapping = detectColumnMapping(cols);
      setMapping(detectedMapping);
      
      setStep("mapping");
    } catch (error) {
      console.error("Error reading file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Erreur lors de la lecture du fichier: ${errorMessage}`);
      setFile(null);
      setStep("upload");
    }
  };

  const handleNextToPreview = async () => {
    setError(null);
    
    // Vérifier que nom, prénom et catégorie sont mappés
    const hasNom = Object.values(mapping).includes("nom");
    const hasPrenom = Object.values(mapping).includes("prenom");
    const hasCategorie = Object.values(mapping).includes("categorie");
    
    if (!hasNom || !hasPrenom || !hasCategorie) {
      setError("Le nom, le prénom et la catégorie sont obligatoires pour l'import");
      return;
    }

    try {
      const preparedRows: ImportRow[] = await Promise.all(rows.map(async (row) => {
        const contactData: Record<string, any> = {};
        const warnings: string[] = [];
        
        // Mapper les colonnes
        Object.entries(mapping).forEach(([sourceCol, targetField]) => {
          if (targetField && targetField !== "SKIP") {
            const value = row[sourceCol] !== undefined ? row[sourceCol] : null;
            contactData[targetField] = value;
          }
        });

        // Rechercher le parrain si nom/prénom fournis
        if (contactData.nom_parrain && contactData.prenom_parrain) {
          try {
            // D'abord, chercher le parrain dans TOUTE la base (tous types de contacts)
            let parrain = await findContactByName(
              contactData.nom_parrain,
              contactData.prenom_parrain
            );
            
            if (parrain) {
              // Parrain trouvé (peu importe sa catégorie : CLIENT, PROSPECT, SUSPECT, FILLEUL, etc.)
              contactData.parrain_id = parrain.id;
            } else {
              // Parrain non trouvé → le créer automatiquement
              try {
                const newParrain: NewContact = {
                  nom: contactData.nom_parrain,
                  prenom: contactData.prenom_parrain,
                  categorie: "SUSPECT_CLIENT", // Par défaut, on considère qu'un parrain est côté client
                  statut_suivi: "ACTIF",
                };
                
                const createdParrain = await createContact(newParrain);
                contactData.parrain_id = createdParrain.id;
                warnings.push(`✅ Parrain créé automatiquement: ${contactData.prenom_parrain} ${contactData.nom_parrain}`);
              } catch (createError) {
                console.error(`❌ Erreur création parrain:`, createError);
                warnings.push(`❌ Impossible de créer le parrain: ${contactData.prenom_parrain} ${contactData.nom_parrain}`);
              }
            }
          } catch (error) {
            console.error(`⚠️ Erreur recherche parrain:`, error);
            warnings.push(`⚠️ Erreur recherche parrain: ${error}`);
          }
        }

        return {
          data: contactData,
          status: "pending" as const,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }));

      setImportRows(preparedRows);
      setStep("preview");
    } catch (error) {
      console.error("Error preparing preview:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Erreur lors de la préparation: ${errorMessage}`);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setStep("importing");

    const updatedRows = [...importRows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      
      try {
        // Mapper la catégorie depuis l'Excel
        let categorie: string;
        const catStr = String(row.data.categorie || "").trim().toUpperCase();
        
        switch (catStr) {
          case "FILLEUL":
          case "FILLEUL ACTIF":
            categorie = "FILLEUL";
            break;
          case "PROSPECT":
          case "PROSPECT FILLEUL":
            categorie = "PROSPECT_FILLEUL";
            break;
          case "SUSPECT":
          case "SUSPECT FILLEUL":
            categorie = "SUSPECT_FILLEUL";
            break;
          case "DESINSCRIT":
          case "DÉSINSCRIT":
          case "FILLEUL DESINSCRIT":
          case "FILLEUL DÉSINSCRIT":
            categorie = "FILLEUL_DESINSCRIT";
            break;
          default:
            categorie = "SUSPECT_FILLEUL"; // Par défaut
        }

        // Parser la date de dernier suivi
        let dateDernierContact: string | undefined;
        if (row.data.date_dernier_suivi) {
          const dateStr = String(row.data.date_dernier_suivi).trim();
          const excelDate = parseFloat(dateStr);
          
          if (!isNaN(excelDate) && excelDate > 1) {
            const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
            if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1950) {
              dateDernierContact = jsDate.toISOString();
            }
          }
        }

        // Parser la date de naissance
        let dateNaissance: string | undefined;
        if (row.data.date_naissance) {
          const dateStr = String(row.data.date_naissance).trim();
          const excelDate = parseFloat(dateStr);
          
          if (!isNaN(excelDate) && excelDate > 1) {
            const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
            if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1900) {
              dateNaissance = jsDate.toISOString();
            }
          }
        }

        // Construire les notes
        let notes = row.data.commentaire ? String(row.data.commentaire).trim() : undefined;
        
        // Ajouter la date d'inscription aux notes si présente
        if (row.data.date_inscription) {
          const dateInscription = String(row.data.date_inscription).trim();
          const prefix = notes ? "\n\n" : "";
          notes = notes 
            ? `${notes}${prefix}Date inscription: ${dateInscription}`
            : `Date inscription: ${dateInscription}`;
        }

        const newContact: NewContact = {
          nom: row.data.nom || "",
          prenom: row.data.prenom || "",
          email: row.data.email ? String(row.data.email).trim() : undefined,
          telephone: row.data.telephone ? String(row.data.telephone).trim() : undefined,
          date_naissance: dateNaissance,
          categorie: categorie,
          parrain_id: row.data.parrain_id,
          date_dernier_contact: dateDernierContact,
          statut_suivi: "ACTIF",
          notes: notes,
        };

        await createContact(newContact);
        
        let message = "Importé avec succès";
        if (row.warnings && row.warnings.length > 0) {
          message += ` (${row.warnings.join(", ")})`;
        }
        
        updatedRows[i] = { 
          ...row, 
          status: row.warnings && row.warnings.length > 0 ? "warning" : "success",
          message 
        };
      } catch (error) {
        updatedRows[i] = { ...row, status: "error", message: String(error) };
      }

      setImportRows([...updatedRows]);
    }

    setImporting(false);
    
    // Attendre 2 secondes avant de fermer
    setTimeout(() => {
      handleClose();
      setTimeout(() => onSuccess(), 100);
    }, 2000);
  };

  const handleClose = () => {
    setFile(null);
    setColumns([]);
    setRows([]);
    setMapping({});
    setStep("upload");
    setImportRows([]);
    setImporting(false);
    setError(null);
    onOpenChange(false);
  };

  const successCount = importRows.filter(r => r.status === "success" || r.status === "warning").length;
  const errorCount = importRows.filter(r => r.status === "error").length;
  const pendingCount = importRows.filter(r => r.status === "pending").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer des filleuls</DialogTitle>
          <DialogDescription>
            Importez vos filleuls depuis un fichier Excel (.xlsx)
          </DialogDescription>
        </DialogHeader>

        {/* Afficher les erreurs */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Erreur</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* ÉTAPE 1 : Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-medium mb-2">
                📋 Colonnes attendues dans votre fichier Excel :
              </p>
              <ul className="text-sm text-blue-700 space-y-1 ml-4">
                <li>• <strong>Nom</strong> * (obligatoire)</li>
                <li>• <strong>Prénom</strong> * (obligatoire)</li>
                <li>• <strong>Catégorie</strong> * : Filleul / Prospect / Suspect / Désinscrit</li>
                <li>• Email</li>
                <li>• Téléphone</li>
                <li>• Date de naissance</li>
                <li>• Nom Parrain / Prénom Parrain (pour lier au parrain)</li>
                <li>• Date inscription</li>
                <li>• Date dernier suivi</li>
                <li>• Commentaire</li>
              </ul>
            </div>

            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Sélectionnez un fichier Excel (.xlsx)
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload-filleuls"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('file-upload-filleuls')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Choisir un fichier
              </Button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : Mapping des colonnes */}
        {step === "mapping" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>{rows.length}</strong> ligne{rows.length > 1 ? "s" : ""} trouvée{rows.length > 1 ? "s" : ""} dans le fichier.
                Associez chaque colonne à un champ.
              </p>
            </div>

            <div className="space-y-3">
              {columns.map(col => (
                <div key={col} className="grid grid-cols-2 gap-4 items-center">
                  <Label className="font-medium">
                    {col}
                    {mapping[col] && mapping[col] !== "SKIP" && (
                      <span className="ml-2 text-xs text-green-600">✓</span>
                    )}
                  </Label>
                  <Select
                    value={mapping[col] || "SKIP"}
                    onValueChange={(value) => setMapping({ ...mapping, [col]: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Retour
              </Button>
              <Button onClick={handleNextToPreview}>
                Suivant : Prévisualisation
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ÉTAPE 3 : Prévisualisation */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {pendingCount} filleul{pendingCount > 1 ? "s" : ""} prêt{pendingCount > 1 ? "s" : ""} à être importé{pendingCount > 1 ? "s" : ""}
                </p>
                {importRows.some(r => r.warnings && r.warnings.length > 0) && (
                  <p className="text-sm text-orange-600">
                    {importRows.filter(r => r.warnings && r.warnings.length > 0).length} avertissement{importRows.filter(r => r.warnings && r.warnings.length > 0).length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>

            <div className="border rounded-lg max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Nom</th>
                    <th className="p-2 text-left">Prénom</th>
                    <th className="p-2 text-left">Catégorie</th>
                    <th className="p-2 text-left">Parrain</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{row.data.nom}</td>
                      <td className="p-2">{row.data.prenom}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="bg-purple-50 text-purple-700">
                          {row.data.categorie || "SUSPECT_FILLEUL"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {row.data.parrain_id ? (
                          <span className="text-green-600">✓ Trouvé</span>
                        ) : row.data.nom_parrain ? (
                          <span className="text-orange-600">⚠️ Non trouvé</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Retour
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                <Upload className="h-4 w-4 mr-2" />
                Importer {pendingCount} filleul{pendingCount > 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ÉTAPE 4 : Import en cours */}
        {step === "importing" && (
          <div className="space-y-4">
            <div className="flex items-center justify-around text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{successCount}</div>
                <div className="text-sm text-muted-foreground">Importés</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                <div className="text-sm text-muted-foreground">Erreurs</div>
              </div>
            </div>

            <div className="border rounded-lg max-h-96 overflow-y-auto">
              {importRows.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 border-b last:border-b-0">
                  <span className="text-sm">
                    {row.data.prenom} {row.data.nom}
                  </span>
                  <div className="flex items-center gap-2">
                    {(row.status === "success" || row.status === "warning") && <CheckCircle className="h-4 w-4 text-green-600" />}
                    {row.status === "error" && <X className="h-4 w-4 text-red-600" />}
                    {row.status === "pending" && <span className="text-xs text-muted-foreground">En attente...</span>}
                  </div>
                </div>
              ))}
            </div>

            {!importing && (
              <DialogFooter>
                <Button onClick={handleClose}>
                  Fermer
                </Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
