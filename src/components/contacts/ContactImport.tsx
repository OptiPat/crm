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
import { createContact, getAllContacts, updateContact, type NewContact, type Contact } from "@/lib/api/tauri-contacts";
import { createInvestissement, updateInvestissement, getAllInvestissements, type NewInvestissement, type Investissement } from "@/lib/api/tauri-investissements";
import { getAllPartenaires, createPartenaire, type Partenaire, type NewPartenaire } from "@/lib/api/tauri-partenaires";
import { createFoyer, getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import {
  analyzeCoupleContact,
  extractCompositeName,
  isContactCouple,
} from "@/lib/contacts/contact-import-couple";
import {
  findExistingFoyerByFamilleName,
  linkContactToFoyer,
} from "@/lib/foyers/foyer-utils";
// famille_id n'est plus utilisé - les familles sont groupées dynamiquement par nom
import { Badge } from "@/components/ui/badge";
import { invoke } from "@tauri-apps/api/core";
import { FoyerGroupingModal } from "@/components/foyers/FoyerGroupingModal";
import { toast } from "sonner";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import {
  contactNameKeyCanonical,
  findContactByNameKeyWithSwap,
} from "@/lib/contacts/name-match";
import { getPairIdentityConflictMessages } from "@/lib/contacts/duplicate-identity";
import {
  parseImportDate,
  parseImportDateFinPret,
  parseImportDateToDate,
} from "@/lib/contacts/parse-import-date";
import {
  beginImportTransaction,
  commitImportTransaction,
  rollbackImportTransaction,
} from "@/lib/api/tauri-import-transaction";
import {
  contactToUpdatePayload,
  resolveImportContactCategories,
} from "@/lib/contacts/contact-form-utils";

// ============================================
// FUZZY MATCHING POUR LES PARTENAIRES
// ============================================

// Normaliser une chaîne : lowercase, sans accents, sans espaces multiples
const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprimer les accents
    .replace(/[^a-z0-9]/g, " ")      // Remplacer les caractères spéciaux par des espaces
    .replace(/\s+/g, " ")            // Supprimer les espaces multiples
    .trim();
};

// 🔥 Helper: Prendre la date la plus récente entre deux dates (pour consolidation multi-lignes)
const getMostRecentDate = (
  newDateISO: string | undefined, 
  existingTimestamp: number | undefined
): string | undefined => {
  // Si aucune date, retourner undefined
  if (!newDateISO && !existingTimestamp) return undefined;
  
  // Si une seule date existe, la retourner
  if (!newDateISO && existingTimestamp) {
    return new Date(existingTimestamp * 1000).toISOString();
  }
  if (newDateISO && !existingTimestamp) {
    return newDateISO;
  }
  
  // Comparer les deux dates et retourner la plus récente
  const newDate = new Date(newDateISO!);
  const existingDate = new Date(existingTimestamp! * 1000);
  
  if (newDate > existingDate) {
    return newDateISO;
  } else {
    return existingDate.toISOString();
  }
};

// Alias connus pour les partenaires (variations courantes)
const PARTENAIRE_ALIASES: Record<string, string[]> = {
  "vie plus": ["vie+", "vie +", "vieplus"],
  "apicil": ["apcil", "apicill", "appicil"],
  "primonial": ["primoniale", "primmonial"],
  "praemia": ["praemie", "praémia", "premia"],
  "generali": ["generalli", "générali"],
  "suravenir": ["suravnir", "suravennir"],
  "swiss life": ["swisslife", "swiss-life", "suisse life"],
  "cardif": ["kardif", "carrdif"],
  "spirica": ["spiricca", "sprica"],
  "corum": ["corrum", "coorum"],
  "sofidy": ["sofiddy", "soffidy"],
  "perial": ["périal", "periall"],
  "la francaise": ["la française", "lafrancaise"],
  "epargne pierre": ["épargne pierre", "epargnepierre"],
  "primovie": ["primo vie", "primo-vie"],
  "ncap regions": ["n cap regions", "ncap régions", "n-cap regions"],
};

// Distance de Levenshtein (pour détecter les fautes de frappe)
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
};

// Trouver le partenaire le plus proche (fuzzy matching)
const findMatchingPartenaire = (searchName: string, partenaires: Partenaire[]): Partenaire | null => {
  const normalizedSearch = normalizeString(searchName);
  
  // 1. Correspondance exacte (après normalisation)
  for (const p of partenaires) {
    if (normalizeString(p.raison_sociale) === normalizedSearch) {
      return p;
    }
  }
  
  // 2. Vérifier les alias connus
  for (const [canonical, aliases] of Object.entries(PARTENAIRE_ALIASES)) {
    if (aliases.some(alias => normalizeString(alias) === normalizedSearch) || 
        normalizeString(canonical) === normalizedSearch) {
      for (const p of partenaires) {
        const normalizedP = normalizeString(p.raison_sociale);
        if (normalizedP === normalizeString(canonical) || 
            aliases.some(alias => normalizeString(alias) === normalizedP)) {
          return p;
        }
      }
    }
  }
  
  // 3. Correspondance partielle (contient)
  for (const p of partenaires) {
    const normalizedP = normalizeString(p.raison_sociale);
    if (normalizedP.includes(normalizedSearch) || normalizedSearch.includes(normalizedP)) {
      if (normalizedSearch.length >= 4 && normalizedP.length >= 4) {
        return p;
      }
    }
  }
  
  // 4. Distance de Levenshtein (fautes de frappe)
  let bestMatch: Partenaire | null = null;
  let bestDistance = Infinity;
  const maxDistance = Math.max(2, Math.floor(normalizedSearch.length * 0.3));
  
  for (const p of partenaires) {
    const normalizedP = normalizeString(p.raison_sociale);
    const distance = levenshteinDistance(normalizedSearch, normalizedP);
    
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance;
      bestMatch = p;
    }
  }
  
  if (bestMatch) {
    return bestMatch;
  }
  
  return null;
};

// Déduire le type de partenaire depuis le type de produit
const deduireTypePartenaire = (typeProduit: string): string => {
  const t = typeProduit.toUpperCase();
  if (t.includes("AV") || t.includes("ASSURANCE") || t.includes("VIE") || t.includes("PER")) {
    return "ASSUREUR";
  } else if (t.includes("PINEL") || t.includes("IMMOBILIER") || t.includes("MALRAUX")) {
    return "PROMOTEUR";
  } else if (t.includes("FIP") || t.includes("FCPI") || t.includes("FCPR") || t.includes("G3F")) {
    return "SOCIETE_GESTION_FIP";
  } else {
    return "SOCIETE_GESTION_SCPI"; // Par défaut pour SCPI
  }
};

// ============================================

interface ContactImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportRow {
  data: Record<string, any>;
  status: "pending" | "success" | "error" | "duplicate" | "skipped";
  message?: string;
}

/** Après rollback SQLite : le rapport ne doit plus afficher des lignes « succès ». */
function markImportRowsCancelled(rows: ImportRow[]): ImportRow[] {
  return rows.map((r) =>
    r.status === "success"
      ? { ...r, status: "error", message: "Import annulé — aucune donnée enregistrée" }
      : r
  );
}

