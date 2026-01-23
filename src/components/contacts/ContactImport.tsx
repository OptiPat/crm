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
import { createFoyer, getAllFoyers } from "@/lib/api/tauri-foyers";
// famille_id n'est plus utilisé - les familles sont groupées dynamiquement par nom
import { Badge } from "@/components/ui/badge";
import { invoke } from "@tauri-apps/api/core";
import { FoyerGroupingModal } from "@/components/foyers/FoyerGroupingModal";

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

// ============================================
// DÉTECTION DES CONTACTS "COUPLES" (FOYERS)
// ============================================

// Extraire le nom de famille principal d'un nom composé (ex: "NOM1 et NOM2" → "NOM1-NOM2")
const extractCompositeName = (nom: string): string => {
  // Si le nom contient "et" ou "&", créer un nom composé
  if (nom.includes(" et ") || nom.includes(" & ")) {
    const parts = nom.split(/ et | & /).map(p => p.trim());
    return parts.join("-");
  }
  return nom;
};

// Détecter si un nom/prénom est un couple (ex: "Marie et Pierre")
const isContactCouple = (prenom: string, _nom: string): boolean => {
  const prenomLower = prenom.toLowerCase();
  return prenomLower.includes(" et ") || prenomLower.includes(" & ");
};

// Extraire les 2 prénoms d'un couple
const extractCoupleNames = (prenomCouple: string): { prenom1: string; prenom2: string } | null => {
  const separators = [" et ", " & ", " ET ", " Et "];
  
  for (const sep of separators) {
    if (prenomCouple.includes(sep)) {
      const parts = prenomCouple.split(sep).map(p => p.trim());
      if (parts.length === 2) {
        return { prenom1: parts[0], prenom2: parts[1] };
      }
    }
  }
  
  return null;
};

// Extraire les noms individuels d'un nom composé (ex: "NOM1 et Aurel" → ["NOM1", "NOM2"])
const extractIndividualNames = (nom: string): { nom1: string; nom2: string } | null => {
  if (nom.includes(" et ") || nom.includes(" & ")) {
    const parts = nom.split(/ et | & /).map(p => p.trim().toUpperCase());
    if (parts.length >= 2) {
      return { nom1: parts[0], nom2: parts[1] };
    }
  }
  return null;
};

// Trouver le foyer correspondant à un couple
const findFoyerForCouple = async (
  nom: string,
  prenom1: string,
  prenom2: string,
  allContacts: Contact[]
): Promise<number | null> => {
  const nomUpper = nom.toUpperCase();
  const prenom1Upper = prenom1.toUpperCase();
  const prenom2Upper = prenom2.toUpperCase();
  
  // 🔥 FIX: Extraire les noms individuels si c'est un nom composé
  const individualNames = extractIndividualNames(nom);
  const nom1 = individualNames?.nom1 || nomUpper;
  const nom2 = individualNames?.nom2 || nomUpper;
  
  // Chercher contact1: nom = nom1 (ou nom complet) ET prenom = prenom1
  const contact1 = allContacts.find(c => 
    (c.nom.toUpperCase() === nom1 || c.nom.toUpperCase() === nomUpper) && 
    c.prenom.toUpperCase() === prenom1Upper
  );
  
  // Chercher contact2: nom = nom2 (ou nom complet) ET prenom = prenom2
  const contact2 = allContacts.find(c => 
    (c.nom.toUpperCase() === nom2 || c.nom.toUpperCase() === nomUpper) && 
    c.prenom.toUpperCase() === prenom2Upper
  );
  
  if (contact1 && contact2) {
    if (contact1.foyer_id && contact1.foyer_id === contact2.foyer_id) {
      return contact1.foyer_id;
    }
  }
  
  return null;
};

interface ImportResult {
  shouldSkipContact: boolean;
  foyerId: number | null;
  contact1: Contact | null;
  contact2: Contact | null;
  prenom1?: string;
  prenom2?: string;
  nom1?: string; // Nom individuel du contact 1
  nom2?: string; // Nom individuel du contact 2
  shouldCreateContacts?: boolean; // Si true, il faut créer LES DEUX contacts
  shouldCreateContact1?: boolean; // Si true, il faut créer seulement contact1
  shouldCreateContact2?: boolean; // Si true, il faut créer seulement contact2
}

