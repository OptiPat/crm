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
import { createContact, getAllContacts, updateContact, type NewContact } from "@/lib/api/tauri-contacts";
import {
  buildContactIdMap,
  contactNameKey,
  lookupParrainId,
  resolveParrain,
  type ParrainResolveStatus,
} from "@/lib/contacts/name-match";
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
  parrainPreview?: {
    status: ParrainResolveStatus;
    label: string;
    swapped?: boolean;
  };
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
      const existingContacts = await getAllContacts();
      const importNameKeys = new Set<string>();

      const preparedRows: ImportRow[] = [];

      for (const row of rows) {
        const contactData: Record<string, any> = {};
        const warnings: string[] = [];

        Object.entries(mapping).forEach(([sourceCol, targetField]) => {
          if (targetField && targetField !== "SKIP") {
            const value = row[sourceCol] !== undefined ? row[sourceCol] : null;
            contactData[targetField] = value;
          }
        });

        if (contactData.nom && contactData.prenom) {
          importNameKeys.add(
            contactNameKey(String(contactData.nom), String(contactData.prenom))
          );
        }

        preparedRows.push({
          data: contactData,
          status: "pending" as const,
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      }

      for (const prepared of preparedRows) {
        if (prepared.data.nom_parrain && prepared.data.prenom_parrain) {
          const resolution = resolveParrain(
            String(prepared.data.nom_parrain),
            String(prepared.data.prenom_parrain),
            existingContacts,
            importNameKeys
          );
          prepared.parrainPreview = {
            status: resolution.status,
            label: resolution.label,
            swapped: resolution.swapped,
          };
          if (resolution.parrainId) {
            prepared.data.parrain_id = resolution.parrainId;
          }
          if (resolution.status === "missing") {
            prepared.warnings = [
              ...(prepared.warnings || []),
              `Parrain absent du CRM et du fichier : ${resolution.label}`,
            ];
          } else if (resolution.status === "in_file") {
            prepared.warnings = [
              ...(prepared.warnings || []),
              `Parrain ${resolution.label} sera lié après import (présent dans le fichier)`,
            ];
          } else if (resolution.swapped) {
            prepared.warnings = [
              ...(prepared.warnings || []),
              `Parrain trouvé (vérifiez nom/prénom parrain inversés dans Excel)`,
            ];
          }
        }
      }

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
    
    // 🔥 STRUCTURE EN 2 PASSES :
    // 1. Créer les contacts QUI N'EXISTENT PAS DÉJÀ (sans parrain_id)
    // 2. Lier les parrains après que tous les contacts existent

    // Charger tous les contacts existants AVANT l'import
    const existingContacts = await getAllContacts();
    
    const contactsMap = buildContactIdMap(
      existingContacts.filter((c): c is typeof c & { id: number } => !!c.id)
    );

    // === PASSE 1 : Créer les contacts qui n'existent pas ===
    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      
      try {
        const nom = (row.data.nom || "").trim();
        const prenom = (row.data.prenom || "").trim();
        const contactKey = contactNameKey(nom, prenom);
        
        // 🔥 VÉRIFIER SI LE CONTACT EXISTE DÉJÀ
        if (contactsMap.has(contactKey)) {
          // Contact existe déjà (probablement un CLIENT) → ne pas créer de doublon
          const existingId = contactsMap.get(contactKey)!;
          (row as any)._createdId = existingId;
          (row as any)._alreadyExists = true;
          
          updatedRows[i] = { 
            ...row, 
            status: "success",
            message: `✓ Déjà existant (ID: ${existingId})`
          };
          setImportRows([...updatedRows]);
          continue; // Passer au suivant
        }
        
        // 🔥 Mapper la catégorie FILLEUL depuis l'Excel (indépendante de la catégorie client)
        let filleulCategorie: string;
        const catStr = String(row.data.categorie || "").trim().toUpperCase();
        
        switch (catStr) {
          case "FILLEUL":
          case "FILLEUL ACTIF":
            filleulCategorie = "FILLEUL";
            break;
          case "PROSPECT":
          case "PROSPECT FILLEUL":
            filleulCategorie = "PROSPECT_FILLEUL";
            break;
          case "SUSPECT":
          case "SUSPECT FILLEUL":
            filleulCategorie = "SUSPECT_FILLEUL";
            break;
          case "DESINSCRIT":
          case "DÉSINSCRIT":
          case "FILLEUL DESINSCRIT":
          case "FILLEUL DÉSINSCRIT":
            filleulCategorie = "FILLEUL_DESINSCRIT";
            break;
          default:
            filleulCategorie = "SUSPECT_FILLEUL"; // Par défaut
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

        // 🔥 Créer le contact (il n'existe pas encore)
        // categorie = "AUCUN" → PAS un client, n'apparaît PAS dans l'onglet CLIENTS
        // filleul_categorie = statut dans le réseau filleul
        const newContact: NewContact = {
          nom: nom,
          prenom: prenom,
          email: row.data.email ? String(row.data.email).trim() : undefined,
          telephone: row.data.telephone ? String(row.data.telephone).trim() : undefined,
          date_naissance: dateNaissance,
          categorie: "AUCUN", // 🔥 PAS un client → n'apparaît pas dans CLIENTS
          filleul_categorie: filleulCategorie, // 🔥 Catégorie FILLEUL indépendante
          // parrain_id: undefined - sera lié en passe 2
          // 🔥 date_dernier_contact_filleul = date de suivi FILLEUL (indépendant de client)
          date_dernier_contact_filleul: dateDernierContact,
          statut_suivi: "ACTIF",
          notes: notes,
        };

        const createdContact = await createContact(newContact);
        
        // Stocker dans la map pour éviter les doublons dans le même import
        contactsMap.set(contactKey, createdContact.id!);
        
        // Stocker les infos pour la passe 2
        (row as any)._createdId = createdContact.id;
        
        updatedRows[i] = { 
          ...row, 
          status: "success",
          message: "Créé (liaison parrain en cours...)"
        };
      } catch (error) {
        updatedRows[i] = { ...row, status: "error", message: String(error) };
      }

      setImportRows([...updatedRows]);
    }

    // === PASSE 2 : Lier les parrains ET mettre à jour filleul_categorie ===
    // 🔥 FIX: Traiter TOUS les contacts, pas seulement ceux avec parrain
    // Les Prospects et Suspects n'ont pas de parrain mais doivent avoir leur filleul_categorie mis à jour
    const allContacts = await getAllContacts();
    
    // 🔥 Créer une map des catégories ORIGINALES pour les protéger
    const originalCategories = new Map<number, string>();
    existingContacts.forEach(c => {
      if (c.id) originalCategories.set(c.id, c.categorie);
    });
    
    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      
      if (row.status !== "success") continue; // Skip les erreurs
      
      const contactId = (row as any)._createdId;
      const alreadyExists = (row as any)._alreadyExists;
      if (!contactId) continue;
      
      const contact = allContacts.find(c => c.id === contactId);
      if (!contact) continue;
      
      // 🔥 PROTECTION CRITIQUE : Si le contact existait déjà, GARDER sa catégorie originale
      const categorieToUse = alreadyExists && originalCategories.has(contactId)
        ? originalCategories.get(contactId)!
        : contact.categorie;
      
      // 🔥 Mapper la catégorie FILLEUL depuis l'Excel pour ce contact
      const catStr = String(row.data.categorie || "").trim().toUpperCase();
      let filleulCategorieForContact: string;
      switch (catStr) {
        case "FILLEUL":
        case "FILLEUL ACTIF":
          filleulCategorieForContact = "FILLEUL";
          break;
        case "PROSPECT":
        case "PROSPECT FILLEUL":
          filleulCategorieForContact = "PROSPECT_FILLEUL";
          break;
        case "SUSPECT":
        case "SUSPECT FILLEUL":
          filleulCategorieForContact = "SUSPECT_FILLEUL";
          break;
        case "DESINSCRIT":
        case "DÉSINSCRIT":
        case "FILLEUL DESINSCRIT":
        case "FILLEUL DÉSINSCRIT":
          filleulCategorieForContact = "FILLEUL_DESINSCRIT";
          break;
        default:
          filleulCategorieForContact = "SUSPECT_FILLEUL";
      }
      
      // 🔥 Parser la date de dernier suivi FILLEUL depuis l'Excel
      let dateDernierContactFilleul: string | undefined;
      if (row.data.date_dernier_suivi) {
        const dateStr = String(row.data.date_dernier_suivi).trim();
        const excelDate = parseFloat(dateStr);
        
        if (!isNaN(excelDate) && excelDate > 1) {
          const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
          if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1950) {
            dateDernierContactFilleul = jsDate.toISOString();
          }
        }
      }
      
      // Chercher le parrain si nom/prénom fournis
      let parrainId: number | undefined = contact.parrain_id;
      let parrainInfo = "";
      
      if (row.data.nom_parrain && row.data.prenom_parrain) {
        const lookup = lookupParrainId(
          String(row.data.nom_parrain),
          String(row.data.prenom_parrain),
          contactsMap,
          allContacts.filter((c): c is typeof c & { id: number } => !!c.id)
        );
        if (lookup.id) {
          parrainId = lookup.id;
          const parrain = allContacts.find((c) => c.id === lookup.id);
          const label = parrain
            ? `${parrain.prenom} ${parrain.nom}`
            : `${row.data.prenom_parrain} ${row.data.nom_parrain}`;
          parrainInfo = ` | Parrain: ${label}${lookup.swapped ? " (colonnes inversées ?)" : ""}`;
        } else {
          parrainInfo = ` | ⚠️ Parrain non trouvé: ${row.data.prenom_parrain} ${row.data.nom_parrain}`;
        }
      }
      
      try {
        // 🔥 Toujours mettre à jour filleul_categorie (avec ou sans parrain)
        await updateContact(contactId, {
          ...contact,
          categorie: categorieToUse, // 🔥 Garder la catégorie CLIENT originale
          filleul_categorie: filleulCategorieForContact, // 🔥 Ajouter la catégorie filleul
          parrain_id: parrainId,
          date_naissance: contact.date_naissance 
            ? new Date(contact.date_naissance * 1000).toISOString() 
            : undefined,
          // 🔥 Garder la date de suivi CLIENT intacte
          date_dernier_contact: contact.date_dernier_contact 
            ? new Date(contact.date_dernier_contact * 1000).toISOString() 
            : undefined,
          date_prochain_suivi: contact.date_prochain_suivi 
            ? new Date(contact.date_prochain_suivi * 1000).toISOString() 
            : undefined,
          // 🔥 Mettre à jour la date de suivi FILLEUL (indépendante)
          date_dernier_contact_filleul: dateDernierContactFilleul || (
            contact.date_dernier_contact_filleul 
              ? new Date(contact.date_dernier_contact_filleul * 1000).toISOString() 
              : undefined
          ),
          date_prochain_suivi_filleul: contact.date_prochain_suivi_filleul 
            ? new Date(contact.date_prochain_suivi_filleul * 1000).toISOString() 
            : undefined,
        });
        
        const prefix = alreadyExists ? "✓ Existant" : "✓ Créé";
        const categorieLabel = filleulCategorieForContact === "FILLEUL" ? "Filleul" 
          : filleulCategorieForContact === "PROSPECT_FILLEUL" ? "Prospect"
          : filleulCategorieForContact === "SUSPECT_FILLEUL" ? "Suspect"
          : "Désinscrit";
        
        updatedRows[i] = { 
          ...row, 
          status: parrainInfo.includes("non trouvé") ? "warning" : "success",
          message: `${prefix} (${categorieLabel})${parrainInfo}`
        };
      } catch (updateError) {
        updatedRows[i] = { 
          ...row, 
          status: "warning",
          message: `Erreur mise à jour: ${updateError}`
        };
      }
      
      setImportRows([...updatedRows]);
    }

    // === PASSE 3 : Upgrader les parrains en FILLEUL actif ===
    // Un parrain est forcément un filleul actif (il parraine quelqu'un)
    // 🔥 On met à jour filleul_categorie, PAS categorie (qui reste indépendante)
    try {
      const refreshedContacts = await getAllContacts();
      
      // Trouver tous les contacts qui sont parrains (ont des filleuls)
      const parrainIds = new Set<number>();
      refreshedContacts.forEach(contact => {
        if (contact.parrain_id) {
          parrainIds.add(contact.parrain_id);
        }
      });
      
      // Upgrader filleul_categorie vers FILLEUL pour les parrains
      for (const parrainId of parrainIds) {
        const parrain = refreshedContacts.find(c => c.id === parrainId);
        if (parrain) {
          // Si le parrain n'a pas de filleul_categorie OU est PROSPECT/SUSPECT
          // → Upgrader vers FILLEUL actif
          const currentFilleulCat = parrain.filleul_categorie;
          if (!currentFilleulCat || 
              currentFilleulCat === "PROSPECT_FILLEUL" || 
              currentFilleulCat === "SUSPECT_FILLEUL") {
            await updateContact(parrainId, {
              ...parrain,
              // 🔥 NE PAS toucher à categorie - elle reste indépendante
              filleul_categorie: "FILLEUL", // Upgrade vers FILLEUL actif
              date_naissance: parrain.date_naissance 
                ? new Date(parrain.date_naissance * 1000).toISOString() 
                : undefined,
              // 🔥 Garder les dates CLIENT intactes
              date_dernier_contact: parrain.date_dernier_contact 
                ? new Date(parrain.date_dernier_contact * 1000).toISOString() 
                : undefined,
              date_prochain_suivi: parrain.date_prochain_suivi 
                ? new Date(parrain.date_prochain_suivi * 1000).toISOString() 
                : undefined,
              // 🔥 Garder les dates FILLEUL intactes
              date_dernier_contact_filleul: parrain.date_dernier_contact_filleul 
                ? new Date(parrain.date_dernier_contact_filleul * 1000).toISOString() 
                : undefined,
              date_prochain_suivi_filleul: parrain.date_prochain_suivi_filleul 
                ? new Date(parrain.date_prochain_suivi_filleul * 1000).toISOString() 
                : undefined,
            });
          }
          // Si FILLEUL ou FILLEUL_DESINSCRIT → on ne change rien
        }
      }
    } catch (upgradeError) {
      console.error("Erreur upgrade parrains:", upgradeError);
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
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
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
                {(() => {
                  const withParrain = importRows.filter((r) => r.data.nom_parrain);
                  const found = withParrain.filter((r) => r.parrainPreview?.status === "found").length;
                  const inFile = withParrain.filter((r) => r.parrainPreview?.status === "in_file").length;
                  const missing = withParrain.filter((r) => r.parrainPreview?.status === "missing").length;
                  if (withParrain.length === 0) return null;
                  return (
                    <p className="text-sm text-muted-foreground">
                      Parrains : {found} dans le CRM · {inFile} dans le fichier ·{" "}
                      {missing > 0 ? (
                        <span className="text-orange-600">{missing} introuvable{missing > 1 ? "s" : ""}</span>
                      ) : (
                        "0 introuvable"
                      )}
                    </p>
                  );
                })()}
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
                        {!row.data.nom_parrain && !row.data.prenom_parrain ? (
                          <span className="text-gray-400">-</span>
                        ) : row.parrainPreview?.status === "found" ? (
                          <span className="text-green-600" title={row.parrainPreview.label}>
                            ✓ {row.parrainPreview.label}
                            {row.parrainPreview.swapped ? " ⚠️" : ""}
                          </span>
                        ) : row.parrainPreview?.status === "in_file" ? (
                          <span className="text-blue-600" title="Sera lié à l'import">
                            ○ {row.parrainPreview.label} (fichier)
                          </span>
                        ) : (
                          <span
                            className="text-orange-600"
                            title="Absent du CRM et du fichier importé"
                          >
                            ⚠️ {row.parrainPreview?.label || "Non trouvé"}
                          </span>
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
