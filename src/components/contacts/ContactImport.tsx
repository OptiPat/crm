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
import { createContact, getAllContacts, type NewContact, type Contact } from "@/lib/api/tauri-contacts";
import { Badge } from "@/components/ui/badge";
import { invoke } from "@tauri-apps/api/core";

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
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "merge" | "consolidate">("consolidate");
  const [error, setError] = useState<string | null>(null);

  const fieldOptions = [
    { value: "SKIP", label: "Ne pas importer" },
    { value: "nom", label: "Nom" },
    { value: "prenom", label: "Prénom" },
    { value: "email", label: "Email" },
    { value: "telephone", label: "Téléphone" },
    { value: "adresse", label: "Adresse" },
    { value: "code_postal", label: "Code postal" },
    { value: "ville", label: "Ville" },
    { value: "profession", label: "Profession" },
    { value: "categorie", label: "Catégorie" },
    { value: "source_lead", label: "Source (Lead)" },
    { value: "produit", label: "Produit (→ Notes)" },
    { value: "partenaire", label: "Partenaire (→ Notes)" },
    { value: "profil_risque_sri", label: "Profil investisseur / Risque" },
    { value: "date_souscription", label: "Date de souscription (→ Notes)" },
    { value: "montant", label: "Montant souscrit (→ Notes)" },
    { value: "montant_vp", label: "Montant VP (→ Notes, si SCPI/AV/PER)" },
    { value: "mode_detention", label: "Mode de détention SCPI (→ Notes)" },
    { value: "reinvestissement", label: "Réinvestissement dividendes (→ Notes, si SCPI)" },
    { value: "dernier_rdv", label: "Dernier RDV (→ Notes)" },
    { value: "prospect_filleul", label: "Prospect Filleul (OUI/NON)" },
    { value: "commentaires", label: "Commentaires / Notes" },
  ];

  // Détection intelligente des colonnes
  const detectColumnMapping = (cols: string[]) => {
    const detectedMapping: Record<string, string> = {};
    
    console.log("🔍 Colonnes à analyser pour le mapping:", cols);
    
    cols.forEach(col => {
      const colLower = col.toLowerCase().trim();
      
      // Debug pour "Dernier RDV"
      if (colLower.includes("dernier") || colLower.includes("rdv")) {
        console.log(`🔍 Analyse colonne "${col}":`, {
          original: col,
          colLower: colLower,
          includesRdv: colLower.includes("rdv"),
          includesDernier: colLower.includes("dernier"),
          strictMatch: colLower === "dernier rdv",
        });
      }
      
      if (colLower.includes("nom") && !colLower.includes("prenom") && !colLower.includes("prénom")) {
        detectedMapping[col] = "nom";
      } else if (colLower.includes("prenom") || colLower.includes("prénom")) {
        detectedMapping[col] = "prenom";
      } else if (
        colLower.includes("mail") || 
        colLower.includes("email") || 
        colLower.includes("e-mail") ||
        colLower === "mail" ||
        colLower === "email" ||
        colLower === "e-mail" ||
        colLower === "courriel"
      ) {
        // Ignorer les colonnes d'email secondaires
        if (
          !colLower.includes("suite") && 
          !colLower.includes("signature") &&
          !colLower.includes("scpi") &&
          !colLower.includes("revenus") &&
          !colLower.includes("secondaire")
        ) {
          detectedMapping[col] = "email";
        }
      } else if (
        colLower.includes("tel") || 
        colLower.includes("phone") || 
        colLower.includes("mobile") || 
        colLower.includes("téléphone") ||
        colLower.includes("portable") ||
        colLower.includes("gsm") ||
        colLower === "tel" ||
        colLower === "tel." ||
        colLower === "téléphone" ||
        colLower === "telephone"
      ) {
        detectedMapping[col] = "telephone";
      } else if (colLower.includes("adresse") || colLower.includes("address") || colLower.includes("rue")) {
        detectedMapping[col] = "adresse";
      } else if (colLower.includes("code") && (colLower.includes("postal") || colLower.includes("zip"))) {
        detectedMapping[col] = "code_postal";
      } else if (colLower.includes("ville") || colLower.includes("city")) {
        detectedMapping[col] = "ville";
      } else if (colLower.includes("profession") || colLower.includes("metier") || colLower.includes("métier")) {
        // Ne mapper "profil" vers profession que si ce n'est PAS "profil investisseur" ou "profil risque"
        if (!colLower.includes("investisseur") && !colLower.includes("risque")) {
          detectedMapping[col] = "profession";
        }
      } else if (colLower.includes("categorie") || colLower.includes("catégorie") || colLower.includes("type")) {
        detectedMapping[col] = "categorie";
      } else if (
        colLower.includes("commentaire") || 
        colLower.includes("note") || 
        colLower.includes("remarque") ||
        col === "Commentaire" // Exact match pour le singulier
      ) {
        detectedMapping[col] = "commentaires";
      } else if (colLower.includes("produit")) {
        detectedMapping[col] = "produit";
      } else if (colLower.includes("partenaire")) {
        detectedMapping[col] = "partenaire";
      } else if (colLower.includes("source")) {
        detectedMapping[col] = "source_lead";
      } else if (
        (colLower.includes("profil") && (colLower.includes("investisseur") || colLower.includes("risque"))) ||
        (colLower.includes("investisseur") && (colLower.includes("av") || colLower.includes("per")))
      ) {
        detectedMapping[col] = "profil_risque_sri";
      } else if (colLower.includes("date") && colLower.includes("souscription")) {
        detectedMapping[col] = "date_souscription";
      } else if (colLower.includes("montant") && colLower.includes("souscrit")) {
        detectedMapping[col] = "montant";
      } else if (
        (colLower.includes("dernier") && colLower.includes("rdv")) ||
        (colLower.includes("dernier") && colLower.includes("suivi")) ||
        colLower === "dernier rdv de suivi" ||
        colLower === "dernier rdv" ||
        colLower === "dernier suivi"
      ) {
        detectedMapping[col] = "dernier_rdv";
      } else if (
        colLower.includes("filleul") ||
        colLower === "prospect filleul" ||
        colLower === "prospects filleuls" ||
        colLower === "filleul"
      ) {
        detectedMapping[col] = "prospect_filleul";
      } else if (
        (colLower.includes("montant") && colLower.includes("vp")) ||
        col === "Montant VP" // Exact match
      ) {
        detectedMapping[col] = "montant_vp";
      } else if (
        colLower.includes("reinvest") || 
        (colLower.includes("dividende") && colLower.includes("reinv")) ||
        col === "Réinvestissement des dividendes" // Exact match
      ) {
        detectedMapping[col] = "reinvestissement";
      } else if (
        (colLower.includes("mode") && colLower.includes("detention")) ||
        (colLower.includes("mode") && colLower.includes("détention")) ||
        col === "Mode de détention SCPI" // Exact match
      ) {
        detectedMapping[col] = "mode_detention";
      }
    });
    
    console.log("✅ Mapping final détecté:", detectedMapping);
    console.log("📋 Nombre de colonnes mappées:", Object.keys(detectedMapping).length, "sur", cols.length);
    
    return detectedMapping;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      console.log("No file selected");
      return;
    }

    console.log("File selected:", selectedFile.name, selectedFile.size, "bytes");
    
    // Vérifier la taille du fichier (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      alert("Le fichier est trop volumineux (max 10MB)");
      return;
    }

    setFile(selectedFile);
    
    try {
      console.log("Reading file...");
      const data = await selectedFile.arrayBuffer();
      console.log("File read, parsing workbook...");
      
      const workbook = XLSX.read(data);
      console.log("Workbook parsed, sheets:", workbook.SheetNames);
      
      if (workbook.SheetNames.length === 0) {
        alert("Le fichier ne contient aucune feuille");
        return;
      }
      
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      console.log("Converting to JSON...");
      
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      console.log("JSON data:", jsonData.length, "rows");
      
      if (jsonData.length === 0) {
        alert("Le fichier est vide");
        return;
      }

      // Détecter TOUTES les colonnes en analysant toutes les lignes
      const allColumns = new Set<string>();
      jsonData.forEach((row: any) => {
        Object.keys(row).forEach(col => allColumns.add(col));
      });
      const cols = Array.from(allColumns);
      console.log("Columns detected (from all rows):", cols);
      
      setColumns(cols);
      setRows(jsonData);
      
      // Détection automatique du mapping
      const detectedMapping = detectColumnMapping(cols);
      console.log("Mapping detected:", detectedMapping);
      
      setMapping(detectedMapping);
      
      console.log("Moving to mapping step");
      setStep("mapping");
    } catch (error) {
      console.error("Error reading file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Erreur lors de la lecture du fichier: ${errorMessage}. Vérifiez que le fichier est bien un Excel (.xlsx) ou CSV valide.`);
      // Reset en cas d'erreur
      setFile(null);
      setStep("upload");
    }
  };

  const handleNextToPreview = async () => {
    setError(null); // Reset error
    
    // Vérifier que nom et prénom sont mappés
    const hasNom = Object.values(mapping).includes("nom");
    const hasPrenom = Object.values(mapping).includes("prenom");
    
    if (!hasNom || !hasPrenom) {
      setError("Le nom et le prénom sont obligatoires pour l'import");
      return;
    }

    // Charger les contacts existants pour détecter les doublons
    try {
      console.log("Loading existing contacts for duplicate detection...");
      const existingContacts = await getAllContacts();
      console.log("Existing contacts loaded:", existingContacts.length);
      
      const preparedRows: ImportRow[] = rows.map((row, idx) => {
        const contactData: Record<string, any> = {};
        
        // Debug pour voir les clés disponibles dans row
        if (idx === 0) {
          console.log("🔍 Toutes les clés disponibles dans row[0]:", Object.keys(row));
          console.log("🔍 Valeur de row['Dernier RDV']:", row["Dernier RDV"]);
          console.log("🔍 Mapping à appliquer:", mapping);
        }
        
        // Mapper les colonnes
        Object.entries(mapping).forEach(([sourceCol, targetField]) => {
          if (targetField && targetField !== "SKIP") {
            // Utiliser la valeur de la colonne, même si undefined (pour permettre le traitement)
            // row[sourceCol] peut être undefined si la cellule est vide dans Excel
            contactData[targetField] = row[sourceCol] !== undefined ? row[sourceCol] : null;
          }
        });

        // Détecter les doublons par Nom+Prénom OU Email OU Téléphone
        const duplicateContact = existingContacts.find(contact => {
          // Doublon par Nom + Prénom (le plus important pour ce cas d'usage)
          if (contactData.nom && contactData.prenom) {
            const sameName = contact.nom.toLowerCase() === contactData.nom.toLowerCase() &&
                           contact.prenom.toLowerCase() === contactData.prenom.toLowerCase();
            if (sameName) return true;
          }
          // Doublon par Email
          if (contactData.email && contact.email === contactData.email) return true;
          // Doublon par Téléphone
          if (contactData.telephone && contact.telephone === contactData.telephone) return true;
          return false;
        });
        
        const isDuplicate = !!duplicateContact;

        return {
          data: { ...contactData, _duplicateContactId: duplicateContact?.id },
          status: isDuplicate ? "duplicate" : "pending",
          message: isDuplicate ? `Doublon détecté (${duplicateContact?.prenom} ${duplicateContact?.nom})` : undefined,
        };
      });

      setImportRows(preparedRows);
      console.log("Preview ready with", preparedRows.length, "rows");
      setStep("preview");
    } catch (error) {
      console.error("Error detecting duplicates:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Erreur lors de la détection des doublons: ${errorMessage}`);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setStep("importing");

    const updatedRows = [...importRows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      
      // Gérer les doublons selon l'action choisie
      if (row.status === "duplicate") {
        if (duplicateAction === "skip") {
          continue; // Ignorer complètement
        } else if (duplicateAction === "consolidate") {
          // Consolider : ajouter les nouvelles infos aux notes du contact existant
          try {
            const existingContactId = row.data._duplicateContactId;
            if (existingContactId) {
              // Récupérer le contact existant
              const existingContact = await invoke<Contact>("get_contact_by_id", { id: existingContactId });
              
              // Construire les nouvelles infos à ajouter
              let newInfos: string[] = [];
              
              if (row.data.produit) {
                newInfos.push(`Produit: ${row.data.produit}`);
              }
              
              if (row.data.partenaire) {
                newInfos.push(`Partenaire: ${row.data.partenaire}`);
              }
              
              if (row.data.date_souscription) {
                const excelDate = parseFloat(String(row.data.date_souscription));
                if (!isNaN(excelDate)) {
                  const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
                  newInfos.push(`Date: ${jsDate.toLocaleDateString('fr-FR')}`);
                }
              }
              
              if (row.data.montant) {
                newInfos.push(`Montant: ${row.data.montant}€`);
              }
              
              // Ajouter aux notes existantes avec séparateur
              const separator = "\n---\n";
              const updatedNotes = existingContact.notes 
                ? `${existingContact.notes}${separator}${newInfos.join('\n')}`
                : newInfos.join('\n');
              
              // Recalculer la catégorie selon la logique métier
              let updatedCategorie = existingContact.categorie;
              
              // Si on ajoute un produit, le contact devient CLIENT
              if (row.data.produit && existingContact.categorie !== "CLIENT") {
                const produitStr = String(row.data.produit).trim().toUpperCase();
                if (
                  produitStr && 
                  produitStr !== "NON" && 
                  produitStr !== "N/A" && 
                  produitStr !== "NA" &&
                  produitStr !== "-" &&
                  produitStr !== "AUCUN"
                ) {
                  updatedCategorie = "CLIENT"; // 🎯 Promotion automatique en CLIENT
                }
              }
              // Si le contact est SUSPECT mais qu'on ajoute une date de RDV, il devient PROSPECT
              else if (row.data.dernier_rdv && 
                       existingContact.categorie.includes("SUSPECT") &&
                       !existingContact.categorie.includes("PROSPECT")) {
                const dernierRdvStr = String(row.data.dernier_rdv);
                if (dernierRdvStr && dernierRdvStr !== "-") {
                  updatedCategorie = existingContact.categorie.replace("SUSPECT", "PROSPECT"); // SUSPECT_CLIENT → PROSPECT_CLIENT
                }
              }
              
              // Mettre à jour le contact
              await invoke("update_contact", { 
                id: existingContactId, 
                contact: { 
                  ...existingContact,
                  notes: updatedNotes,
                  categorie: updatedCategorie
                } 
              });
              
              const wasPromoted = updatedCategorie !== existingContact.categorie;
              let message = "Consolidé avec le contact existant";
              if (wasPromoted) {
                if (updatedCategorie === "CLIENT") {
                  message = "Consolidé et promu en CLIENT (produit souscrit)";
                } else if (updatedCategorie.includes("PROSPECT")) {
                  message = "Consolidé et promu en PROSPECT (contacté)";
                }
              }
              
              updatedRows[i] = { ...row, status: "success", message };
            }
          } catch (error) {
            updatedRows[i] = { ...row, status: "error", message: `Erreur consolidation: ${String(error)}` };
          }
          setImportRows([...updatedRows]);
          continue; // Passer au suivant
        }
        // Si "merge", on continue normalement pour créer un doublon
      }

      try {
        // Nettoyer et convertir les données
        const cleanString = (val: any) => {
          if (!val) return null;
          const str = String(val).trim().toUpperCase();
          // Ignorer les valeurs vides ou invalides
          if (
            str === "" || 
            str === "NON" || 
            str === "N/A" || 
            str === "N.A" ||
            str === "NA" ||
            str === "-" ||
            str === "/" ||
            str === "VIDE" ||
            str === "AUCUN" ||
            str === "NULL" ||
            str === "UNDEFINED"
          ) {
            return null;
          }
          // Retourner la valeur originale (avec la casse d'origine)
          return String(val).trim();
        };

        // Debug: log des premières lignes
        if (i < 3) {
          console.log(`🔍 Contact ${i + 1} AVANT nettoyage:`, {
            email: row.data.email,
            telephone: row.data.telephone,
            profession: row.data.profession,
          });
        }

        // Convertir profil_risque_sri en nombre si présent
        let profilRisque = null;
        if (row.data.profil_risque_sri) {
          const parsed = parseInt(String(row.data.profil_risque_sri));
          if (!isNaN(parsed)) {
            profilRisque = parsed;
          }
        }

        // Parser la date du dernier RDV de suivi
        let dateDernierContact: Date | null = null;
        let dernierRdvFormatted: string | null = null;
        
        // Debug pour voir ce qui est lu depuis l'Excel (seulement si valeur présente)
        if (row.data.dernier_rdv && row.data.dernier_rdv !== "-") {
          const dernierRdvStr = String(row.data.dernier_rdv).trim();
          
          // Debug SANS limite pour voir TOUS les contacts avec date
          console.log(`📅 Date parsing pour contact ${i + 1} (${row.data.prenom} ${row.data.nom}):`, {
            valeurBrute: row.data.dernier_rdv,
            typeOf: typeof row.data.dernier_rdv,
            valeurString: dernierRdvStr,
          });
          
          // Essayer de parser comme date Excel (nombre)
          const excelDate = parseFloat(dernierRdvStr);
          if (!isNaN(excelDate) && excelDate > 1) {
            // Conversion date Excel vers objet Date
            // Note: Excel compte depuis le 01/01/1900, donc valeur minimale réaliste > 1
            const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
            
            // Vérifier que la date est valide et raisonnable (après 1950)
            if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1950) {
              dateDernierContact = jsDate;
              dernierRdvFormatted = jsDate.toLocaleDateString('fr-FR');
              
              console.log(`✅ Date Excel parsée (contact ${i + 1}):`, {
                excelDate,
                jsDate: jsDate.toISOString(),
                formatted: dernierRdvFormatted,
              });
            } else {
              console.log(`❌ Date Excel invalide (contact ${i + 1}):`, jsDate);
            }
          } else {
            // Essayer de parser comme date texte (format FR ou ISO)
            const datePatterns = [
              // Format DD/MM/YYYY
              /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
              // Format DD-MM-YYYY
              /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
              // Format YYYY-MM-DD (ISO)
              /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
            ];
            
            for (const pattern of datePatterns) {
              const match = dernierRdvStr.match(pattern);
              if (match) {
                let day, month, year;
                
                // Déterminer l'ordre selon le pattern
                if (pattern.source.startsWith('^(\\d{4})')) {
                  // Format YYYY-MM-DD
                  [, year, month, day] = match;
                } else {
                  // Format DD/MM/YYYY ou DD-MM-YYYY
                  [, day, month, year] = match;
                }
                
                const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                
                // Vérifier que la date est valide et raisonnable
                if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1950) {
                  dateDernierContact = parsedDate;
                  dernierRdvFormatted = parsedDate.toLocaleDateString('fr-FR');
                  
                  console.log(`✅ Date texte parsée (contact ${i + 1}):`, {
                    pattern: pattern.source,
                    parsedDate: parsedDate.toISOString(),
                    formatted: dernierRdvFormatted,
                  });
                  break;
                }
              }
            }
            
            // Si pas de match avec les patterns, essayer Date.parse
            if (!dateDernierContact) {
              const parsedDate = new Date(dernierRdvStr);
              if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1950) {
                dateDernierContact = parsedDate;
                dernierRdvFormatted = parsedDate.toLocaleDateString('fr-FR');
                
                console.log(`✅ Date.parse réussie (contact ${i + 1}):`, {
                  parsedDate: parsedDate.toISOString(),
                  formatted: dernierRdvFormatted,
                });
              } else {
                // Si échec de parsing, garder la valeur brute pour les notes
                dernierRdvFormatted = dernierRdvStr;
                
                console.log(`❌ Échec parsing date (contact ${i + 1}), valeur brute conservée:`, dernierRdvStr);
              }
            }
          }
        }

        // Construire les notes avec toutes les infos supplémentaires
        let notesArray: string[] = [];
        
        // Déterminer le type de produit
        const produitStr = row.data.produit ? String(row.data.produit).toUpperCase() : '';
        const isSCPI = produitStr.includes('SCPI');
        const isAV = produitStr.includes('AV') || produitStr.includes('ASSURANCE') || produitStr.includes('VIE');
        const isPER = produitStr.includes('PER');
        const isFinancialProduct = isSCPI || isAV || isPER;
        
        // Produit et Partenaire en premier
        if (row.data.produit) {
          notesArray.push(`Produit: ${row.data.produit}`);
        }
        
        if (row.data.partenaire) {
          notesArray.push(`Partenaire: ${row.data.partenaire}`);
        }
        
        if (row.data.date_souscription) {
          // Convertir la date Excel en date lisible
          const excelDate = parseFloat(String(row.data.date_souscription));
          if (!isNaN(excelDate)) {
            const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
            notesArray.push(`Date de souscription: ${jsDate.toLocaleDateString('fr-FR')}`);
          } else {
            notesArray.push(`Date de souscription: ${row.data.date_souscription}`);
          }
        }
        
        if (row.data.montant) {
          notesArray.push(`Montant souscrit: ${row.data.montant}€`);
        }
        
        // Montant VP uniquement pour SCPI/AV/PER
        if (row.data.montant_vp && isFinancialProduct) {
          const montantVP = String(row.data.montant_vp).trim();
          if (montantVP && montantVP !== '-' && montantVP !== 'NON') {
            notesArray.push(`Montant VP: ${montantVP}${montantVP.includes('€') ? '' : '€'}`);
          }
        }
        
        // Mode de détention uniquement pour SCPI
        if (row.data.mode_detention && isSCPI) {
          const mode = String(row.data.mode_detention).trim();
          if (mode && mode !== '-' && mode !== 'NON') {
            notesArray.push(`Mode de détention: ${mode}`);
          }
        }
        
        // Réinvestissement uniquement pour SCPI
        if (row.data.reinvestissement && isSCPI) {
          const reinvest = String(row.data.reinvestissement).trim();
          if (reinvest && reinvest !== '-' && reinvest !== 'NON') {
            notesArray.push(`Réinvestissement dividendes: ${reinvest}`);
          }
        }
        
        // Ajouter le dernier RDV aux notes (si parsé avec succès)
        if (dernierRdvFormatted) {
          notesArray.push(`Dernier RDV de suivi: ${dernierRdvFormatted}`);
        }
        
        if (row.data.commentaires) {
          notesArray.push(String(row.data.commentaires));
        }
        
        const finalNotes = notesArray.length > 0 ? notesArray.join('\n') : null;

        // Déterminer automatiquement la catégorie selon la logique métier :
        // 1. CLIENT = A souscrit un produit
        // 2. PROSPECT = Déjà contacté (date RDV) mais pas encore investi
        // 3. SUSPECT = Pas encore contacté
        // + Variante FILLEUL si colonne "Prospects Filleuls" = "OUI"
        
        const hasProduit = row.data.produit ? (() => {
          const produitStr = String(row.data.produit).trim().toUpperCase();
          return produitStr && 
            produitStr !== "NON" && 
            produitStr !== "N/A" && 
            produitStr !== "N.A" &&
            produitStr !== "NA" &&
            produitStr !== "-" &&
            produitStr !== "/" &&
            produitStr !== "AUCUN" &&
            produitStr !== "VIDE";
        })() : false;
        
        // Vérifier si c'est un filleul
        const isFilleul = row.data.prospect_filleul ? (() => {
          const filleulStr = String(row.data.prospect_filleul).trim().toUpperCase();
          return filleulStr === "OUI" || filleulStr === "YES" || filleulStr === "O" || filleulStr === "Y";
        })() : false;
        
        let categorie = "SUSPECT_CLIENT";
        
        if (hasProduit) {
          // 🎯 A souscrit un produit = CLIENT (jamais filleul car déjà client)
          categorie = "CLIENT";
        } else if (dateDernierContact) {
          // 📞 Déjà contacté mais pas encore investi
          categorie = isFilleul ? "PROSPECT_FILLEUL" : "PROSPECT_CLIENT";
        } else {
          // 🆕 Jamais contacté
          categorie = isFilleul ? "SUSPECT_FILLEUL" : "SUSPECT_CLIENT";
        }

        // Convertir la date en string ISO pour Rust
        const dateDernierContactISO = dateDernierContact 
          ? dateDernierContact.toISOString() 
          : undefined;

        const newContact: NewContact = {
          nom: row.data.nom || "",
          prenom: row.data.prenom || "",
          email: cleanString(row.data.email),
          telephone: cleanString(row.data.telephone),
          adresse: cleanString(row.data.adresse),
          code_postal: cleanString(row.data.code_postal),
          ville: cleanString(row.data.ville),
          profession: cleanString(row.data.profession),
          source_lead: cleanString(row.data.source_lead),
          profil_risque_sri: profilRisque,
          date_dernier_contact: dateDernierContactISO,
          categorie: categorie,
          statut_suivi: "ACTIF",
          notes: finalNotes,
        };
        
        // Debug pour voir ce qui est envoyé
        if (dateDernierContact) {
          console.log(`🔍 Envoi date ISO pour ${row.data.prenom} ${row.data.nom}:`, {
            dateObject: dateDernierContact,
            dateISO: dateDernierContactISO,
            timestamp: Math.floor(dateDernierContact.getTime() / 1000),
          });
        }

        // Debug: log après nettoyage
        if (i < 3) {
          console.log(`✅ Contact ${i + 1} APRÈS nettoyage:`, {
            email: newContact.email,
            telephone: newContact.telephone,
            profession: newContact.profession,
          });
        }

        await createContact(newContact);
        updatedRows[i] = { ...row, status: "success", message: "Importé avec succès" };
      } catch (error) {
        updatedRows[i] = { ...row, status: "error", message: String(error) };
      }

      setImportRows([...updatedRows]);
    }

    setImporting(false);
    
    // Attendre 2 secondes avant de fermer
    setTimeout(() => {
      try {
        console.log("Import terminé, fermeture de la modale...");
        handleClose();
        
        // Recharger les contacts APRÈS la fermeture de la modale
        setTimeout(async () => {
          try {
            console.log("Rechargement des contacts...");
            await onSuccess();
            console.log("Contacts rechargés avec succès");
          } catch (error) {
            console.error("Error reloading contacts:", error);
          }
        }, 100);
      } catch (error) {
        console.error("Error closing modal:", error);
      }
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
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('file-upload')?.click()}
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
                Associez chaque colonne à un champ du CRM.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-900 mb-2">
                <strong>💡 Catégorisation automatique intelligente :</strong>
              </p>
              <ul className="text-xs text-green-800 space-y-1 ml-4">
                <li>🎯 <strong>CLIENT</strong> = Produit souscrit</li>
                <li>📞 <strong>PROSPECT</strong> = Déjà contacté (date RDV) mais pas encore investi</li>
                <li>🆕 <strong>SUSPECT</strong> = Pas encore contacté</li>
                <li>👥 <strong>FILLEUL</strong> = Si colonne "Prospects Filleuls" = OUI → PROSPECT_FILLEUL ou SUSPECT_FILLEUL</li>
              </ul>
            </div>

            {/* DEBUG : Aperçu des données ET du mapping */}
            {rows.length > 0 && (
              <div className="space-y-3">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-yellow-900 mb-2">🔍 APERÇU DES DONNÉES (Première ligne) :</p>
                  <div className="text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
                    {Object.entries(rows[0]).map(([key, value]) => (
                      <div key={key} className="text-yellow-900">
                        <strong>{key}:</strong> {String(value)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Aperçu du mapping */}
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-900 mb-2">📋 MAPPING AUTOMATIQUE DÉTECTÉ :</p>
                  <div className="text-xs space-y-1">
                    {Object.entries(mapping).filter(([_, value]) => value && value !== "SKIP").map(([col, field]) => (
                      <div key={col} className="text-blue-900">
                        ✓ <strong>{col}</strong> → {fieldOptions.find(f => f.value === field)?.label}
                      </div>
                    ))}
                    {Object.entries(mapping).filter(([_, value]) => !value || value === "SKIP").length > 0 && (
                      <div className="mt-2 pt-2 border-t border-blue-300">
                        <p className="text-blue-700 font-semibold mb-1">⚠️ Colonnes ignorées :</p>
                        {Object.entries(mapping).filter(([_, value]) => !value || value === "SKIP").map(([col]) => (
                          <div key={col} className="text-blue-700 text-xs">
                            • {col}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {pendingCount} contact{pendingCount > 1 ? "s" : ""} prêt{pendingCount > 1 ? "s" : ""} à être importé{pendingCount > 1 ? "s" : ""}
                  </p>
                  {duplicateCount > 0 && (
                    <p className="text-sm text-orange-600">
                      {duplicateCount} doublon{duplicateCount > 1 ? "s" : ""} détecté{duplicateCount > 1 ? "s" : ""} (même nom/prénom)
                    </p>
                  )}
                  {/* Compteurs par catégorie */}
                  {importRows.length > 0 && (() => {
                    const clientCount = importRows.filter(r => {
                      const hasProduit = r.data.produit && (() => {
                        const produitStr = String(r.data.produit).trim().toUpperCase();
                        return produitStr && produitStr !== "NON" && produitStr !== "N/A" && produitStr !== "-";
                      })();
                      return hasProduit;
                    }).length;
                    
                    const prospectClientCount = importRows.filter(r => {
                      const hasProduit = r.data.produit && (() => {
                        const produitStr = String(r.data.produit).trim().toUpperCase();
                        return produitStr && produitStr !== "NON" && produitStr !== "N/A" && produitStr !== "-";
                      })();
                      const hasContact = r.data.dernier_rdv && r.data.dernier_rdv !== "-";
                      const isFilleul = r.data.prospect_filleul && String(r.data.prospect_filleul).trim().toUpperCase() === "OUI";
                      return !hasProduit && hasContact && !isFilleul;
                    }).length;
                    
                    const suspectClientCount = importRows.filter(r => {
                      const hasProduit = r.data.produit && (() => {
                        const produitStr = String(r.data.produit).trim().toUpperCase();
                        return produitStr && produitStr !== "NON" && produitStr !== "N/A" && produitStr !== "-";
                      })();
                      const hasContact = r.data.dernier_rdv && r.data.dernier_rdv !== "-";
                      const isFilleul = r.data.prospect_filleul && String(r.data.prospect_filleul).trim().toUpperCase() === "OUI";
                      return !hasProduit && !hasContact && !isFilleul;
                    }).length;
                    
                    const prospectFilleulCount = importRows.filter(r => {
                      const hasProduit = r.data.produit && (() => {
                        const produitStr = String(r.data.produit).trim().toUpperCase();
                        return produitStr && produitStr !== "NON" && produitStr !== "N/A" && produitStr !== "-";
                      })();
                      const hasContact = r.data.dernier_rdv && r.data.dernier_rdv !== "-";
                      const isFilleul = r.data.prospect_filleul && String(r.data.prospect_filleul).trim().toUpperCase() === "OUI";
                      return !hasProduit && hasContact && isFilleul;
                    }).length;
                    
                    const suspectFilleulCount = importRows.filter(r => {
                      const hasProduit = r.data.produit && (() => {
                        const produitStr = String(r.data.produit).trim().toUpperCase();
                        return produitStr && produitStr !== "NON" && produitStr !== "N/A" && produitStr !== "-";
                      })();
                      const hasContact = r.data.dernier_rdv && r.data.dernier_rdv !== "-";
                      const isFilleul = r.data.prospect_filleul && String(r.data.prospect_filleul).trim().toUpperCase() === "OUI";
                      return !hasProduit && !hasContact && isFilleul;
                    }).length;
                    
                    return (
                      <p className="text-xs text-muted-foreground">
                        {clientCount > 0 && <span className="mr-3">🎯 {clientCount} CLIENT{clientCount > 1 ? 'S' : ''}</span>}
                        {prospectClientCount > 0 && <span className="mr-3">📞 {prospectClientCount} PROSPECT CLIENT{prospectClientCount > 1 ? 'S' : ''}</span>}
                        {suspectClientCount > 0 && <span className="mr-3">🆕 {suspectClientCount} SUSPECT CLIENT{suspectClientCount > 1 ? 'S' : ''}</span>}
                        {prospectFilleulCount > 0 && <span className="mr-3">👥 {prospectFilleulCount} PROSPECT FILLEUL{prospectFilleulCount > 1 ? 'S' : ''}</span>}
                        {suspectFilleulCount > 0 && <span>🎁 {suspectFilleulCount} SUSPECT FILLEUL{suspectFilleulCount > 1 ? 'S' : ''}</span>}
                      </p>
                    );
                  })()}
                </div>

                {duplicateCount > 0 && (
                  <Select value={duplicateAction} onValueChange={(v: any) => setDuplicateAction(v)}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consolidate">✅ Consolider (recommandé)</SelectItem>
                      <SelectItem value="skip">Ignorer les doublons</SelectItem>
                      <SelectItem value="merge">Créer des doublons</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {duplicateCount > 0 && duplicateAction === "consolidate" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-900">
                    <strong>Mode Consolidation :</strong> Les informations des doublons (Produit, Partenaire, Date, Montant) seront ajoutées aux Notes du contact existant. Parfait pour des clients avec plusieurs souscriptions !
                  </p>
                </div>
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
                    <th className="p-2 text-left">Catégorie</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 50).map((row, idx) => {
                    // Déterminer la catégorie qui sera appliquée (même logique que l'import)
                    const hasProduit = row.data.produit && (() => {
                      const produitStr = String(row.data.produit).trim().toUpperCase();
                      return produitStr && 
                        produitStr !== "" &&
                        produitStr !== "NON" && 
                        produitStr !== "N/A" && 
                        produitStr !== "NA" &&
                        produitStr !== "-" &&
                        produitStr !== "AUCUN";
                    })();
                    
                    const hasContact = row.data.dernier_rdv && row.data.dernier_rdv !== "-";
                    
                    const isFilleul = row.data.prospect_filleul && (() => {
                      const filleulStr = String(row.data.prospect_filleul).trim().toUpperCase();
                      return filleulStr === "OUI" || filleulStr === "YES" || filleulStr === "O" || filleulStr === "Y";
                    })();
                    
                    let finalCategorie = "SUSPECT_CLIENT";
                    if (hasProduit) {
                      finalCategorie = "CLIENT";
                    } else if (hasContact) {
                      finalCategorie = isFilleul ? "PROSPECT_FILLEUL" : "PROSPECT_CLIENT";
                    } else {
                      finalCategorie = isFilleul ? "SUSPECT_FILLEUL" : "SUSPECT_CLIENT";
                    }
                    
                    return (
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
                        <td className="p-2">
                          <Badge 
                            variant="outline" 
                            className={
                              finalCategorie === "CLIENT" 
                                ? "bg-green-50 text-green-700 border-green-300" 
                                : finalCategorie === "PROSPECT_CLIENT"
                                ? "bg-purple-50 text-purple-700 border-purple-300"
                                : finalCategorie === "SUSPECT_CLIENT"
                                ? "bg-slate-50 text-slate-700 border-slate-300"
                                : finalCategorie === "PROSPECT_FILLEUL"
                                ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                                : finalCategorie === "SUSPECT_FILLEUL"
                                ? "bg-amber-50 text-amber-700 border-amber-300"
                                : "bg-gray-50 text-gray-600"
                            }
                          >
                            {finalCategorie.replace("_", " ")}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
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
                <Button 
                  onClick={async () => {
                    try {
                      handleClose();
                      await onSuccess();
                    } catch (error) {
                      console.error("Error closing import:", error);
                    }
                  }}
                >
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
