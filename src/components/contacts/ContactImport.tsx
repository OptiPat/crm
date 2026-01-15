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
import { createContact, getAllContacts, type NewContact } from "@/lib/api/tauri-contacts";
import { Badge } from "@/components/ui/badge";

interface ContactImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportRow {
  data: Record<string, any>;
  status: "pending" | "success" | "error" | "duplicate";
  message?: string;
}

export function ContactImport({ open, onOpenChange, onSuccess }: ContactImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing">("upload");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "merge">("skip");

  const fieldOptions = [
    { value: "", label: "Ne pas importer" },
    { value: "nom", label: "Nom" },
    { value: "prenom", label: "Prénom" },
    { value: "email", label: "Email" },
    { value: "telephone", label: "Téléphone" },
    { value: "adresse", label: "Adresse" },
    { value: "code_postal", label: "Code postal" },
    { value: "ville", label: "Ville" },
    { value: "profession", label: "Profession" },
    { value: "categorie", label: "Catégorie" },
  ];

  // Détection intelligente des colonnes
  const detectColumnMapping = (cols: string[]) => {
    const detectedMapping: Record<string, string> = {};
    
    cols.forEach(col => {
      const colLower = col.toLowerCase().trim();
      
      if (colLower.includes("nom") && !colLower.includes("prenom") && !colLower.includes("prénom")) {
        detectedMapping[col] = "nom";
      } else if (colLower.includes("prenom") || colLower.includes("prénom")) {
        detectedMapping[col] = "prenom";
      } else if (colLower.includes("mail") || colLower.includes("email") || colLower.includes("e-mail")) {
        detectedMapping[col] = "email";
      } else if (colLower.includes("tel") || colLower.includes("phone") || colLower.includes("mobile")) {
        detectedMapping[col] = "telephone";
      } else if (colLower.includes("adresse") || colLower.includes("address") || colLower.includes("rue")) {
        detectedMapping[col] = "adresse";
      } else if (colLower.includes("code") && (colLower.includes("postal") || colLower.includes("zip"))) {
        detectedMapping[col] = "code_postal";
      } else if (colLower.includes("ville") || colLower.includes("city")) {
        detectedMapping[col] = "ville";
      } else if (colLower.includes("profession") || colLower.includes("metier") || colLower.includes("métier")) {
        detectedMapping[col] = "profession";
      } else if (colLower.includes("categorie") || colLower.includes("catégorie") || colLower.includes("type")) {
        detectedMapping[col] = "categorie";
      }
    });
    
    return detectedMapping;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      
      if (jsonData.length === 0) {
        alert("Le fichier est vide");
        return;
      }

      const cols = Object.keys(jsonData[0] as object);
      setColumns(cols);
      setRows(jsonData);
      
      // Détection automatique du mapping
      const detectedMapping = detectColumnMapping(cols);
      setMapping(detectedMapping);
      
      setStep("mapping");
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Erreur lors de la lecture du fichier");
    }
  };

  const handleNextToPreview = async () => {
    // Vérifier que nom et prénom sont mappés
    const hasNom = Object.values(mapping).includes("nom");
    const hasPrenom = Object.values(mapping).includes("prenom");
    
    if (!hasNom || !hasPrenom) {
      alert("Le nom et le prénom sont obligatoires");
      return;
    }

    // Charger les contacts existants pour détecter les doublons
    try {
      const existingContacts = await getAllContacts();
      
      const preparedRows: ImportRow[] = rows.map(row => {
        const contactData: Record<string, any> = {};
        
        // Mapper les colonnes
        Object.entries(mapping).forEach(([sourceCol, targetField]) => {
          if (targetField && row[sourceCol]) {
            contactData[targetField] = row[sourceCol];
          }
        });

        // Détecter les doublons par email ou téléphone
        const isDuplicate = existingContacts.some(contact => {
          if (contactData.email && contact.email === contactData.email) return true;
          if (contactData.telephone && contact.telephone === contactData.telephone) return true;
          return false;
        });

        return {
          data: contactData,
          status: isDuplicate ? "duplicate" : "pending",
          message: isDuplicate ? "Email ou téléphone déjà existant" : undefined,
        };
      });

      setImportRows(preparedRows);
      setStep("preview");
    } catch (error) {
      console.error("Error detecting duplicates:", error);
      alert("Erreur lors de la détection des doublons");
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setStep("importing");

    const updatedRows = [...importRows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      
      // Ignorer les doublons si l'option est "skip"
      if (row.status === "duplicate" && duplicateAction === "skip") {
        continue;
      }

      try {
        const newContact: NewContact = {
          nom: row.data.nom || "",
          prenom: row.data.prenom || "",
          email: row.data.email || null,
          telephone: row.data.telephone || null,
          adresse: row.data.adresse || null,
          code_postal: row.data.code_postal || null,
          ville: row.data.ville || null,
          profession: row.data.profession || null,
          categorie: row.data.categorie || "SUSPECT_CLIENT",
          statut_suivi: "ACTIF",
        };

        await createContact(newContact);
        updatedRows[i] = { ...row, status: "success", message: "Importé avec succès" };
      } catch (error) {
        updatedRows[i] = { ...row, status: "error", message: String(error) };
      }

      setImportRows([...updatedRows]);
    }

    setImporting(false);
    
    setTimeout(() => {
      onSuccess();
      handleClose();
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
    onOpenChange(false);
  };

  const successCount = importRows.filter(r => r.status === "success").length;
  const errorCount = importRows.filter(r => r.status === "error").length;
  const duplicateCount = importRows.filter(r => r.status === "duplicate").length;
  const pendingCount = importRows.filter(r => r.status === "pending").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer des contacts</DialogTitle>
          <DialogDescription>
            Importez vos contacts depuis un fichier Excel (.xlsx) ou CSV
          </DialogDescription>
        </DialogHeader>

        {/* ÉTAPE 1 : Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Sélectionnez un fichier Excel (.xlsx) ou CSV
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload">
                <Button variant="outline" className="cursor-pointer" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    Choisir un fichier
                  </span>
                </Button>
              </label>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : Mapping des colonnes */}
        {step === "mapping" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>{rows.length}</strong> ligne{rows.length > 1 ? "s" : ""} trouvée{rows.length > 1 ? "s" : ""} dans le fichier.
                Associez chaque colonne à un champ du CRM.
              </p>
            </div>

            <div className="space-y-3">
              {columns.map(col => (
                <div key={col} className="grid grid-cols-2 gap-4 items-center">
                  <Label className="font-medium">{col}</Label>
                  <Select
                    value={mapping[col] || ""}
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
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {pendingCount} contact{pendingCount > 1 ? "s" : ""} prêt{pendingCount > 1 ? "s" : ""} à être importé{pendingCount > 1 ? "s" : ""}
                </p>
                {duplicateCount > 0 && (
                  <p className="text-sm text-orange-600">
                    {duplicateCount} doublon{duplicateCount > 1 ? "s" : ""} détecté{duplicateCount > 1 ? "s" : ""}
                  </p>
                )}
              </div>

              {duplicateCount > 0 && (
                <Select value={duplicateAction} onValueChange={(v: any) => setDuplicateAction(v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Ignorer les doublons</SelectItem>
                    <SelectItem value="merge">Importer quand même</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="border rounded-lg max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Statut</th>
                    <th className="p-2 text-left">Nom</th>
                    <th className="p-2 text-left">Prénom</th>
                    <th className="p-2 text-left">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">
                        {row.status === "duplicate" && (
                          <Badge variant="outline" className="bg-orange-50 text-orange-800">
                            Doublon
                          </Badge>
                        )}
                        {row.status === "pending" && (
                          <Badge variant="outline" className="bg-green-50 text-green-800">
                            Prêt
                          </Badge>
                        )}
                      </td>
                      <td className="p-2">{row.data.nom}</td>
                      <td className="p-2">{row.data.prenom}</td>
                      <td className="p-2">{row.data.email || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importRows.length > 50 && (
                <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                  ... et {importRows.length - 50} ligne{importRows.length - 50 > 1 ? "s" : ""} de plus
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Retour
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                <Upload className="h-4 w-4 mr-2" />
                Importer {pendingCount} contact{pendingCount > 1 ? "s" : ""}
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
              <div>
                <div className="text-2xl font-bold text-orange-600">{duplicateCount}</div>
                <div className="text-sm text-muted-foreground">Doublons</div>
              </div>
            </div>

            <div className="border rounded-lg max-h-96 overflow-y-auto">
              {importRows.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 border-b last:border-b-0">
                  <span className="text-sm">
                    {row.data.prenom} {row.data.nom}
                  </span>
                  <div className="flex items-center gap-2">
                    {row.status === "success" && <CheckCircle className="h-4 w-4 text-green-600" />}
                    {row.status === "error" && <X className="h-4 w-4 text-red-600" />}
                    {row.status === "duplicate" && duplicateAction === "skip" && (
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                    )}
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