// Analyser si c'est un contact couple et trouver/créer le foyer
const analyzeCoupleContact = async (
  prenom: string,
  nom: string,
  allContacts: Contact[]
): Promise<ImportResult> => {
  if (!isContactCouple(prenom, nom)) {
    return { shouldSkipContact: false, foyerId: null, contact1: null, contact2: null };
  }
  
  const names = extractCoupleNames(prenom);
  if (!names) {
    return { shouldSkipContact: false, foyerId: null, contact1: null, contact2: null };
  }
  
  const { prenom1, prenom2 } = names;
  const nomUpper = nom.toUpperCase();
  const prenom1Upper = prenom1.toUpperCase();
  const prenom2Upper = prenom2.toUpperCase();
  
  // 🔥 FIX: Extraire les noms individuels si c'est un nom composé (ex: "NOM1 et Aurel")
  const individualNames = extractIndividualNames(nom);
  const nom1 = individualNames?.nom1 || nomUpper;
  const nom2 = individualNames?.nom2 || nomUpper;
  
  // Chercher contact1: nom = nom1 (ou nom complet) ET prenom = prenom1
  const contact1 = allContacts.find(c => 
    (c.nom.toUpperCase() === nom1 || c.nom.toUpperCase() === nomUpper) && 
    c.prenom.toUpperCase() === prenom1Upper
  );
  
  // Chercher contact2: nom = nom2 (ou nom complet) ET prenom = prenom2
  const contact2 = allContacts.find(c => 
    (c.nom.toUpperCase() === nom2 || c.nom.toUpperCase() === nomUpper) && 
    c.prenom.toUpperCase() === prenom2Upper
  );
  
  // CAS 1: Les deux contacts existent
  if (contact1 && contact2) {
    const foyerId = await findFoyerForCouple(nom, prenom1, prenom2, allContacts);
    
    if (foyerId) {
      return { 
        shouldSkipContact: true,
        foyerId,
        contact1,
        contact2,
        prenom1,
        prenom2,
        nom1,
        nom2
      };
    } else {
      return {
        shouldSkipContact: true,
        foyerId: null,
        contact1,
        contact2,
        prenom1,
        prenom2,
        nom1,
        nom2,
        shouldCreateContacts: false
      };
    }
  }
  
  // 🔥 CAS 2.5: UN SEUL contact existe → créer seulement le manquant
  if (contact1 && !contact2) {
    return {
      shouldSkipContact: true,
      foyerId: contact1.foyer_id || null,
      contact1,
      contact2: null,
      prenom1,
      prenom2,
      nom1,
      nom2,
      shouldCreateContact2: true // Créer seulement contact2
    };
  }
  
  if (!contact1 && contact2) {
    return {
      shouldSkipContact: true,
      foyerId: contact2.foyer_id || null,
      contact1: null,
      contact2,
      prenom1,
      prenom2,
      nom1,
      nom2,
      shouldCreateContact1: true // Créer seulement contact1
    };
  }
  
  // CAS 3: Aucun contact n'existe → créer les deux
  return {
    shouldSkipContact: true,
    foyerId: null,
    contact1: null,
    contact2: null,
    prenom1,
    prenom2,
    nom1,
    nom2,
    shouldCreateContacts: true
  };
};

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
  const [_file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing">("upload");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "merge" | "consolidate">("consolidate");
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
      const seenInImport = new Map<string, { rowIndex: number }>();
      
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

        // Créer une clé unique basée sur Nom+Prénom
        const contactKey = contactData.nom && contactData.prenom 
          ? `${String(contactData.nom).toLowerCase()}_${String(contactData.prenom).toLowerCase()}`
          : null;

        // Détecter les doublons dans l'Excel lui-même (priorité 1)
        let isDuplicate = false;
        let duplicateContact = null;
        let duplicateSource = null;
        let firstOccurrenceInExcel = null;

        if (contactKey && seenInImport.has(contactKey)) {
          // C'est un doublon dans l'Excel (même contact, potentiellement avec un autre investissement)
          // On le marque comme doublon pour qu'il soit CONSOLIDÉ (pas ignoré, pas créé en double)
          firstOccurrenceInExcel = seenInImport.get(contactKey)!;
          isDuplicate = true;
          duplicateSource = "excel";
        } else if (contactKey) {
          // Marquer ce contact comme vu dans l'Excel
          seenInImport.set(contactKey, { rowIndex: idx });
          
          // Détecter les doublons dans la BDD existante (priorité 2)
          duplicateContact = existingContacts.find(contact => {
            // Doublon par Nom + Prénom (le plus important pour ce cas d'usage)
            if (contactData.nom && contactData.prenom) {
              const sameName = contact.nom.toLowerCase() === String(contactData.nom).toLowerCase() &&
                             contact.prenom.toLowerCase() === String(contactData.prenom).toLowerCase();
              if (sameName) return true;
            }
            // Doublon par Email
            if (contactData.email && contact.email === contactData.email) return true;
            // Doublon par Téléphone
            if (contactData.telephone && contact.telephone === contactData.telephone) return true;
            return false;
          });
          
          isDuplicate = !!duplicateContact;
          if (isDuplicate) {
            duplicateSource = "database";
          }
        }

        return {
          data: { 
            ...contactData, 
            _duplicateContactId: duplicateContact?.id,
            _duplicateSource: duplicateSource,
            _firstOccurrenceRowIndex: firstOccurrenceInExcel?.rowIndex,
          },
          status: isDuplicate ? "duplicate" : "pending",
          message: isDuplicate 
            ? (duplicateSource === "excel" 
                ? `Doublon dans l'Excel (→ ligne ${firstOccurrenceInExcel!.rowIndex + 1})`
                : `Doublon en base (${duplicateContact?.prenom} ${duplicateContact?.nom})`)
            : undefined,
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
      // Cela permet de gérer les lignes "Marie et Pierre" qui sont marquées comme doublons
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
              
              // Parser la date de naissance de la ligne actuelle (si présente)
              let rowDateNaissance: string | undefined;
              if (row.data.date_naissance) {
                const dateStr = String(row.data.date_naissance).trim();
                if (dateStr) {
                  const excelDate = parseFloat(dateStr);
                  if (!isNaN(excelDate) && excelDate > 1) {
                    const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
                    if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1900 && jsDate.getFullYear() < 2100) {
                      rowDateNaissance = jsDate.toISOString();
                    }
                  }
                }
              }
              
              // 🔥 Parser la date de suivi de la ligne actuelle (si présente)
              let rowDateDernierContact: string | undefined;
              if (row.data.dernier_rdv && row.data.dernier_rdv !== "-") {
                const dernierRdvStr = String(row.data.dernier_rdv).trim();
                const excelDate = parseFloat(dernierRdvStr);
                if (!isNaN(excelDate) && excelDate > 1) {
                  const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
                  if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1950) {
                    rowDateDernierContact = jsDate.toISOString();
                  }
                }
              }
              
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
                  } else if (produitUpper.includes('IMMOBILIER') || produitUpper.includes('PINEL') || produitUpper.includes('MALRAUX')) {
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
                  
                  // Parser la date de souscription
                  let dateSouscription = null;
                  let dateSouscriptionDate = null; // Garder l'objet Date pour calcul démembrement
                  if (row.data.date_souscription) {
                    const excelDate = parseFloat(String(row.data.date_souscription));
                    if (!isNaN(excelDate) && excelDate > 1) {
                      const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
                      dateSouscription = jsDate.toISOString();
                      dateSouscriptionDate = jsDate;
                    }
                  }
                  
                  // Calculer la date de fin de démembrement
                  let dateFinDemembrement = null;
                  let dureeDemembrement = null;
                  let isViager = false;
                  
                  const modeDetention = row.data.mode_detention ? String(row.data.mode_detention).trim().toUpperCase() : '';
                  const isPP = modeDetention === 'PP' || modeDetention === 'PLEINE PROPRIÉTÉ' || modeDetention === 'PLEINE PROPRIETE';
                  
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
                    versement_programme: montantVP ? true : false,
                    montant_versement_programme: montantVP || undefined,
                    reinvestissement_dividendes: reinvestissement,
                    notes: investissementNotes || undefined,
                  };
                  
                  const result = await createOrUpdateInvestissement(newInvestissement);
                  investissementCree = result.created;
                } catch (invError) {
                  console.error(`❌ Erreur création investissement pour contact ${existingContactId}:`, invError);
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
        
        const coupleAnalysis = await analyzeCoupleContact(
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
              const existingFoyer = allFoyersCache.find(f => 
                f.nom.toUpperCase().includes(nomFamilleCompose.toUpperCase()) ||
                nomFamilleCompose.toUpperCase().includes(f.nom.replace(/^(Foyer|Famille)\s+/i, "").toUpperCase())
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
                await updateContact(coupleAnalysis.contact1.id, {
                  ...coupleAnalysis.contact1,
                  foyer_id: foyerToUse.id,
                  role_foyer: "DECLARANT_1",
                  date_naissance: coupleAnalysis.contact1.date_naissance 
                    ? new Date(coupleAnalysis.contact1.date_naissance * 1000).toISOString() 
                    : undefined,
                  date_dernier_contact: coupleAnalysis.contact1.date_dernier_contact 
                    ? new Date(coupleAnalysis.contact1.date_dernier_contact * 1000).toISOString() 
                    : undefined,
                  date_prochain_suivi: coupleAnalysis.contact1.date_prochain_suivi 
                    ? new Date(coupleAnalysis.contact1.date_prochain_suivi * 1000).toISOString() 
                    : undefined,
                });
              }
              
              if (coupleAnalysis.contact2.foyer_id !== foyerToUse.id) {
                await updateContact(coupleAnalysis.contact2.id, {
                  ...coupleAnalysis.contact2,
                  foyer_id: foyerToUse.id,
                  role_foyer: "DECLARANT_2",
                  date_naissance: coupleAnalysis.contact2.date_naissance 
                    ? new Date(coupleAnalysis.contact2.date_naissance * 1000).toISOString() 
                    : undefined,
                  date_dernier_contact: coupleAnalysis.contact2.date_dernier_contact 
                    ? new Date(coupleAnalysis.contact2.date_dernier_contact * 1000).toISOString() 
                    : undefined,
                  date_prochain_suivi: coupleAnalysis.contact2.date_prochain_suivi 
                    ? new Date(coupleAnalysis.contact2.date_prochain_suivi * 1000).toISOString() 
                    : undefined,
                });
              }
              
              // 🔥 FIX: Mettre à jour le cache pour que les prochaines lignes trouvent le foyer
              const idx1 = allContactsCache.findIndex(c => c.id === coupleAnalysis.contact1!.id);
              const idx2 = allContactsCache.findIndex(c => c.id === coupleAnalysis.contact2!.id);
              if (idx1 !== -1) {
                allContactsCache[idx1] = { ...allContactsCache[idx1], foyer_id: foyerToUse.id };
              }
              if (idx2 !== -1) {
                allContactsCache[idx2] = { ...allContactsCache[idx2], foyer_id: foyerToUse.id };
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
              const existingFoyer = allFoyersCache.find(f => 
                f.nom.toUpperCase().includes(nomFamilleCompose.toUpperCase()) ||
                nomFamilleCompose.toUpperCase().includes(f.nom.replace(/^(Foyer|Famille)\s+/i, "").toUpperCase())
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
              
              // Créer le contact manquant
              if (coupleAnalysis.shouldCreateContact1 && coupleAnalysis.contact2) {
                // Contact1 n'existe pas, Contact2 existe
                const newContact1: NewContact = {
                  nom: nom1,
                  prenom: coupleAnalysis.prenom1,
                  foyer_id: foyerToUse.id,
                  role_foyer: "DECLARANT_1",
                  categorie: "CLIENT",
                  statut_suivi: "ACTIF",
                };
                const createdContact1 = await createContact(newContact1);
                allContactsCache.push(createdContact1);
                
                // Mettre à jour contact2 pour le rattacher au foyer
                if (coupleAnalysis.contact2.foyer_id !== foyerToUse.id) {
                  await updateContact(coupleAnalysis.contact2.id, {
                    ...coupleAnalysis.contact2,
                    foyer_id: foyerToUse.id,
                    role_foyer: "DECLARANT_2",
                    date_naissance: coupleAnalysis.contact2.date_naissance 
                      ? new Date(coupleAnalysis.contact2.date_naissance * 1000).toISOString() 
                      : undefined,
                    date_dernier_contact: coupleAnalysis.contact2.date_dernier_contact 
                      ? new Date(coupleAnalysis.contact2.date_dernier_contact * 1000).toISOString() 
                      : undefined,
                  });
                  const idx2 = allContactsCache.findIndex(c => c.id === coupleAnalysis.contact2!.id);
                  if (idx2 !== -1) {
                    allContactsCache[idx2] = { ...allContactsCache[idx2], foyer_id: foyerToUse.id };
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
                  categorie: "CLIENT",
                  statut_suivi: "ACTIF",
                };
                const createdContact2 = await createContact(newContact2);
                allContactsCache.push(createdContact2);
                
                // Mettre à jour contact1 pour le rattacher au foyer
                if (coupleAnalysis.contact1.foyer_id !== foyerToUse.id) {
                  await updateContact(coupleAnalysis.contact1.id, {
                    ...coupleAnalysis.contact1,
                    foyer_id: foyerToUse.id,
                    role_foyer: "DECLARANT_1",
                    date_naissance: coupleAnalysis.contact1.date_naissance 
                      ? new Date(coupleAnalysis.contact1.date_naissance * 1000).toISOString() 
                      : undefined,
                    date_dernier_contact: coupleAnalysis.contact1.date_dernier_contact 
                      ? new Date(coupleAnalysis.contact1.date_dernier_contact * 1000).toISOString() 
                      : undefined,
                  });
                  const idx1 = allContactsCache.findIndex(c => c.id === coupleAnalysis.contact1!.id);
                  if (idx1 !== -1) {
                    allContactsCache[idx1] = { ...allContactsCache[idx1], foyer_id: foyerToUse.id };
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
              
              // Créer le foyer d'abord
              const nomFoyer = `Foyer ${nomFamilleCompose}`;
              const newFoyer = await createFoyer({ 
                nom: nomFoyer,
                type_foyer: "COUPLE"
              });
              
              // Pour les noms composés "X et Y", utiliser le premier nom pour le premier contact
              const nomContact1 = nomFamille.includes(" et ") || nomFamille.includes(" & ")
                ? nomFamille.split(/ et | & /)[0].trim()
                : nomFamille;
              
              const nomContact2 = nomFamille.includes(" et ") || nomFamille.includes(" & ")
                ? nomFamille.split(/ et | & /)[1].trim()
                : nomFamille;
              
              // Créer contact 1 (famille_id n'est plus utilisé - groupement dynamique par nom)
              const newContact1: NewContact = {
                nom: nomContact1,
                prenom: coupleAnalysis.prenom1,
                foyer_id: newFoyer.id,
                role_foyer: "DECLARANT_1",
                categorie: "CLIENT", // Couple avec investissements
                statut_suivi: "ACTIF",
              };
              const createdContact1 = await createContact(newContact1);
              
              // Créer contact 2
              const newContact2: NewContact = {
                nom: nomContact2,
                prenom: coupleAnalysis.prenom2,
                foyer_id: newFoyer.id,
                role_foyer: "DECLARANT_2",
                categorie: "CLIENT",
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

        // Parser la date du dernier RDV de suivi
        let dateDernierContact: Date | null = null;
        
        // Parser la date depuis l'Excel
        if (row.data.dernier_rdv && row.data.dernier_rdv !== "-") {
          const dernierRdvStr = String(row.data.dernier_rdv).trim();
          
          // Essayer de parser comme date Excel (nombre)
          const excelDate = parseFloat(dernierRdvStr);
          if (!isNaN(excelDate) && excelDate > 1) {
            // Conversion date Excel vers objet Date
            // Note: Excel compte depuis le 01/01/1900, donc valeur minimale réaliste > 1
            const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
            
            // Vérifier que la date est valide et raisonnable (après 1950)
            if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1950) {
              dateDernierContact = jsDate;
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
                  break;
                }
              }
            }
            
            // Si pas de match avec les patterns, essayer Date.parse
            if (!dateDernierContact) {
              const parsedDate = new Date(dernierRdvStr);
              if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1950) {
                dateDernierContact = parsedDate;
              }
            }
          }
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

        // Parser la date de naissance (format Excel ou texte)
        let dateNaissance: string | undefined;
        if (row.data.date_naissance) {
          const dateStr = String(row.data.date_naissance).trim();
          if (dateStr) {
            const excelDate = parseFloat(dateStr);
            if (!isNaN(excelDate) && excelDate > 1) {
              // Format Excel (nombre de jours depuis 1900)
              const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
              if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() > 1900 && jsDate.getFullYear() < 2100) {
                dateNaissance = jsDate.toISOString();
              }
            }
          }
        }

        // 🔥 FIX: Vérifier si ce contact existe déjà dans le cache (créé pendant cet import)
        const nomLower = (row.data.nom || "").toLowerCase();
        const prenomLower = (row.data.prenom || "").toLowerCase();
        const existingInCache = allContactsCache.find(c => 
          c.nom.toLowerCase() === nomLower && 
          c.prenom.toLowerCase() === prenomLower
        );
        
        if (existingInCache) {
          // Contact déjà créé pendant cet import (ex: par une ligne couple)
          // → Mettre à jour TOUTES les infos du contact + ajouter les investissements
          try {
            // Mettre à jour le contact avec les infos de la ligne Excel
            const updateData: any = {
              foyer_id: existingInCache.foyer_id, // Garder le foyer
              role_foyer: existingInCache.role_foyer, // Garder le rôle
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
              categorie: categorie, // Recalculer la catégorie
              statut_suivi: existingInCache.statut_suivi || "ACTIF",
              notes: finalNotes || existingInCache.notes,
              date_naissance: dateNaissance || (existingInCache.date_naissance 
                ? new Date(existingInCache.date_naissance * 1000).toISOString() 
                : undefined),
              // 🔥 Prendre la date de suivi la plus RÉCENTE (consolidation multi-lignes)
              date_dernier_contact: getMostRecentDate(dateDernierContactISO, existingInCache.date_dernier_contact),
            };
            
            await updateContact(existingInCache.id, updateData);
            
            // Mettre à jour le cache aussi
            const cacheIdx = allContactsCache.findIndex(c => c.id === existingInCache.id);
            if (cacheIdx !== -1) {
              allContactsCache[cacheIdx] = { ...allContactsCache[cacheIdx], ...updateData };
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
              } else if (produitUpper.includes('IMMOBILIER') || produitUpper.includes('PINEL') || produitUpper.includes('MALRAUX')) {
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
              
              // 🔥 Parser la date de souscription
              let dateSouscription = null;
              let dateSouscriptionDate = null;
              if (row.data.date_souscription) {
                const excelDate = parseFloat(String(row.data.date_souscription));
                if (!isNaN(excelDate) && excelDate > 1) {
                  const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
                  dateSouscription = jsDate.toISOString();
                  dateSouscriptionDate = jsDate;
                }
              }
              
              // 🔥 Calculer la date de fin de démembrement
              let dateFinDemembrement = null;
              let dureeDemembrement: number | string | null = null;
              let isViager = false;
              
              const modeDetention = row.data.mode_detention ? String(row.data.mode_detention).trim().toUpperCase() : '';
              const isPP = modeDetention === 'PP' || modeDetention === 'PLEINE PROPRIÉTÉ' || modeDetention === 'PLEINE PROPRIETE';
              
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
          date_dernier_contact: dateDernierContactISO,
          categorie: categorie,
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
            } else if (produitUpper.includes('IMMOBILIER') || produitUpper.includes('PINEL') || produitUpper.includes('MALRAUX')) {
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
            
            // Parser la date de souscription
            let dateSouscription = null;
            let dateSouscriptionDate = null; // Garder l'objet Date pour calcul démembrement
            if (row.data.date_souscription) {
              const excelDate = parseFloat(String(row.data.date_souscription));
              if (!isNaN(excelDate) && excelDate > 1) {
                const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
                dateSouscription = jsDate.toISOString();
                dateSouscriptionDate = jsDate;
              }
            }
            
            // Calculer la date de fin de démembrement
            let dateFinDemembrement = null;
            let dureeDemembrement = null;
            let isViager = false;
            
            const modeDetention = row.data.mode_detention ? String(row.data.mode_detention).trim().toUpperCase() : '';
            const isPP = modeDetention === 'PP' || modeDetention === 'PLEINE PROPRIÉTÉ' || modeDetention === 'PLEINE PROPRIETE';
            
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
              versement_programme: montantVP ? true : false,
              montant_versement_programme: montantVP || undefined,
              reinvestissement_dividendes: reinvestissement,
              notes: investissementNotes || undefined,
            };
            
            await createOrUpdateInvestissement(newInvestissement);
          } catch (invError) {
            console.error(`❌ Erreur création investissement pour ${row.data.prenom} ${row.data.nom}:`, invError);
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
        } else if (produitUpper.includes('IMMOBILIER') || produitUpper.includes('PINEL') || produitUpper.includes('MALRAUX')) {
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
        
        // Créer l'investissement rattaché au FOYER (via foyer_id, pas contact_id)
        const newInvestissement: NewInvestissement = {
          foyer_id: foyerId,
          contact_id: undefined, // Pas de contact_id pour un investissement de foyer
          type_produit: typeProduit,
          nom_produit: nomProduit,
          partenaire_id: partenaireId || undefined,
          montant_initial: montantInitial || undefined,
          notes: `Investissement commun du couple`,
        };
        
        await createOrUpdateInvestissement(newInvestissement);
      } catch (error) {
        console.error("Erreur investissement foyer:", error);
      }
    }

    setImporting(false);
    
    // Récupérer les contacts nouvellement créés pour la détection des foyers
    const successfulImports = updatedRows.filter(r => r.status === "success");
    
    if (successfulImports.length > 0) {
      try {
        // Récupérer les contacts fraîchement créés
        const allContacts = await getAllContacts();
        
        const newContacts = successfulImports
          .map(row => {
            const contact = allContacts.find(c => 
              c.nom === row.data.nom && c.prenom === row.data.prenom
            );
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
          setImportedContactsList(uniqueContacts);
          setShowFoyerGrouping(true);
          return;
        }
      } catch (error) {
        console.error("📥 [ContactImport] ❌ Erreur détection familles:", error);
      }
    } else {
    }
    
    // Si pas de familles détectées, fermer normalement après 2 secondes
    setTimeout(() => {
      try {
        handleClose();
        
        // Recharger les contacts APRÈS la fermeture de la modale
        setTimeout(async () => {
          try {
            await onSuccess();
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
    <>
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

    {/* Modale de regroupement par foyer */}
    <FoyerGroupingModal
      open={showFoyerGrouping}
      onOpenChange={setShowFoyerGrouping}
      importedContacts={importedContactsList}
      onSuccess={() => {
        // Fermer la modale de regroupement
        setShowFoyerGrouping(false);
        // Fermer la modale d'import
        handleClose();
        // Recharger les contacts
        setTimeout(async () => {
          try {
            await onSuccess();
          } catch (error) {
            console.error("Error reloading contacts:", error);
          }
        }, 100);
      }}
    />
    </>
  );
}