export function ContactImport({ open, onOpenChange, onSuccess }: ContactImportProps) {
  const [_file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing">("upload");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "merge" | "consolidate">("consolidate");
  const [importCompleted, setImportCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFoyerGrouping, setShowFoyerGrouping] = useState(false);
  const [importedContactsList, setImportedContactsList] = useState<Contact[]>([]);

  const fieldOptions = [
    { value: "SKIP", label: "Ne pas importer" },
    { value: "nom", label: "Nom" },
    { value: "prenom", label: "Prénom" },
    { value: "email", label: "Email" },
    { value: "telephone", label: "Téléphone" },
    { value: "adresse", label: "Adresse" },
    { value: "code_postal", label: "Code postal" },
    { value: "ville", label: "Ville" },
    { value: "date_naissance", label: "Date de naissance" },
    { value: "profession", label: "Profession" },
    { value: "categorie", label: "Catégorie" },
    { value: "source_lead", label: "Source (Lead)" },
    { value: "produit", label: "Type de produit (SCPI, AV, PER...)" },
    { value: "nom_produit", label: "Nom du produit (Comète, Primovie...)" },
    { value: "partenaire", label: "Partenaire (Alderan, Vie Plus...)" },
    { value: "profil_risque_sri", label: "Profil investisseur / Risque" },
    { value: "date_souscription", label: "Date de souscription (→ Notes)" },
    { value: "montant", label: "Montant souscrit (→ Notes)" },
    { value: "montant_vp", label: "Montant VP (→ Notes, si SCPI/AV/PER)" },
    { value: "mode_detention", label: "Mode de détention SCPI (→ Notes)" },
    { value: "duree_demembrement", label: "Durée démembrement (en années ou 'viager')" },
    { value: "date_fin_pret", label: "Date fin de prêt (si financement par crédit)" },
    { value: "reinvestissement", label: "Réinvestissement dividendes (→ Notes, si SCPI)" },
    { value: "dernier_rdv", label: "Dernier RDV (→ Notes)" },
    { value: "prospect_filleul", label: "Prospect Filleul (OUI/NON)" },
    { value: "commentaires", label: "Commentaires / Notes" },
  ];

  // Détection intelligente des colonnes
  const detectColumnMapping = (cols: string[]) => {
    const detectedMapping: Record<string, string> = {};
    
    cols.forEach(col => {
      const colLower = col.toLowerCase().trim();
      
      // IMPORTANT: Vérifier "nom produit" AVANT "nom" seul
      if (colLower.includes("nom") && colLower.includes("produit")) {
        // "Nom du produit" ou "Nom produit" → nom_produit (pas le nom du contact!)
        detectedMapping[col] = "nom_produit";
      } else if (colLower.includes("nom") && !colLower.includes("prenom") && !colLower.includes("prénom") && !colLower.includes("produit")) {
        // "Nom" seul (sans "produit") → nom du contact
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
      } else if (colLower.includes("date") && colLower.includes("naissance")) {
        detectedMapping[col] = "date_naissance";
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
      } else if (colLower.includes("produit") && !colLower.includes("nom")) {
        // "Produit" ou "Type de produit" → produit (type)
        // Note: "Nom produit" est déjà géré plus haut
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
      } else if (
        col.toLowerCase().includes("durée") && 
        (col.toLowerCase().includes("démembrement") || col.toLowerCase().includes("demembrement"))
      ) {
        detectedMapping[col] = "duree_demembrement";
      } else if (
        (col.toLowerCase().includes("date") || col.toLowerCase().includes("fin")) &&
        (col.toLowerCase().includes("prêt") || col.toLowerCase().includes("pret") || col.toLowerCase().includes("crédit") || col.toLowerCase().includes("credit"))
      ) {
        detectedMapping[col] = "date_fin_pret";
      }
    });
    
    return detectedMapping;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      return;
    }
    
    // Vérifier la taille du fichier (max 10MB)
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

      // Détecter TOUTES les colonnes en analysant toutes les lignes
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
      let existingContacts: any[] = [];
      try {
        existingContacts = await getAllContacts();
      } catch (error) {
        // Si erreur d'initialisation de la base, continuer sans détection de doublons
        if (error instanceof Error && error.message.includes("Invalid column type")) {
          existingContacts = [];
        } else {
          throw error;
        }
      }
      
      // Map pour suivre les contacts déjà vus dans l'import en cours
      const seenInImport = new Map<
      string,
      { rowIndex: number; email?: string; telephone?: string }
    >();
      
      const preparedRows: ImportRow[] = rows.map((row, idx) => {
        const contactData: Record<string, any> = {};
        
        // Mapper les colonnes
        Object.entries(mapping).forEach(([sourceCol, targetField]) => {
          if (targetField && targetField !== "SKIP") {
            const value = row[sourceCol] !== undefined ? row[sourceCol] : null;
            
            // Cas spécial : fusionner les colonnes de commentaires au lieu d'écraser
            if (targetField === "commentaires") {
              // Ne rien faire si la valeur est null/undefined/vide
              if (value && String(value).trim() !== "") {
                const existingValue = contactData[targetField];
                if (existingValue && String(existingValue).trim() !== "") {
                  // Fusionner avec l'existant
                  contactData[targetField] = `${existingValue}\n---\n${value}`;
                } else {
                  contactData[targetField] = value;
                }
              }
              // Si value est null/vide, on ne fait RIEN (on garde l'existant)
            } else {
              contactData[targetField] = value;
            }
          }
        });

        const contactKey =
          contactData.nom && contactData.prenom
            ? contactNameKeyCanonical(String(contactData.nom), String(contactData.prenom))
            : null;

        // Détecter les doublons dans l'Excel lui-même (priorité 1)
        let isDuplicate = false;
        let duplicateContact: Contact | null | undefined = null;
        let duplicateSource = null;
        let firstOccurrenceInExcel: { rowIndex: number; email?: string; telephone?: string } | null =
          null;
        let identityConflict = false;
        let conflictReasons: string[] = [];

        const rowIdentity = {
          email: contactData.email ? String(contactData.email) : undefined,
          telephone: contactData.telephone ? String(contactData.telephone) : undefined,
        };

        if (contactKey && seenInImport.has(contactKey)) {
          // Même personne plusieurs lignes dans le fichier (souvent 1 ligne = 1 investissement)
          firstOccurrenceInExcel = seenInImport.get(contactKey)!;
          isDuplicate = true;
          duplicateSource = "excel";
          // Pas d'alerte homonyme entre lignes Excel : emails/tél peuvent différer ou être vides
        } else if (contactKey) {
          seenInImport.set(contactKey, {
            rowIndex: idx,
            email: rowIdentity.email,
            telephone: rowIdentity.telephone,
          });

          duplicateContact =
            contactData.nom && contactData.prenom
              ? findContactByNameKeyWithSwap(
                  existingContacts,
                  String(contactData.nom),
                  String(contactData.prenom)
                )
              : undefined;
          if (!duplicateContact) {
            duplicateContact =
              existingContacts.find((contact) => {
                if (contactData.email && contact.email === contactData.email) return true;
                if (contactData.telephone && contact.telephone === contactData.telephone)
                  return true;
                return false;
              }) ?? null;
          }

          isDuplicate = !!duplicateContact;
          if (isDuplicate && duplicateContact) {
            duplicateSource = "database";
            conflictReasons = getPairIdentityConflictMessages(rowIdentity, duplicateContact);
            identityConflict = conflictReasons.length > 0;
          }
        }

        let duplicateMessage: string | undefined;
        if (isDuplicate) {
          if (duplicateSource === "excel" && firstOccurrenceInExcel) {
            duplicateMessage = `Doublon dans l'Excel (→ ligne ${firstOccurrenceInExcel.rowIndex + 1})`;
          } else if (duplicateContact) {
            duplicateMessage = `Doublon en base (${duplicateContact.prenom} ${duplicateContact.nom})`;
          } else {
            duplicateMessage = "Doublon détecté";
          }
          if (identityConflict) {
            duplicateMessage += ` — Homonyme ? (${conflictReasons.join(", ")})`;
          }
        }

        return {
          data: {
            ...contactData,
            _duplicateContactId: duplicateContact?.id,
            _duplicateSource: duplicateSource,
            _firstOccurrenceRowIndex: firstOccurrenceInExcel?.rowIndex,
            _identityConflict: identityConflict,
            _conflictReasons: conflictReasons,
          },
          status: isDuplicate ? "duplicate" : "pending",
          message: duplicateMessage,
        };
      });

      setImportRows(preparedRows);
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
    let importTxActive = false;

    try {
      await beginImportTransaction();
      importTxActive = true;

    // Charger tous les partenaires existants
    let allPartenaires: Partenaire[] = [];
    try {
      allPartenaires = await getAllPartenaires();
    } catch (error) {
      console.error("Erreur chargement partenaires:", error);
    }

    // Charger tous les contacts, foyers et investissements au début
    let allContactsCache = await getAllContacts();
    let allFoyersCache = await getAllFoyers();
    let allInvestissementsCache = await getAllInvestissements();
    
    // 🔥 Fonction pour détecter les doublons d'investissements
    const findExistingInvestissement = (
      contactId: number | undefined,
      foyerId: number | undefined,
      typeProduit: string,
      nomProduit: string,
      partenaireId: number | undefined,
      montant: number | undefined
    ): Investissement | undefined => {
      return allInvestissementsCache.find(inv => {
        // Vérifier le contact OU le foyer
        const sameOwner = 
          (contactId && inv.contact_id === contactId) ||
          (foyerId && inv.foyer_id === foyerId);
        
        if (!sameOwner) return false;
        
        // Vérifier le type de produit
        if (inv.type_produit !== typeProduit) return false;
        
        // Vérifier le nom du produit (match EXACT uniquement)
        const invNomNormalized = inv.nom_produit.toUpperCase().trim();
        const nomNormalized = nomProduit.toUpperCase().trim();
        if (invNomNormalized !== nomNormalized) {
          return false;
        }
        
        // Si le partenaire est spécifié, vérifier qu'il correspond
        if (partenaireId && inv.partenaire_id && inv.partenaire_id !== partenaireId) {
          return false;
        }
        
        // 🔥 Vérifier le montant (tolérance de 1€ pour les erreurs d'arrondi)
        if (montant && inv.montant_initial) {
          const diff = Math.abs(inv.montant_initial - montant);
          if (diff > 100) { // 100 centimes = 1€
            return false; // Montants différents = investissements différents
          }
        }
        
        return true;
      });
    };
    
    // 🔥 Fonction pour créer ou mettre à jour un investissement
    const createOrUpdateInvestissement = async (
      newInv: NewInvestissement
    ): Promise<{ created: boolean; investissement: Investissement }> => {
      const existing = findExistingInvestissement(
        newInv.contact_id,
        newInv.foyer_id,
        newInv.type_produit,
        newInv.nom_produit,
        newInv.partenaire_id,
        newInv.montant_initial
      );
      
      if (existing) {
        const updated = await updateInvestissement(existing.id, newInv);
        const idx = allInvestissementsCache.findIndex(i => i.id === existing.id);
        if (idx !== -1) {
          allInvestissementsCache[idx] = updated;
        }
        return { created: false, investissement: updated };
      } else {
        const created = await createInvestissement(newInv);
        allInvestissementsCache.push(created);
        return { created: true, investissement: created };
      }
    };

    // Map pour tracer les contacts créés pendant l'import (pour gérer les doublons dans l'Excel)
    const createdContactsInImport = new Map<number, number>(); // rowIndex -> contactId
    // Map pour stocker les lignes "couple" à traiter après
    const couplesLines: Array<{ rowIndex: number; row: ImportRow; foyerId: number }> = [];
    let lastDetectedFoyerId: number | null = null; // 🔥 Tracker le dernier foyer couple détecté

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      
      // 🔥 DÉTECTION COUPLE EN PREMIER (avant le traitement des doublons)
      // Cela permet de gérer les lignes couple « Prénom1 et Prénom2 » marquées comme doublons
      const prenomCheck = String(row.data.prenom || "").trim();
      const nomCheck = String(row.data.nom || "").trim();
      const produitCheck = String(row.data.produit || "").trim();
      
      // Si c'est un couple avec un produit, on l'envoie directement vers la logique couple
      if (isContactCouple(prenomCheck, nomCheck) && produitCheck) {
        // Le traitement se fera dans le bloc couple plus bas, on ne fait PAS continue
        // On laisse le flux normal mais on s'assure que row.status ne bloque pas
        row.status = "pending"; // 🔥 Forcer le statut pending pour passer par la logique couple
      }
      
      // Gérer les doublons selon l'action choisie
      if (row.status === "duplicate") {
        if (duplicateAction === "skip") {
          continue; // Ignorer complètement
        } else if (duplicateAction === "consolidate") {
          if (row.data._identityConflict && row.data._duplicateSource === "database") {
            row.status = "skipped";
            row.message =
              `Homonyme probable (${(row.data._conflictReasons as string[])?.join(", ") || "coordonnées différentes"}). ` +
              "Ligne ignorée — fusionnez à la main ou via Dédupliquer.";
            updatedRows[i] = row;
            setImportRows([...updatedRows]);
            continue;
          }
          // Consolider : ajouter les nouvelles infos aux notes du contact existant
          try {
            // Déterminer le contact à consolider
            let existingContactId = row.data._duplicateContactId;
            
            // Si c'est un doublon dans l'Excel, récupérer le contact créé précédemment
            if (row.data._duplicateSource === "excel" && row.data._firstOccurrenceRowIndex !== undefined) {
              existingContactId = createdContactsInImport.get(row.data._firstOccurrenceRowIndex);
            }
            
            if (existingContactId) {
              // Récupérer le contact existant
              const existingContact = await invoke<Contact>("get_contact_by_id", { id: existingContactId });
              
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
              // Convertir le contact existant (avec timestamps) en NewContact (avec ISO strings)
              
              const rowDateNaissance = parseImportDate(row.data.date_naissance);
              const rowDateDernierContact =
                row.data.dernier_rdv && row.data.dernier_rdv !== "-"
                  ? parseImportDate(row.data.dernier_rdv)
                  : undefined;
              
              // Utiliser la date de naissance de la ligne si le contact n'en a pas
              const finalDateNaissance = existingContact.date_naissance 
                ? new Date(existingContact.date_naissance * 1000).toISOString() 
                : rowDateNaissance;
              
              // 🔥 Prendre la date de suivi la plus RÉCENTE (consolidation multi-lignes)
              const finalDateDernierContact = getMostRecentDate(rowDateDernierContact, existingContact.date_dernier_contact);
              
              const contactToUpdate = {
                foyer_id: existingContact.foyer_id,
                categorie: updatedCategorie,
                parrain_id: existingContact.parrain_id,
                civilite: existingContact.civilite,
                nom: existingContact.nom,
                prenom: existingContact.prenom,
                email: existingContact.email,
                telephone: existingContact.telephone,
                adresse: existingContact.adresse,
                code_postal: existingContact.code_postal,
                ville: existingContact.ville,
                date_naissance: finalDateNaissance,
                profession: existingContact.profession,
                situation_familiale: existingContact.situation_familiale,
                source_lead: existingContact.source_lead,
                profil_risque_sri: existingContact.profil_risque_sri,
                date_dernier_contact: finalDateDernierContact, // 🔥 Date la plus récente
                date_prochain_suivi: existingContact.date_prochain_suivi ? new Date(existingContact.date_prochain_suivi * 1000).toISOString() : undefined,
                statut_suivi: existingContact.statut_suivi,
                notes: existingContact.notes,
              };
              
              await invoke("update_contact", { 
                id: existingContactId, 
                contact: contactToUpdate
              });
              
              // Créer un investissement si un produit est renseigné dans cette ligne
              let investissementCree = false;
              if (row.data.produit) {
                try {
                  const produitStr = String(row.data.produit).trim();
                  
                  // Déterminer le type de produit depuis le nom
                  let typeProduit = "AUTRE";
                  const produitUpper = produitStr.toUpperCase();
                  
                  if (produitUpper.includes('SCPI') && produitUpper.includes('DEMEMBR')) {
                    typeProduit = "SCPI_DEMEMBREMENT";
                  } else if (produitUpper.includes('SCPI')) {
                    typeProduit = "SCPI";
                  } else if (produitUpper.includes('AV') || produitUpper.includes('ASSURANCE') || produitUpper.includes('VIE')) {
                    typeProduit = "ASSURANCE_VIE";
                  } else if (produitUpper.includes('PER')) {
                    typeProduit = "PER";
                  } else if (produitUpper.includes('FIP') || produitUpper.includes('FCPI')) {
                    typeProduit = "FIP_FCPI";
                  } else if (produitUpper.includes('FCPR')) {
                    typeProduit = "FCPR";
                  } else if (produitUpper.includes('G3F')) {
                    typeProduit = "G3F";
                  } else if (produitUpper.includes('LMNP')) {
                    typeProduit = "LMNP";
                  } else if (produitUpper.includes('LMP')) {
                    typeProduit = "LMP";
                  } else if (produitUpper.includes('PINEL')) {
                    typeProduit = "PINEL";
                  } else if (produitUpper.includes('MALRAUX')) {
                    typeProduit = "MALRAUX";
                  } else if (produitUpper.includes('DENORMANDIE')) {
                    typeProduit = "DENORMANDIE";
                  } else if (produitUpper === 'RP' || produitUpper.includes('RESIDENCE PRINCIPALE')) {
                    typeProduit = "RP";
                  } else if (produitUpper === 'RS' || produitUpper.includes('RESIDENCE SECONDAIRE')) {
                    typeProduit = "RS";
                  } else if (produitUpper === 'DF' || produitUpper.includes('DEFICIT FONCIER')) {
                    typeProduit = "DEFICIT_FONCIER";
                  } else if (produitUpper === 'MH' || produitUpper.includes('MONUMENT HISTORIQUE')) {
                    typeProduit = "MONUMENT_HISTORIQUE";
                  } else if (produitUpper.includes('LOCATIF')) {
                    typeProduit = "LOCATIF";
                  } else if (produitUpper.includes('COLOCATION')) {
                    typeProduit = "COLOCATION";
                  } else if (produitUpper.includes('MONOLOCATION')) {
                    typeProduit = "MONOLOCATION";
                  } else if (produitUpper.includes('SCI')) {
                    typeProduit = "SCI";
                  } else if (
                    produitUpper.includes('IMMOBILIER') ||
                    produitUpper.includes('VILLA') || produitUpper.includes('APPARTEMENT') || 
                    produitUpper.includes('MAISON') || produitUpper.includes('IMMEUBLE')
                  ) {
                    typeProduit = "IMMOBILIER";
                  }
                  
                  // Trouver ou créer le partenaire (avec fuzzy matching)
                  let partenaireId = null;
                  if (row.data.partenaire) {
                    const partenaireNom = String(row.data.partenaire).trim();
                    
                    // Fuzzy matching pour trouver le partenaire
                    let partenaire = findMatchingPartenaire(partenaireNom, allPartenaires);
                    
                    if (!partenaire) {
                      try {
                        const typePartenaire = deduireTypePartenaire(typeProduit);
                        const newPartenaire: NewPartenaire = {
                          type_partenaire: typePartenaire,
                          raison_sociale: partenaireNom,
                        };
                        partenaire = await createPartenaire(newPartenaire);
                        allPartenaires.push(partenaire);
                      } catch (partError) {
                        console.error(`❌ Erreur création partenaire ${partenaireNom}:`, partError);
                      }
                    }
                    
                    if (partenaire) {
                      partenaireId = partenaire.id;
                    }
                  }
                  
                  // Parser le montant souscrit (en centimes)
                  let montantInitial = null;
                  if (row.data.montant) {
                    const montantStr = String(row.data.montant).replace(/[^\d.,]/g, '').replace(',', '.');
                    const montantEuros = parseFloat(montantStr);
                    if (!isNaN(montantEuros)) {
                      montantInitial = Math.round(montantEuros * 100);
                    }
                  }
                  
                  // Parser le montant VP (en centimes)
                  let montantVP = null;
                  if (row.data.montant_vp) {
                    const montantVPStr = String(row.data.montant_vp).replace(/[^\d.,]/g, '').replace(',', '.');
                    const montantVPEuros = parseFloat(montantVPStr);
                    if (!isNaN(montantVPEuros)) {
                      montantVP = Math.round(montantVPEuros * 100);
                    }
                  }
                  
                  const dateSouscriptionIso = parseImportDate(row.data.date_souscription);
                  let dateSouscription: string | null = dateSouscriptionIso ?? null;
                  let dateSouscriptionDate: Date | null = dateSouscriptionIso
                    ? new Date(dateSouscriptionIso)
                    : null;
                  
                  // Calculer la date de fin de démembrement
                  let dateFinDemembrement = null;
                  let dureeDemembrement = null;
                  let isViager = false;
                  
                  const modeDetention = row.data.mode_detention ? String(row.data.mode_detention).trim().toUpperCase() : '';
                  const isPP = modeDetention === 'PP' || modeDetention === 'PLEINE PROPRIÉTÉ' || modeDetention === 'PLEINE PROPRIETE';
                  const isNP = modeDetention === 'NP' || modeDetention === 'NUE-PROPRIÉTÉ' || modeDetention === 'NUE-PROPRIETE' || modeDetention === 'NUE PROPRIÉTÉ' || modeDetention === 'NUE PROPRIETE';
                  const isUS = modeDetention === 'US' || modeDetention === 'USUFRUIT' || modeDetention === 'USU';
                  
                  if (!isPP && row.data.duree_demembrement) {
                    const dureeStr = String(row.data.duree_demembrement).trim().toUpperCase();
                    
                    if (dureeStr === 'VIAGER') {
                      isViager = true;
                      dureeDemembrement = 'viager';
                    } else {
                      // Parser le nombre d'années
                      const dureeNum = parseInt(dureeStr);
                      if (!isNaN(dureeNum) && dureeNum > 0 && dateSouscriptionDate) {
                        dureeDemembrement = dureeNum;
                        // Calculer la date de fin
                        const dateFin = new Date(dateSouscriptionDate);
                        dateFin.setFullYear(dateFin.getFullYear() + dureeNum);
                        dateFinDemembrement = dateFin.toISOString();
                      }
                    }
                  }
                  
                  // 🔥 Auto-détection SCPI_DEMEMBREMENT si mode de détention = NP ou US avec durée
                  if (typeProduit === 'SCPI' && (isNP || isUS) && (dureeDemembrement || isViager)) {
                    typeProduit = 'SCPI_DEMEMBREMENT';
                  }
                  
                  const dateFinPret = parseImportDateFinPret(row.data.date_fin_pret);
                  
                  // Réinvestissement dividendes
                  let reinvestissement = false;
                  let reinvestissementPourcentage = null;
                  
                  if (row.data.reinvestissement) {
                    
                    // Si c'est un nombre (format Excel)
                    if (typeof row.data.reinvestissement === 'number') {
                      const num = row.data.reinvestissement;
                      
                      // Si c'est entre 0 et 1, c'est un pourcentage décimal (ex: 1 = 100%, 0.5 = 50%)
                      if (num > 0 && num <= 1) {
                        reinvestissementPourcentage = Math.round(num * 100).toString();
                        reinvestissement = true;
                      } 
                      // Si c'est > 1, c'est déjà un pourcentage (ex: 100, 50)
                      else if (num > 1) {
                        reinvestissementPourcentage = Math.round(num).toString();
                        reinvestissement = true;
                      }
                    } 
                    // Si c'est une chaîne
                    else {
                      const reinvStr = String(row.data.reinvestissement).trim();
                      
                      // Nettoyer et extraire le nombre
                      const cleanStr = reinvStr.replace(/[\s,]/g, '').replace('%', '');
                      const num = parseFloat(cleanStr);
                      
                      if (!isNaN(num)) {
                        // Si c'est entre 0 et 1, multiplier par 100
                        if (num > 0 && num <= 1) {
                          reinvestissementPourcentage = Math.round(num * 100).toString();
                        } else {
                          reinvestissementPourcentage = Math.round(num).toString();
                        }
                        reinvestissement = true;
                      } else if (reinvStr.toUpperCase() === 'OUI') {
                        reinvestissement = true;
                        reinvestissementPourcentage = '100';
                      }
                    }
                  }
                  
                  // Notes de l'investissement (mode de détention + réinvestissement % + durée démembrement)
                  let notesArray: string[] = [];
                  
                  if (row.data.mode_detention) {
                    notesArray.push(`Mode de détention: ${row.data.mode_detention}`);
                  }
                  
                  if (dureeDemembrement) {
                    if (isViager) {
                      notesArray.push(`Durée: viager`);
                    } else {
                      notesArray.push(`Durée: ${dureeDemembrement} ans`);
                    }
                  }
                  
                  if (reinvestissementPourcentage) {
                    notesArray.push(`${reinvestissementPourcentage}%`);
                  }
                  
                  const investissementNotes = notesArray.length > 0 ? notesArray.join(' | ') : undefined;
                  
                  // Nom du produit : utiliser "Nom du produit" si renseigné, sinon le type
                  const nomProduit = row.data.nom_produit 
                    ? String(row.data.nom_produit).trim() 
                    : produitStr;
                  
                  // Créer l'investissement
                  const newInvestissement: NewInvestissement = {
                    contact_id: existingContactId,
                    type_produit: typeProduit,
                    nom_produit: nomProduit,
                    partenaire_id: partenaireId || undefined,
                    montant_initial: montantInitial || undefined,
                    date_souscription: dateSouscription || undefined,
                    date_fin_demembrement: dateFinDemembrement || undefined,
                    date_fin_pret: dateFinPret || undefined,
                    versement_programme: montantVP ? true : false,
                    montant_versement_programme: montantVP || undefined,
                    reinvestissement_dividendes: reinvestissement,
                    notes: investissementNotes || undefined,
                  };
                  
                  const result = await createOrUpdateInvestissement(newInvestissement);
                  investissementCree = result.created;
                } catch (invError) {
                  console.error(`❌ Erreur création investissement pour contact ${existingContactId}:`, invError);
                  throw invError;
                }
              }
              
              const wasPromoted = updatedCategorie !== existingContact.categorie;
              let message = investissementCree ? "Investissement ajouté au contact existant" : "Consolidé avec le contact existant";
              if (wasPromoted) {
                if (updatedCategorie === "CLIENT") {
                  message = investissementCree ? "Investissement ajouté et promu en CLIENT" : "Consolidé et promu en CLIENT (produit souscrit)";
                } else if (updatedCategorie.includes("PROSPECT")) {
                  message = investissementCree ? "Investissement ajouté et promu en PROSPECT" : "Consolidé et promu en PROSPECT (contacté)";
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
        // 👫 DÉTECTION DES CONTACTS "COUPLES" (investissements communs)
        const prenom = String(row.data.prenom || "").trim();
        const nom = String(row.data.nom || "").trim();
        const produit = String(row.data.produit || "").trim();
        
        // 🔍 Log TOUTES les lignes pour détecter les couples
        
        // 🔥 CAS SPECIAL : Ligne sans prénom MAIS avec un produit → Cellule fusionnée !
        if (!prenom && nom && produit && lastDetectedFoyerId) {
          couplesLines.push({ rowIndex: i, row, foyerId: lastDetectedFoyerId });
          updatedRows[i] = { ...row, status: "success", message: "Investissement de foyer (suite)" };
          setImportRows([...updatedRows]);
          continue;
        }
        
        const coupleAnalysis = analyzeCoupleContact(
          prenom,
          nom,
          allContactsCache
        );

        if (coupleAnalysis.shouldSkipContact) {
          
          // CAS 1 : Foyer existant → Stocker l'investissement
          if (coupleAnalysis.foyerId && row.data.produit) {
            lastDetectedFoyerId = coupleAnalysis.foyerId; // 🔥 Mettre à jour le tracker
            couplesLines.push({ rowIndex: i, row, foyerId: coupleAnalysis.foyerId });
            updatedRows[i] = { ...row, status: "success", message: "Investissement de foyer" };
            setImportRows([...updatedRows]);
            continue;
          }
          
          // CAS 2 : Contacts existent mais pas de foyer → Chercher ou créer le foyer
          if (coupleAnalysis.contact1 && coupleAnalysis.contact2 && !coupleAnalysis.foyerId) {
            try {
              const nomFamilleCompose = extractCompositeName(row.data.nom || "");
              
              // 🔥 FIX: Chercher si un foyer avec ce nom de famille existe déjà
              const existingFoyer = findExistingFoyerByFamilleName(
                allFoyersCache,
                nomFamilleCompose
              );
              
              let foyerToUse: { id: number; nom: string };
              
              if (existingFoyer) {
                foyerToUse = existingFoyer;
              } else {
                const nomFoyer = `Foyer ${nomFamilleCompose}`;
                const newFoyer = await createFoyer({ 
                  nom: nomFoyer,
                  type_foyer: "COUPLE"
                });
                foyerToUse = newFoyer;
                // Ajouter au cache des foyers
                allFoyersCache.push(newFoyer);
              }
              
              // Associer les 2 contacts au foyer (s'ils ne le sont pas déjà)
              if (coupleAnalysis.contact1.foyer_id !== foyerToUse.id) {
                await linkContactToFoyer(coupleAnalysis.contact1, foyerToUse.id, "DECLARANT_1");
              }
              if (coupleAnalysis.contact2.foyer_id !== foyerToUse.id) {
                await linkContactToFoyer(coupleAnalysis.contact2, foyerToUse.id, "DECLARANT_2");
              }
              
              // 🔥 FIX: Mettre à jour le cache pour que les prochaines lignes trouvent le foyer
              const idx1 = allContactsCache.findIndex(c => c.id === coupleAnalysis.contact1!.id);
              const idx2 = allContactsCache.findIndex(c => c.id === coupleAnalysis.contact2!.id);
              if (idx1 !== -1) {
                allContactsCache[idx1] = {
                  ...allContactsCache[idx1],
                  foyer_id: foyerToUse.id,
                  role_foyer: "DECLARANT_1",
                };
              }
              if (idx2 !== -1) {
                allContactsCache[idx2] = {
                  ...allContactsCache[idx2],
                  foyer_id: foyerToUse.id,
                  role_foyer: "DECLARANT_2",
                };
              }
              
              const wasExisting = !!existingFoyer;
              
              lastDetectedFoyerId = foyerToUse.id; // 🔥 Mettre à jour le tracker
              
              // Stocker l'investissement
              if (row.data.produit) {
                couplesLines.push({ rowIndex: i, row, foyerId: foyerToUse.id });
                updatedRows[i] = { ...row, status: "success", message: wasExisting ? "Foyer existant + investissement" : "Foyer créé + investissement" };
              } else {
                updatedRows[i] = { ...row, status: "success", message: wasExisting ? "Lié au foyer existant" : "Foyer créé" };
              }
              
            } catch (error) {
              console.error(`👫 [ContactImport] ❌ Erreur création foyer:`, error);
              updatedRows[i] = { ...row, status: "error", message: `Erreur création foyer: ${error}` };
            }
            
            setImportRows([...updatedRows]);
            continue;
          }
          
          // 🔥 CAS 2.5 : UN contact existe, l'autre non → Créer le manquant + foyer
          if ((coupleAnalysis.shouldCreateContact1 || coupleAnalysis.shouldCreateContact2) && 
              coupleAnalysis.prenom1 && coupleAnalysis.prenom2) {
            try {
              const nomFamilleCompose = extractCompositeName(row.data.nom || "");
              const nom1 = coupleAnalysis.nom1 || nomFamilleCompose;
              const nom2 = coupleAnalysis.nom2 || nomFamilleCompose;
              
              // Chercher ou créer le foyer
              const existingFoyer = findExistingFoyerByFamilleName(
                allFoyersCache,
                nomFamilleCompose
              );
              
              let foyerToUse: { id: number; nom: string };
              
              if (existingFoyer) {
                foyerToUse = existingFoyer;
              } else {
                const nomFoyer = `Foyer ${nomFamilleCompose}`;
                const newFoyer = await createFoyer({ 
                  nom: nomFoyer,
                  type_foyer: "COUPLE"
                });
                foyerToUse = newFoyer;
                allFoyersCache.push(newFoyer);
              }
              
              // 🔥 Déterminer la catégorie selon la logique métier (produit = CLIENT, contact = PROSPECT, sinon SUSPECT)
              const categorieCouple = row.data.produit 
                ? "CLIENT" 
                : row.data.dernier_rdv 
                  ? "PROSPECT_CLIENT" 
                  : "SUSPECT_CLIENT";
              
              // Créer le contact manquant
              if (coupleAnalysis.shouldCreateContact1 && coupleAnalysis.contact2) {
                // Contact1 n'existe pas, Contact2 existe
                const newContact1: NewContact = {
                  nom: nom1,
                  prenom: coupleAnalysis.prenom1,
                  foyer_id: foyerToUse.id,
                  role_foyer: "DECLARANT_1",
                  categorie: categorieCouple,
                  statut_suivi: "ACTIF",
                };
                const createdContact1 = await createContact(newContact1);
                allContactsCache.push(createdContact1);
                
                // Mettre à jour contact2 pour le rattacher au foyer
                if (coupleAnalysis.contact2.foyer_id !== foyerToUse.id) {
                  await linkContactToFoyer(coupleAnalysis.contact2, foyerToUse.id, "DECLARANT_2");
                  const idx2 = allContactsCache.findIndex(c => c.id === coupleAnalysis.contact2!.id);
                  if (idx2 !== -1) {
                    allContactsCache[idx2] = {
                      ...allContactsCache[idx2],
                      foyer_id: foyerToUse.id,
                      role_foyer: "DECLARANT_2",
                    };
                  }
                }
              }
              
              if (coupleAnalysis.shouldCreateContact2 && coupleAnalysis.contact1) {
                // Contact2 n'existe pas, Contact1 existe
                const newContact2: NewContact = {
                  nom: nom2,
                  prenom: coupleAnalysis.prenom2,
                  foyer_id: foyerToUse.id,
                  role_foyer: "DECLARANT_2",
                  categorie: categorieCouple,
                  statut_suivi: "ACTIF",
                };
                const createdContact2 = await createContact(newContact2);
                allContactsCache.push(createdContact2);
                
                // Mettre à jour contact1 pour le rattacher au foyer
                if (coupleAnalysis.contact1.foyer_id !== foyerToUse.id) {
                  await linkContactToFoyer(coupleAnalysis.contact1, foyerToUse.id, "DECLARANT_1");
                  const idx1 = allContactsCache.findIndex(c => c.id === coupleAnalysis.contact1!.id);
                  if (idx1 !== -1) {
                    allContactsCache[idx1] = {
                      ...allContactsCache[idx1],
                      foyer_id: foyerToUse.id,
                      role_foyer: "DECLARANT_1",
                    };
                  }
                }
              }
              
              lastDetectedFoyerId = foyerToUse.id;
              
              // Stocker l'investissement
              if (row.data.produit) {
                couplesLines.push({ rowIndex: i, row, foyerId: foyerToUse.id });
                updatedRows[i] = { ...row, status: "success", message: "Contact manquant créé + foyer + investissement" };
              } else {
                updatedRows[i] = { ...row, status: "success", message: "Contact manquant créé + foyer" };
              }
              
            } catch (error) {
              updatedRows[i] = { ...row, status: "error", message: `Erreur CAS 2.5: ${error}` };
            }
            
            setImportRows([...updatedRows]);
            continue;
          }
          
          // CAS 3 : Contacts n'existent pas → Créer contacts + foyer
          if (coupleAnalysis.shouldCreateContacts && coupleAnalysis.prenom1 && coupleAnalysis.prenom2) {
            try {
              // Extraire le nom de famille (gérer les noms composés)
              const nomFamille = row.data.nom || "";
              const nomFamilleCompose = extractCompositeName(nomFamille);
              
              const existingFoyer = findExistingFoyerByFamilleName(
                allFoyersCache,
                nomFamilleCompose
              );
              const nomFoyer = `Foyer ${nomFamilleCompose}`;
              let newFoyer: Foyer;
              if (existingFoyer) {
                newFoyer = existingFoyer;
              } else {
                newFoyer = await createFoyer({
                  nom: nomFoyer,
                  type_foyer: "COUPLE",
                });
                allFoyersCache.push(newFoyer);
              }
              
              // Pour les noms composés "X et Y", utiliser le premier nom pour le premier contact
              const nomContact1 = nomFamille.includes(" et ") || nomFamille.includes(" & ")
                ? nomFamille.split(/ et | & /)[0].trim()
                : nomFamille;
              
              const nomContact2 = nomFamille.includes(" et ") || nomFamille.includes(" & ")
                ? nomFamille.split(/ et | & /)[1].trim()
                : nomFamille;
              
              // 🔥 Déterminer la catégorie selon la logique métier (produit = CLIENT, contact = PROSPECT, sinon SUSPECT)
              const categorieCoupleNew = row.data.produit 
                ? "CLIENT" 
                : row.data.dernier_rdv 
                  ? "PROSPECT_CLIENT" 
                  : "SUSPECT_CLIENT";
              
              // Créer contact 1 (famille_id n'est plus utilisé - groupement dynamique par nom)
              const newContact1: NewContact = {
                nom: nomContact1,
                prenom: coupleAnalysis.prenom1,
                foyer_id: newFoyer.id,
                role_foyer: "DECLARANT_1",
                categorie: categorieCoupleNew,
                statut_suivi: "ACTIF",
              };
              const createdContact1 = await createContact(newContact1);
              
              // Créer contact 2
              const newContact2: NewContact = {
                nom: nomContact2,
                prenom: coupleAnalysis.prenom2,
                foyer_id: newFoyer.id,
                role_foyer: "DECLARANT_2",
                categorie: categorieCoupleNew,
                statut_suivi: "ACTIF",
              };
              const createdContact2 = await createContact(newContact2);
              
              // Mettre à jour le cache
              allContactsCache.push(createdContact1, createdContact2);
              
              lastDetectedFoyerId = newFoyer.id; // 🔥 Mettre à jour le tracker
              
              // Stocker l'investissement
              if (row.data.produit) {
                couplesLines.push({ rowIndex: i, row, foyerId: newFoyer.id });
                updatedRows[i] = { ...row, status: "success", message: `Contacts ${coupleAnalysis.prenom1} et ${coupleAnalysis.prenom2} créés + foyer + investissement` };
              } else {
                updatedRows[i] = { ...row, status: "success", message: `Contacts ${coupleAnalysis.prenom1} et ${coupleAnalysis.prenom2} créés + foyer` };
              }
              
            } catch (error) {
              console.error(`👫 [ContactImport] ❌ Erreur création contacts/foyer:`, error);
              updatedRows[i] = { ...row, status: "error", message: `Erreur: ${error}` };
            }
            
            setImportRows([...updatedRows]);
            continue;
          }
          
          // CAS 4 : Erreur (ne devrait pas arriver)
          updatedRows[i] = { ...row, status: "error", message: "Configuration couple invalide" };
          setImportRows([...updatedRows]);
          continue;
        }

        // Nettoyer et convertir les données
        const cleanString = (val: any) => {
          if (!val) return undefined;
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
            return undefined;
          }
          // Retourner la valeur originale (avec la casse d'origine)
          return String(val).trim();
        };

        // Convertir profil_risque_sri en nombre si présent
        let profilRisque: number | undefined = undefined;
        if (row.data.profil_risque_sri) {
          const parsed = parseInt(String(row.data.profil_risque_sri));
          if (!isNaN(parsed)) {
            profilRisque = parsed;
          }
        }

        let dateDernierContact: Date | null = null;
        if (row.data.dernier_rdv && row.data.dernier_rdv !== "-") {
          dateDernierContact = parseImportDateToDate(row.data.dernier_rdv) ?? null;
        }

        // Notes = colonnes de commentaires fusionnées (fait lors du mapping)
        const finalNotes = row.data.commentaires ? String(row.data.commentaires).trim() : undefined;

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
        
        const hasContactDate = !!dateDernierContact;
        const { categorie, filleul_categorie } = resolveImportContactCategories(
          !!hasProduit,
          hasContactDate,
          isFilleul
        );

        const dateDernierContactISO = dateDernierContact
          ? dateDernierContact.toISOString()
          : undefined;
        const dateDernierContactFilleulISO =
          isFilleul && dateDernierContactISO ? dateDernierContactISO : undefined;

        const dateNaissance = parseImportDate(row.data.date_naissance);

        // 🔥 FIX: Vérifier si ce contact existe déjà dans le cache (créé pendant cet import)
        const existingInCache =
          row.data.nom && row.data.prenom
            ? findContactByNameKeyWithSwap(
                allContactsCache,
                String(row.data.nom),
                String(row.data.prenom)
              )
            : undefined;
        
        if (existingInCache) {
          // Contact déjà créé pendant cet import (ex: par une ligne couple)
          // → Mettre à jour TOUTES les infos du contact + ajouter les investissements
          try {
            // Mettre à jour le contact avec les infos de la ligne Excel
            const updatePayload = contactToUpdatePayload(existingInCache, {
              nom: row.data.nom || existingInCache.nom,
              prenom: row.data.prenom || existingInCache.prenom,
              email: cleanString(row.data.email) || existingInCache.email,
              telephone: cleanString(row.data.telephone) || existingInCache.telephone,
              adresse: cleanString(row.data.adresse) || existingInCache.adresse,
              code_postal: cleanString(row.data.code_postal) || existingInCache.code_postal,
              ville: cleanString(row.data.ville) || existingInCache.ville,
              profession: cleanString(row.data.profession) || existingInCache.profession,
              source_lead: cleanString(row.data.source_lead) || existingInCache.source_lead,
              profil_risque_sri: profilRisque || existingInCache.profil_risque_sri,
              categorie,
              filleul_categorie,
              statut_suivi: existingInCache.statut_suivi || "ACTIF",
              notes: finalNotes || existingInCache.notes,
              date_naissance:
                dateNaissance ||
                (existingInCache.date_naissance
                  ? new Date(existingInCache.date_naissance * 1000).toISOString()
                  : undefined),
              date_dernier_contact: isFilleul
                ? undefined
                : getMostRecentDate(
                    dateDernierContactISO,
                    existingInCache.date_dernier_contact
                  ),
              date_dernier_contact_filleul: isFilleul
                ? getMostRecentDate(
                    dateDernierContactFilleulISO,
                    existingInCache.date_dernier_contact_filleul
                  )
                : existingInCache.date_dernier_contact_filleul
                  ? new Date(existingInCache.date_dernier_contact_filleul * 1000).toISOString()
                  : undefined,
            });

            await updateContact(existingInCache.id, updatePayload);
            
            // Mettre à jour le cache aussi
            const cacheIdx = allContactsCache.findIndex(c => c.id === existingInCache.id);
            if (cacheIdx !== -1) {
              allContactsCache[cacheIdx] = {
                ...allContactsCache[cacheIdx],
                categorie,
                filleul_categorie: filleul_categorie ?? allContactsCache[cacheIdx].filleul_categorie,
              };
            }
            
            // Créer l'investissement pour ce contact existant (avec TOUS les champs)
            if (row.data.produit) {
              const produitStr = String(row.data.produit).trim();
              let typeProduit = "AUTRE";
              const produitUpper = produitStr.toUpperCase();
              
              if (produitUpper.includes('SCPI') && produitUpper.includes('DEMEMBR')) {
                typeProduit = "SCPI_DEMEMBREMENT";
              } else if (produitUpper.includes('SCPI')) {
                typeProduit = "SCPI";
              } else if (produitUpper.includes('AV') || produitUpper.includes('ASSURANCE') || produitUpper.includes('VIE')) {
                typeProduit = "ASSURANCE_VIE";
              } else if (produitUpper.includes('PER')) {
                typeProduit = "PER";
              } else if (produitUpper.includes('FIP') || produitUpper.includes('FCPI')) {
                typeProduit = "FIP_FCPI";
              } else if (produitUpper.includes('FCPR')) {
                typeProduit = "FCPR";
              } else if (produitUpper.includes('G3F')) {
                typeProduit = "G3F";
              } else if (produitUpper.includes('LMNP')) {
                typeProduit = "LMNP";
              } else if (produitUpper.includes('LMP')) {
                typeProduit = "LMP";
              } else if (produitUpper.includes('PINEL')) {
                typeProduit = "PINEL";
              } else if (produitUpper.includes('MALRAUX')) {
                typeProduit = "MALRAUX";
              } else if (produitUpper.includes('DENORMANDIE')) {
                typeProduit = "DENORMANDIE";
              } else if (produitUpper === 'RP' || produitUpper.includes('RESIDENCE PRINCIPALE')) {
                typeProduit = "RP";
              } else if (produitUpper === 'RS' || produitUpper.includes('RESIDENCE SECONDAIRE')) {
                typeProduit = "RS";
              } else if (produitUpper === 'DF' || produitUpper.includes('DEFICIT FONCIER')) {
                typeProduit = "DEFICIT_FONCIER";
              } else if (produitUpper === 'MH' || produitUpper.includes('MONUMENT HISTORIQUE')) {
                typeProduit = "MONUMENT_HISTORIQUE";
              } else if (produitUpper.includes('LOCATIF')) {
                typeProduit = "LOCATIF";
              } else if (produitUpper.includes('COLOCATION')) {
                typeProduit = "COLOCATION";
              } else if (produitUpper.includes('MONOLOCATION')) {
                typeProduit = "MONOLOCATION";
              } else if (produitUpper.includes('SCI')) {
                typeProduit = "SCI";
              } else if (
                produitUpper.includes('IMMOBILIER') ||
                produitUpper.includes('VILLA') || produitUpper.includes('APPARTEMENT') || 
                produitUpper.includes('MAISON') || produitUpper.includes('IMMEUBLE')
              ) {
                typeProduit = "IMMOBILIER";
              }
              
              const nomProduit = row.data.nom_produit 
                ? String(row.data.nom_produit).trim() 
                : produitStr;
              
              // Trouver le partenaire
              let partenaireId = null;
              if (row.data.partenaire) {
                const partenaireNom = String(row.data.partenaire).trim().toUpperCase();
                const matchingPartenaire = findMatchingPartenaire(partenaireNom, allPartenaires);
                if (matchingPartenaire) {
                  partenaireId = matchingPartenaire.id;
                }
              }
              
              // Parser le montant
              let montantInitial: number | undefined;
              if (row.data.montant) {
                const montantStr = String(row.data.montant).replace(/[^\d.,]/g, '').replace(',', '.');
                const montantNum = parseFloat(montantStr);
                if (!isNaN(montantNum) && montantNum > 0) {
                  montantInitial = Math.round(montantNum * 100);
                }
              }
              
              // 🔥 Parser le montant VP (versement programmé)
              let montantVP: number | undefined;
              if (row.data.montant_vp) {
                const vpStr = String(row.data.montant_vp).replace(/[^\d.,]/g, '').replace(',', '.');
                const montantVPEuros = parseFloat(vpStr);
                if (!isNaN(montantVPEuros)) {
                  montantVP = Math.round(montantVPEuros * 100);
                }
              }
              
              const dateSouscriptionIso2 = parseImportDate(row.data.date_souscription);
              let dateSouscription: string | null = dateSouscriptionIso2 ?? null;
              let dateSouscriptionDate: Date | null = dateSouscriptionIso2
                ? new Date(dateSouscriptionIso2)
                : null;
              
              // 🔥 Calculer la date de fin de démembrement
              let dateFinDemembrement = null;
              let dureeDemembrement: number | string | null = null;
              let isViager = false;
              
              const modeDetention = row.data.mode_detention ? String(row.data.mode_detention).trim().toUpperCase() : '';
              const isPP = modeDetention === 'PP' || modeDetention === 'PLEINE PROPRIÉTÉ' || modeDetention === 'PLEINE PROPRIETE';
              const isNP = modeDetention === 'NP' || modeDetention === 'NUE-PROPRIÉTÉ' || modeDetention === 'NUE-PROPRIETE' || modeDetention === 'NUE PROPRIÉTÉ' || modeDetention === 'NUE PROPRIETE';
              const isUS = modeDetention === 'US' || modeDetention === 'USUFRUIT' || modeDetention === 'USU';
              
              if (!isPP && row.data.duree_demembrement) {
                const dureeStr = String(row.data.duree_demembrement).trim().toUpperCase();
                
                if (dureeStr === 'VIAGER') {
                  isViager = true;
                  dureeDemembrement = 'viager';
                } else {
                  const dureeNum = parseInt(dureeStr);
                  if (!isNaN(dureeNum) && dureeNum > 0 && dateSouscriptionDate) {
                    dureeDemembrement = dureeNum;
                    const dateFin = new Date(dateSouscriptionDate);
                    dateFin.setFullYear(dateFin.getFullYear() + dureeNum);
                    dateFinDemembrement = dateFin.toISOString();
                  }
                }
              }
              
              // 🔥 Auto-détection SCPI_DEMEMBREMENT si mode de détention = NP ou US avec durée
              if (typeProduit === 'SCPI' && (isNP || isUS) && (dureeDemembrement || isViager)) {
                typeProduit = 'SCPI_DEMEMBREMENT';
              }
              
              const dateFinPret = parseImportDateFinPret(row.data.date_fin_pret);
              
              // 🔥 Réinvestissement dividendes
              let reinvestissement = false;
              let reinvestissementPourcentage: string | null = null;
              
              if (row.data.reinvestissement) {
                if (typeof row.data.reinvestissement === 'number') {
                  const num = row.data.reinvestissement;
                  if (num > 0 && num <= 1) {
                    reinvestissementPourcentage = Math.round(num * 100).toString();
                    reinvestissement = true;
                  } else if (num > 1) {
                    reinvestissementPourcentage = Math.round(num).toString();
                    reinvestissement = true;
                  }
                } else {
                  const reinvStr = String(row.data.reinvestissement).trim();
                  const cleanStr = reinvStr.replace(/[\s,]/g, '').replace('%', '');
                  const num = parseFloat(cleanStr);
                  
                  if (!isNaN(num)) {
                    if (num > 0 && num <= 1) {
                      reinvestissementPourcentage = Math.round(num * 100).toString();
                    } else {
                      reinvestissementPourcentage = Math.round(num).toString();
                    }
                    reinvestissement = true;
                  } else if (reinvStr.toUpperCase() === 'OUI') {
                    reinvestissement = true;
                    reinvestissementPourcentage = '100';
                  }
                }
              }
              
              // 🔥 Notes de l'investissement
              let notesArray: string[] = [];
              if (row.data.mode_detention) {
                notesArray.push(`Mode de détention: ${row.data.mode_detention}`);
              }
              if (dureeDemembrement) {
                if (isViager) {
                  notesArray.push(`Durée: viager`);
                } else {
                  notesArray.push(`Durée: ${dureeDemembrement} ans`);
                }
              }
              if (reinvestissementPourcentage) {
                notesArray.push(`Réinv. ${reinvestissementPourcentage}%`);
              }
              const investissementNotes = notesArray.length > 0 ? notesArray.join(' | ') : undefined;
              
              // Créer l'investissement attaché au CONTACT (pas au foyer)
              const newInvestissement: NewInvestissement = {
                contact_id: existingInCache.id,
                type_produit: typeProduit,
                nom_produit: nomProduit,
                partenaire_id: partenaireId || undefined,
                montant_initial: montantInitial || undefined,
                date_souscription: dateSouscription || undefined,
                date_fin_demembrement: dateFinDemembrement || undefined,
                date_fin_pret: dateFinPret || undefined,
                versement_programme: montantVP ? true : false,
                montant_versement_programme: montantVP || undefined,
                reinvestissement_dividendes: reinvestissement,
                notes: investissementNotes || undefined,
              };
              
              await createOrUpdateInvestissement(newInvestissement);
              updatedRows[i] = { ...row, status: "success", message: `${existingInCache.prenom} mis à jour + investissement` };
            } else {
              updatedRows[i] = { ...row, status: "success", message: `${existingInCache.prenom} mis à jour` };
            }
            
            // 🔥 FIX: Sauvegarder l'ID pour que les lignes "doublon" suivantes puissent le trouver
            createdContactsInImport.set(i, existingInCache.id);
            
          } catch (cacheError) {
            console.error(`❌ [ContactImport] Erreur mise à jour ${existingInCache.prenom} ${existingInCache.nom}:`, cacheError);
            updatedRows[i] = { ...row, status: "error", message: `Erreur mise à jour ${existingInCache.prenom}: ${cacheError}` };
          }
          
          setImportRows([...updatedRows]);
          continue;
        }
        
        // Créer le contact (famille_id n'est plus utilisé - groupement dynamique par nom)
        const newContact: NewContact = {
          nom: row.data.nom || "",
          prenom: row.data.prenom || "",
          email: cleanString(row.data.email),
          telephone: cleanString(row.data.telephone),
          adresse: cleanString(row.data.adresse),
          code_postal: cleanString(row.data.code_postal),
          ville: cleanString(row.data.ville),
          date_naissance: dateNaissance,
          profession: cleanString(row.data.profession),
          source_lead: cleanString(row.data.source_lead),
          profil_risque_sri: profilRisque,
          date_dernier_contact: isFilleul ? undefined : dateDernierContactISO,
          date_dernier_contact_filleul: dateDernierContactFilleulISO,
          categorie,
          filleul_categorie,
          statut_suivi: "ACTIF",
          notes: finalNotes,
        };
        
        const createdContact = await createContact(newContact);
        
        // 🔥 FIX: Mettre à jour le cache pour que les lignes "couple" trouvent ces contacts
        allContactsCache.push(createdContact);
        
        // Sauvegarder le contact créé dans la map (pour gérer les doublons dans l'Excel)
        createdContactsInImport.set(i, createdContact.id);
        
        // Créer un investissement si un produit est renseigné
        if (row.data.produit) {
          try {
            const produitStr = String(row.data.produit).trim();
            
            // Déterminer le type de produit depuis le nom
            let typeProduit = "AUTRE";
            const produitUpper = produitStr.toUpperCase();
            
            if (produitUpper.includes('SCPI') && produitUpper.includes('DEMEMBR')) {
              typeProduit = "SCPI_DEMEMBREMENT";
            } else if (produitUpper.includes('SCPI')) {
              typeProduit = "SCPI";
            } else if (produitUpper.includes('AV') || produitUpper.includes('ASSURANCE') || produitUpper.includes('VIE')) {
              typeProduit = "ASSURANCE_VIE";
            } else if (produitUpper.includes('PER')) {
              typeProduit = "PER";
            } else if (produitUpper.includes('FIP') || produitUpper.includes('FCPI')) {
              typeProduit = "FIP_FCPI";
            } else if (produitUpper.includes('FCPR')) {
              typeProduit = "FCPR";
            } else if (produitUpper.includes('G3F')) {
              typeProduit = "G3F";
            } else if (produitUpper.includes('LMNP')) {
              typeProduit = "LMNP";
            } else if (produitUpper.includes('LMP')) {
              typeProduit = "LMP";
            } else if (produitUpper.includes('PINEL')) {
              typeProduit = "PINEL";
            } else if (produitUpper.includes('MALRAUX')) {
              typeProduit = "MALRAUX";
            } else if (produitUpper.includes('DENORMANDIE')) {
              typeProduit = "DENORMANDIE";
            } else if (produitUpper === 'RP' || produitUpper.includes('RESIDENCE PRINCIPALE')) {
              typeProduit = "RP";
            } else if (produitUpper === 'RS' || produitUpper.includes('RESIDENCE SECONDAIRE')) {
              typeProduit = "RS";
            } else if (produitUpper === 'DF' || produitUpper.includes('DEFICIT FONCIER')) {
              typeProduit = "DEFICIT_FONCIER";
            } else if (produitUpper === 'MH' || produitUpper.includes('MONUMENT HISTORIQUE')) {
              typeProduit = "MONUMENT_HISTORIQUE";
            } else if (produitUpper.includes('LOCATIF')) {
              typeProduit = "LOCATIF";
            } else if (produitUpper.includes('COLOCATION')) {
              typeProduit = "COLOCATION";
            } else if (produitUpper.includes('MONOLOCATION')) {
              typeProduit = "MONOLOCATION";
            } else if (produitUpper.includes('SCI')) {
              typeProduit = "SCI";
            } else if (
              produitUpper.includes('IMMOBILIER') ||
              produitUpper.includes('VILLA') || produitUpper.includes('APPARTEMENT') || 
              produitUpper.includes('MAISON') || produitUpper.includes('IMMEUBLE')
            ) {
              typeProduit = "IMMOBILIER";
            }
            
            // Trouver ou créer le partenaire (avec fuzzy matching)
            let partenaireId = null;
            if (row.data.partenaire) {
              const partenaireNom = String(row.data.partenaire).trim();
              
              // Fuzzy matching pour trouver le partenaire
              let partenaire = findMatchingPartenaire(partenaireNom, allPartenaires);
              
              // Si n'existe pas, créer
              if (!partenaire) {
                try {
                  const typePartenaire = deduireTypePartenaire(typeProduit);
                  const newPartenaire: NewPartenaire = {
                    type_partenaire: typePartenaire,
                    raison_sociale: partenaireNom,
                  };
                  partenaire = await createPartenaire(newPartenaire);
                  allPartenaires.push(partenaire); // Ajouter à la liste pour éviter doublons
                } catch (partError) {
                  console.error(`❌ Erreur création partenaire ${partenaireNom}:`, partError);
                }
              }
              
              if (partenaire) {
                partenaireId = partenaire.id;
              }
            }
            
            // Parser le montant souscrit (en centimes)
            let montantInitial = null;
            if (row.data.montant) {
              const montantStr = String(row.data.montant).replace(/[^\d.,]/g, '').replace(',', '.');
              const montantEuros = parseFloat(montantStr);
              if (!isNaN(montantEuros)) {
                montantInitial = Math.round(montantEuros * 100); // Convertir en centimes
              }
            }
            
            // Parser le montant VP (en centimes)
            let montantVP = null;
            if (row.data.montant_vp) {
              const montantVPStr = String(row.data.montant_vp).replace(/[^\d.,]/g, '').replace(',', '.');
              const montantVPEuros = parseFloat(montantVPStr);
              if (!isNaN(montantVPEuros)) {
                montantVP = Math.round(montantVPEuros * 100);
              }
            }
            
            const dateSouscriptionIso3 = parseImportDate(row.data.date_souscription);
            let dateSouscription: string | null = dateSouscriptionIso3 ?? null;
            let dateSouscriptionDate: Date | null = dateSouscriptionIso3
              ? new Date(dateSouscriptionIso3)
              : null;
            
            // Calculer la date de fin de démembrement
            let dateFinDemembrement = null;
            let dureeDemembrement = null;
            let isViager = false;
            
            const modeDetention = row.data.mode_detention ? String(row.data.mode_detention).trim().toUpperCase() : '';
            const isPP = modeDetention === 'PP' || modeDetention === 'PLEINE PROPRIÉTÉ' || modeDetention === 'PLEINE PROPRIETE';
            const isNP = modeDetention === 'NP' || modeDetention === 'NUE-PROPRIÉTÉ' || modeDetention === 'NUE-PROPRIETE' || modeDetention === 'NUE PROPRIÉTÉ' || modeDetention === 'NUE PROPRIETE';
            const isUS = modeDetention === 'US' || modeDetention === 'USUFRUIT' || modeDetention === 'USU';
            
            if (!isPP && row.data.duree_demembrement) {
              const dureeStr = String(row.data.duree_demembrement).trim().toUpperCase();
              
              if (dureeStr === 'VIAGER') {
                isViager = true;
                dureeDemembrement = 'viager';
              } else {
                // Parser le nombre d'années
                const dureeNum = parseInt(dureeStr);
                if (!isNaN(dureeNum) && dureeNum > 0 && dateSouscriptionDate) {
                  dureeDemembrement = dureeNum;
                  // Calculer la date de fin
                  const dateFin = new Date(dateSouscriptionDate);
                  dateFin.setFullYear(dateFin.getFullYear() + dureeNum);
                  dateFinDemembrement = dateFin.toISOString();
                }
              }
            }
            
            // 🔥 Auto-détection SCPI_DEMEMBREMENT si mode de détention = NP ou US avec durée
            if (typeProduit === 'SCPI' && (isNP || isUS) && (dureeDemembrement || isViager)) {
              typeProduit = 'SCPI_DEMEMBREMENT';
            }
            
            const dateFinPret = parseImportDateFinPret(row.data.date_fin_pret);
            
            // Réinvestissement dividendes
            let reinvestissement = false;
            let reinvestissementPourcentage = null;
            
            if (row.data.reinvestissement) {
              // Si c'est un nombre (format Excel)
              if (typeof row.data.reinvestissement === 'number') {
                const num = row.data.reinvestissement;
                
                // Si c'est entre 0 et 1, c'est un pourcentage décimal (ex: 1 = 100%, 0.5 = 50%)
                if (num > 0 && num <= 1) {
                  reinvestissementPourcentage = Math.round(num * 100).toString();
                  reinvestissement = true;
                } 
                // Si c'est > 1, c'est déjà un pourcentage (ex: 100, 50)
                else if (num > 1) {
                  reinvestissementPourcentage = Math.round(num).toString();
                  reinvestissement = true;
                }
              } 
              // Si c'est une chaîne
              else {
                const reinvStr = String(row.data.reinvestissement).trim();
                
                // Nettoyer et extraire le nombre
                const cleanStr = reinvStr.replace(/[\s,]/g, '').replace('%', '');
                const num = parseFloat(cleanStr);
                
                if (!isNaN(num)) {
                  // Si c'est entre 0 et 1, multiplier par 100
                  if (num > 0 && num <= 1) {
                    reinvestissementPourcentage = Math.round(num * 100).toString();
                  } else {
                    reinvestissementPourcentage = Math.round(num).toString();
                  }
                  reinvestissement = true;
                } else if (reinvStr.toUpperCase() === 'OUI') {
                  reinvestissement = true;
                  reinvestissementPourcentage = '100';
                }
              }
            }
            
            // Notes de l'investissement (mode de détention + réinvestissement % + durée démembrement)
            let notesArray: string[] = [];
            
            if (row.data.mode_detention) {
              notesArray.push(`Mode de détention: ${row.data.mode_detention}`);
            }
            
            if (dureeDemembrement) {
              if (isViager) {
                notesArray.push(`Durée: viager`);
              } else {
                notesArray.push(`Durée: ${dureeDemembrement} ans`);
              }
            }
            
            if (reinvestissementPourcentage) {
              notesArray.push(`${reinvestissementPourcentage}%`);
            }
            
            const investissementNotes = notesArray.length > 0 ? notesArray.join(' | ') : undefined;
            
            // Nom du produit : utiliser "Nom du produit" si renseigné, sinon le type
            const nomProduit = row.data.nom_produit 
              ? String(row.data.nom_produit).trim() 
              : produitStr;
            
            // Créer l'investissement
            const newInvestissement: NewInvestissement = {
              contact_id: createdContact.id,
              type_produit: typeProduit,
              nom_produit: nomProduit,
              partenaire_id: partenaireId || undefined,
              montant_initial: montantInitial || undefined,
              date_souscription: dateSouscription || undefined,
              date_fin_demembrement: dateFinDemembrement || undefined,
              date_fin_pret: dateFinPret || undefined,
              versement_programme: montantVP ? true : false,
              montant_versement_programme: montantVP || undefined,
              reinvestissement_dividendes: reinvestissement,
              notes: investissementNotes || undefined,
            };
            
            await createOrUpdateInvestissement(newInvestissement);
          } catch (invError) {
            console.error(`❌ Erreur création investissement pour ${row.data.prenom} ${row.data.nom}:`, invError);
            throw invError;
          }
        }
        
        updatedRows[i] = { ...row, status: "success", message: "Importé avec succès" };
      } catch (error) {
        console.error(`❌ [${i + 1}/${rows.length}] Erreur création contact ${row.data.prenom} ${row.data.nom}:`, error);
        updatedRows[i] = { ...row, status: "error", message: String(error) };
      }

      setImportRows([...updatedRows]);
    }

    // Traiter les investissements de foyer (lignes couples)
    for (const coupleLine of couplesLines) {
      try {
        const { row, foyerId } = coupleLine;
        
        const produitStr = String(row.data.produit).trim();
        
        // Déterminer le type de produit
        let typeProduit = "AUTRE";
        const produitUpper = produitStr.toUpperCase();
        
        if (produitUpper.includes('SCPI') && produitUpper.includes('DEMEMBR')) {
          typeProduit = "SCPI_DEMEMBREMENT";
        } else if (produitUpper.includes('SCPI')) {
          typeProduit = "SCPI";
        } else if (produitUpper.includes('AV') || produitUpper.includes('ASSURANCE') || produitUpper.includes('VIE')) {
          typeProduit = "ASSURANCE_VIE";
        } else if (produitUpper.includes('PER')) {
          typeProduit = "PER";
        } else if (produitUpper.includes('FIP') || produitUpper.includes('FCPI')) {
          typeProduit = "FIP_FCPI";
        } else if (produitUpper.includes('FCPR')) {
          typeProduit = "FCPR";
        } else if (produitUpper.includes('G3F')) {
          typeProduit = "G3F";
        } else if (produitUpper.includes('LMNP')) {
          typeProduit = "LMNP";
        } else if (produitUpper.includes('LMP')) {
          typeProduit = "LMP";
        } else if (produitUpper.includes('PINEL')) {
          typeProduit = "PINEL";
        } else if (produitUpper.includes('MALRAUX')) {
          typeProduit = "MALRAUX";
        } else if (produitUpper.includes('DENORMANDIE')) {
          typeProduit = "DENORMANDIE";
        } else if (produitUpper === 'RP' || produitUpper.includes('RESIDENCE PRINCIPALE')) {
          typeProduit = "RP";
        } else if (produitUpper === 'RS' || produitUpper.includes('RESIDENCE SECONDAIRE')) {
          typeProduit = "RS";
        } else if (produitUpper === 'DF' || produitUpper.includes('DEFICIT FONCIER')) {
          typeProduit = "DEFICIT_FONCIER";
        } else if (produitUpper === 'MH' || produitUpper.includes('MONUMENT HISTORIQUE')) {
          typeProduit = "MONUMENT_HISTORIQUE";
        } else if (produitUpper.includes('LOCATIF')) {
          typeProduit = "LOCATIF";
        } else if (produitUpper.includes('COLOCATION')) {
          typeProduit = "COLOCATION";
        } else if (produitUpper.includes('MONOLOCATION')) {
          typeProduit = "MONOLOCATION";
        } else if (produitUpper.includes('SCI')) {
          typeProduit = "SCI";
        } else if (
          produitUpper.includes('IMMOBILIER') ||
          produitUpper.includes('VILLA') || produitUpper.includes('APPARTEMENT') || 
          produitUpper.includes('MAISON') || produitUpper.includes('IMMEUBLE')
        ) {
          typeProduit = "IMMOBILIER";
        }
        
        // Trouver ou créer le partenaire
        let partenaireId = null;
        if (row.data.partenaire) {
          const partenaireNom = String(row.data.partenaire).trim();
          let partenaire = findMatchingPartenaire(partenaireNom, allPartenaires);
          
          if (!partenaire) {
            const typePartenaire = deduireTypePartenaire(typeProduit);
            const newPartenaire: NewPartenaire = {
              type_partenaire: typePartenaire,
              raison_sociale: partenaireNom, // ✅ Correction : raison_sociale au lieu de nom
            };
            
            const created = await createPartenaire(newPartenaire);
            allPartenaires.push(created);
            partenaireId = created.id;
          } else {
            partenaireId = partenaire.id;
          }
        }
        
        // Parser le montant
        const montantInitial = row.data.montant ? Math.round(parseFloat(String(row.data.montant)) * 100) : undefined;
        
        // 🔥 FIX: Utiliser le vrai nom du produit (ex: "NCap Regions") au lieu du type (ex: "SCPI")
        const nomProduit = row.data.nom_produit 
          ? String(row.data.nom_produit).trim() 
          : produitStr; // Fallback sur le type si pas de nom
        
        // 🔥 FIX: Parser les mêmes champs que les investissements individuels
        const dateSouscription = parseImportDate(row.data.date_souscription);
        
        // Montant VP
        const montantVP = row.data.montant_vp ? Math.round(parseFloat(String(row.data.montant_vp)) * 100) : undefined;
        
        // Réinvestissement
        let reinvestissement = false;
        let reinvestissementPourcentage: number | undefined;
        if (row.data.reinvestissement) {
          const reinvStr = String(row.data.reinvestissement).trim().toUpperCase();
          reinvestissement = reinvStr === 'OUI' || reinvStr === 'YES' || reinvStr === 'TRUE' || reinvStr === '1';
          if (!reinvestissement) {
            const reinvNum = parseInt(reinvStr.replace(/[^0-9]/g, ''));
            if (!isNaN(reinvNum) && reinvNum > 0) {
              reinvestissement = true;
              reinvestissementPourcentage = reinvNum;
            }
          }
        }
        
        // Durée démembrement
        let dureeDemembrement: string | undefined;
        let dateFinDemembrement: string | undefined;
        let isViager = false;
        
        const modeDetention = row.data.mode_detention ? String(row.data.mode_detention).trim().toUpperCase() : '';
        const isPP = modeDetention === 'PP' || modeDetention === 'PLEINE PROPRIÉTÉ' || modeDetention === 'PLEINE PROPRIETE';
        const isNP = modeDetention === 'NP' || modeDetention === 'NUE-PROPRIÉTÉ' || modeDetention === 'NUE-PROPRIETE' || modeDetention === 'NUE PROPRIÉTÉ' || modeDetention === 'NUE PROPRIETE';
        const isUS = modeDetention === 'US' || modeDetention === 'USUFRUIT' || modeDetention === 'USU';
        
        if (!isPP && row.data.duree_demembrement) {
          const dureeStr = String(row.data.duree_demembrement).trim().toUpperCase();
          
          if (dureeStr === 'VIAGER') {
            isViager = true;
            dureeDemembrement = 'viager';
          } else {
            const dureeNum = parseInt(dureeStr);
            if (!isNaN(dureeNum) && dureeNum > 0) {
              dureeDemembrement = String(dureeNum);
              // Calculer la date de fin
              if (dateSouscription) {
                const dateDebut = new Date(dateSouscription);
                dateDebut.setFullYear(dateDebut.getFullYear() + dureeNum);
                dateFinDemembrement = dateDebut.toISOString();
              }
            }
          }
        }
        
        // 🔥 Auto-détection SCPI_DEMEMBREMENT si mode de détention = NP ou US avec durée
        if (typeProduit === 'SCPI' && (isNP || isUS) && (dureeDemembrement || isViager)) {
          typeProduit = 'SCPI_DEMEMBREMENT';
        }
        
        const dateFinPret = parseImportDateFinPret(row.data.date_fin_pret) ?? undefined;
        
        // 🔥 Construire les notes avec mode_detention, durée, réinvestissement
        const notesArray: string[] = [];
        notesArray.push("Commun"); // Indicateur que c'est un investissement de couple
        
        if (row.data.mode_detention) {
          notesArray.push(`Mode de détention: ${row.data.mode_detention}`);
        }
        
        if (dureeDemembrement) {
          if (isViager) {
            notesArray.push(`Durée: viager`);
          } else {
            notesArray.push(`Durée: ${dureeDemembrement} ans`);
          }
        }
        
        if (reinvestissementPourcentage) {
          notesArray.push(`Réinv. ${reinvestissementPourcentage}%`);
        }
        
        if (row.data.commentaires) {
          notesArray.push(String(row.data.commentaires).trim());
        }
        
        const investissementNotes = notesArray.join(' | ');
        
        // Créer l'investissement rattaché au FOYER (via foyer_id, pas contact_id)
        const newInvestissement: NewInvestissement = {
          foyer_id: foyerId,
          contact_id: undefined, // Pas de contact_id pour un investissement de foyer
          type_produit: typeProduit,
          nom_produit: nomProduit,
          partenaire_id: partenaireId || undefined,
          montant_initial: montantInitial || undefined,
          date_souscription: dateSouscription,
          date_fin_demembrement: dateFinDemembrement,
          date_fin_pret: dateFinPret,
          versement_programme: montantVP ? true : false,
          montant_versement_programme: montantVP,
          reinvestissement_dividendes: reinvestissement,
          notes: investissementNotes,
        };
        
        await createOrUpdateInvestissement(newInvestissement);
      } catch (error) {
        console.error("Erreur investissement foyer:", error);
        const idx = coupleLine.rowIndex;
        updatedRows[idx] = {
          ...updatedRows[idx],
          status: "error",
          message: `Erreur investissement couple: ${String(error)}`,
        };
      }
    }

    setImportRows([...updatedRows]);
    const errorCount = updatedRows.filter((r) => r.status === "error").length;

    if (errorCount > 0) {
      await rollbackImportTransaction();
      importTxActive = false;
      setImportRows(markImportRowsCancelled(updatedRows));
      setImporting(false);
      setImportCompleted(true);
      toast.error(
        `Import annulé : ${errorCount} erreur(s). Aucune donnée n'a été enregistrée.`
      );
      return;
    }

    await commitImportTransaction();
    importTxActive = false;

    setImportCompleted(true);
    setImporting(false);

    // Récupérer les contacts nouvellement créés pour la détection des foyers
    const successfulImports = updatedRows.filter(r => r.status === "success");
    
    if (successfulImports.length > 0) {
      try {
        // Récupérer les contacts fraîchement créés
        const allContacts = await getAllContacts();
        
        const newContacts = successfulImports
          .map(row => {
            const contact =
              row.data.nom && row.data.prenom
                ? findContactByNameKeyWithSwap(
                    allContacts,
                    String(row.data.nom),
                    String(row.data.prenom)
                  )
                : undefined;
            if (contact) {
            } else {
            }
            return contact;
          })
          .filter((c): c is Contact => c !== undefined);

        // 🎯 DÉDUPLICATION : Ne garder qu'une seule instance de chaque contact (par ID)
        const uniqueContacts = Array.from(
          new Map(newContacts.map(c => [c.id, c])).values()
        );

        // Grouper par nom de famille pour détecter les familles
        const familyMap = new Map<string, Contact[]>();
        uniqueContacts.forEach(contact => {
          const familyName = contact.nom.toUpperCase();
          if (!familyMap.has(familyName)) {
            familyMap.set(familyName, []);
          }
          familyMap.get(familyName)!.push(contact);
        });
        // Vérifier s'il y a des familles avec 2+ membres
        const hasFamilies = Array.from(familyMap.values()).some(members => members.length >= 2);

        // Afficher la modale de composition des FOYERS (unités fiscales)
        // Les familles sont créées automatiquement par nom
        // Les foyers doivent être composés manuellement (qui déclare ensemble)
        if (hasFamilies) {
          setImportCompleted(true);
          setImportedContactsList(uniqueContacts);
          setShowFoyerGrouping(true);
          return;
        }
      } catch (error) {
        console.error("📥 [ContactImport] ❌ Erreur détection familles:", error);
      }
    } else {
    }
    
    const ok = updatedRows.filter((r) => r.status === "success").length;
    const skipped = updatedRows.filter((r) => r.status === "skipped").length;
    if (ok > 0) {
      toast.success(
        skipped > 0
          ? `${ok} ligne(s) importée(s), ${skipped} ignorée(s). Cliquez Fermer.`
          : `${ok} ligne(s) importée(s). Cliquez Fermer pour terminer.`
      );
    } else if (skipped > 0) {
      toast.warning(`${skipped} ligne(s) ignorée(s). Aucune création.`);
    }
    } catch (error) {
      if (importTxActive) {
        try {
          await rollbackImportTransaction();
        } catch (rollbackErr) {
          console.error("Rollback import:", rollbackErr);
        }
        setImportRows(markImportRowsCancelled(updatedRows));
        toast.error(
          "Import annulé suite à une erreur technique. Aucune donnée n'a été enregistrée."
        );
      }
      console.error("Import clients:", error);
      setImporting(false);
      setImportCompleted(true);
    }
  };

  const handleClose = () => {
    setFile(null);
    setColumns([]);
    setRows([]);
    setMapping({});
    setStep("upload");
    setImportRows([]);
    setImportCompleted(false);
    setImporting(false);
    setError(null);
    onOpenChange(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    const refresh = importCompleted;
    handleClose();
    if (refresh) {
      onSuccess();
      void runFullEtiquettesRecalc().catch((e) =>
        console.error("Recalcul étiquettes après import:", e)
      );
    }
  };

  const handleFinishImport = () => {
    const refresh = importCompleted;
    handleClose();
    if (refresh) {
      onSuccess();
      void runFullEtiquettesRecalc().catch((e) =>
        console.error("Recalcul étiquettes après import:", e)
      );
    }
  };

  const successCount = importRows.filter((r) => r.status === "success").length;
  const errorCount = importRows.filter((r) => r.status === "error").length;
  const skippedCount = importRows.filter(
    (r) => r.status === "skipped" || (r.status === "duplicate" && duplicateAction === "skip")
  ).length;
  const duplicateCount = importRows.filter((r) => r.status === "duplicate").length;
  const ambiguousDuplicateCount = importRows.filter(
    (r) => r.status === "duplicate" && r.data._identityConflict && r.data._duplicateSource === "database"
  ).length;
  const pendingCount = importRows.filter((r) => r.status === "pending").length;

  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
                <li>👥 <strong>FILLEUL</strong> = Colonne « Prospects Filleuls » = OUI → statut réseau (onglet Filleuls), pas client</li>
              </ul>
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {pendingCount} contact{pendingCount > 1 ? "s" : ""} prêt{pendingCount > 1 ? "s" : ""} à être importé{pendingCount > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {duplicateCount > 0 && duplicateAction === "consolidate" && (
                      <>
                        Les doublons = même personne (souvent plusieurs investissements dans le
                        fichier). Ils seront fusionnés, pas recréés.{" "}
                      </>
                    )}
                    Import atomique : une erreur technique annule tout le fichier (pas les lignes
                    ignorées).
                  </p>
                  {duplicateCount > 0 && (
                    <p className="text-sm text-orange-600">
                      {duplicateCount} doublon{duplicateCount > 1 ? "s" : ""} dans le fichier
                      {ambiguousDuplicateCount > 0 && (
                        <span className="text-amber-700">
                          {" "}
                          — dont {ambiguousDuplicateCount} homonyme
                          {ambiguousDuplicateCount > 1 ? "s" : ""} en base (email/tél différents,
                          ligne ignorée)
                        </span>
                      )}
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
                    
                    const { categorie: previewClientCat, filleul_categorie: previewFilleulCat } =
                      resolveImportContactCategories(!!hasProduit, !!hasContact, !!isFilleul);
                    const finalCategorie = previewFilleulCat
                      ? `${previewClientCat === "AUCUN" ? "" : previewClientCat + " · "}${previewFilleulCat}`
                      : previewClientCat;
                    
                    return (
                      <tr key={idx} className="border-t">
                        <td className="p-2">
                          {row.status === "duplicate" && (
                            <Badge
                              variant="outline"
                              className={
                                row.data._identityConflict
                                  ? "bg-amber-50 text-amber-900 border-amber-300"
                                  : "bg-orange-50 text-orange-800"
                              }
                            >
                              {row.data._identityConflict ? "Homonyme ?" : "Doublon"}
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
                              previewClientCat === "CLIENT"
                                ? "bg-green-50 text-green-700 border-green-300"
                                : previewFilleulCat
                                ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                                : previewClientCat === "PROSPECT_CLIENT"
                                ? "bg-purple-50 text-purple-700 border-purple-300"
                                : "bg-slate-50 text-slate-700 border-slate-300"
                            }
                          >
                            {(finalCategorie || previewClientCat).replace(/_/g, " ")}
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
            <div className="flex items-center justify-around text-center flex-wrap gap-4">
              <div>
                <div className="text-2xl font-bold text-green-600">{successCount}</div>
                <div className="text-sm text-muted-foreground">Traités OK</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                <div className="text-sm text-muted-foreground">Erreurs</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-500">{skippedCount}</div>
                <div className="text-sm text-muted-foreground">Ignorés</div>
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
                    {(row.status === "skipped" ||
                      (row.status === "duplicate" && duplicateAction === "skip")) && (
                      <AlertCircle className="h-4 w-4 text-slate-500" />
                    )}
                    {row.status === "pending" && <span className="text-xs text-muted-foreground">En attente...</span>}
                  </div>
                </div>
              ))}
            </div>

            {!importing && (
              <DialogFooter>
                <Button onClick={handleFinishImport}>Fermer</Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Modale de regroupement par foyer */}
    <FoyerGroupingModal
      open={showFoyerGrouping}
      onOpenChange={setShowFoyerGrouping}
      importedContacts={importedContactsList}
      onSuccess={async () => {
        setShowFoyerGrouping(false);
        handleClose();
        try {
          await onSuccess();
        } catch (error) {
          console.error("Error reloading contacts:", error);
        }
      }}
    />
    </>
  );
}
