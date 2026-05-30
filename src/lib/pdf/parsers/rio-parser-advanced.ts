// Parser RIO enrichi - Extraction massive de données
import type { ExtractedData } from "../types";

/**
 * Extrait le nom de naissance
 */
function extractNomNaissance(text: string): string | undefined {
  const pattern = /Nom\s+de\s+naissance\s*:\s*\*?\s*([A-ZÀ-ÜÉÈ'][A-ZÀ-ÜÉÈ'\s-]+?)(?:\s+N[ée]|$|\n)/i;
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Extrait le lieu de naissance
 */
function extractLieuNaissance(text: string): string | undefined {
  const pattern = /N[ée]\(e\)\s+le\s*:.*?à\s+([^(]+?)(?:\(|$)/i;
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Extrait la nationalité
 */
function extractNationalite(text: string): string | undefined {
  const pattern = /Nationalit[ée]\s*:\s*\*?\s*([A-Za-zÀ-ü]+)/i;
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Extrait le régime matrimonial
 */
function extractRegimeMatrimonial(text: string): string | undefined {
  const patterns = [
    /R[ée]gime\s+matrimonial\s*:\s*\*?\s*([^\n:]+?)(?:\s+Date|$|\n)/i,
    /R[ée]gime\s*:\s*\*?\s*([^\n:]+?)(?:\s+Date|$|\n)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

/**
 * Extrait le nombre d'enfants (plusieurs méthodes)
 */
function extractNombreEnfants(text: string): number | undefined {
  // Méthode 1 : Chercher "Nombre d'enfants : X"
  const nombreExplicite = /Nombre\s+d['']enfants?\s*:\s*\*?\s*(\d+)/i;
  const matchNombre = text.match(nombreExplicite);
  if (matchNombre) {
    return parseInt(matchNombre[1], 10);
  }
  
  // Méthode 2 : Chercher les enfants listés DIRECTEMENT dans tout le texte
  // Format RIO : "Prénom NOM (JJ/MM/AAAA)" - apparaît après "Enfants" et avant "SITUATION PROFESSIONNELLE"
  
  // D'abord, chercher si la section "Enfants" existe
  const hasEnfantsSection = /Enfants/i.test(text);
  
  if (hasEnfantsSection) {
    // Chercher tous les patterns d'enfants dans le texte entier
    // (on filtre par contexte après)
    const enfantsPatterns = [
      // Format: "Junior NOM1 (05/05/2020)" ou "Prénom NOM (date)"
      /\b([A-ZÀ-Ü][a-zà-ü]+)\s+([A-ZÀ-Ü]{2,})\s*\((\d{2}\/\d{2}\/\d{4})\)/g,
      // Format: "NOM1 Junior (05/05/2020)"
      /\b([A-ZÀ-Ü]{2,})\s+([A-ZÀ-Ü][a-zà-ü]+)\s*\((\d{2}\/\d{2}\/\d{4})\)/g,
    ];
    
    const enfantsDetectes = new Set<string>();
    
    for (const pattern of enfantsPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Vérifier le contexte : doit être proche de "Enfants" et pas dans d'autres sections
        const matchIndex = match.index;
        const contextBefore = text.substring(Math.max(0, matchIndex - 200), matchIndex).toLowerCase();
        
        // Accepter si on est dans la section enfants (après "enfants" mais pas après "situation professionnelle")
        const isAfterEnfants = contextBefore.includes("enfants");
        const isAfterProfession = contextBefore.includes("profession") || contextBefore.includes("professionnelle");
        
        if (isAfterEnfants && !isAfterProfession) {
          // Vérifier que c'est bien un enfant (pas un nom de société, etc.)
          const fullMatch = match[0];
          const date = match[3];
          
          // Vérifier que la date est dans le passé (année < année courante + 25 ans)
          const annee = parseInt(date.split("/")[2], 10);
          const anneeActuelle = new Date().getFullYear();
          
          if (annee >= anneeActuelle - 30 && annee <= anneeActuelle) {
            const key = fullMatch.toLowerCase();
            if (!enfantsDetectes.has(key)) {
              enfantsDetectes.add(key);
            }
          }
        }
      }
    }
    
    if (enfantsDetectes.size > 0) {
      return enfantsDetectes.size;
    }
    
    // Si "Enfants" existe mais rien trouvé après, et "SITUATION PROFESSIONNELLE" suit directement
    const enfantsVide = /Enfants\s*(?:SITUATION|Profession|$)/i.test(text);
    if (enfantsVide) {
      return 0;
    }
  }
  
  return undefined;
}

/**
 * Extrait les détails des enfants (nom, prénom, date de naissance)
 */
function extractEnfantsDetails(text: string): Array<{ nom?: string; prenom?: string; dateNaissance?: string }> {
  const enfants: Array<{ nom?: string; prenom?: string; dateNaissance?: string }> = [];
  
  // Patterns pour détecter les enfants
  const enfantsPatterns = [
    // Format: "Junior NOM1 (05/05/2020)" - Prénom en minuscules, NOM en majuscules
    {
      regex: /\b([A-ZÀ-Ü][a-zà-ü]+)\s+([A-ZÀ-Ü]{2,})\s*\((\d{2}\/\d{2}\/\d{4})\)/g,
      groups: { prenom: 1, nom: 2, date: 3 }
    },
    // Format: "NOM1 Junior (05/05/2020)" - NOM en majuscules, Prénom en minuscules
    {
      regex: /\b([A-ZÀ-Ü]{2,})\s+([A-ZÀ-Ü][a-zà-ü]+)\s*\((\d{2}\/\d{2}\/\d{4})\)/g,
      groups: { nom: 1, prenom: 2, date: 3 }
    },
  ];
  
  const enfantsDetectes = new Set<string>();
  
  for (const { regex, groups } of enfantsPatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Vérifier le contexte
      const matchIndex = match.index;
      const contextBefore = text.substring(Math.max(0, matchIndex - 200), matchIndex).toLowerCase();
      
      const isAfterEnfants = contextBefore.includes("enfants");
      const isAfterProfession = contextBefore.includes("profession") || contextBefore.includes("professionnelle");
      
      if (isAfterEnfants && !isAfterProfession) {
        const dateStr = match[groups.date];
        const annee = parseInt(dateStr.split("/")[2], 10);
        const anneeActuelle = new Date().getFullYear();
        
        // Vérifier que c'est une date de naissance plausible (enfant < 30 ans)
        if (annee >= anneeActuelle - 30 && annee <= anneeActuelle) {
          const key = match[0].toLowerCase();
          if (!enfantsDetectes.has(key)) {
            enfantsDetectes.add(key);
            
            // Formater le nom et prénom
            const nom = match[groups.nom].toUpperCase();
            const prenom = match[groups.prenom].charAt(0).toUpperCase() + match[groups.prenom].slice(1).toLowerCase();
            
            enfants.push({
              nom,
              prenom,
              dateNaissance: dateStr
            });
          }
        }
      }
    }
  }
  
  return enfants;
}

/**
 * Extrait le statut professionnel
 */
function extractStatutProfessionnel(text: string): string | undefined {
  const normalizedText = text.toLowerCase();

  if (normalizedText.includes("salarié")) return "Salarié";
  if (normalizedText.includes("indépendant") || normalizedText.includes("profession libérale")) return "Indépendant";
  if (normalizedText.includes("retraité")) return "Retraité";
  if (normalizedText.includes("sans emploi") || normalizedText.includes("demandeur d'emploi")) return "Sans emploi";
  if (normalizedText.includes("fonctionnaire")) return "Fonctionnaire";
  if (normalizedText.includes("chef d'entreprise")) return "Chef d'entreprise";

  return undefined;
}

/**
 * Extrait l'employeur
 */
function extractEmployeur(text: string): string | undefined {
  const pattern = /Employeur\s*:\s*\*?\s*([^\n:]+?)(?:\s+Secteur|$|\n)/i;
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Extrait le secteur d'activité
 */
function extractSecteurActivite(text: string): string | undefined {
  const pattern = /Secteur\s+d['']activit[ée]\s*:\s*\*?\s*([^\n:]+?)(?:$|\n)/i;
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Extrait les revenus détaillés
 */
function extractRevenus(text: string): {
  revenusSalaires?: number;
  revenusFonciers?: number;
  revenusFinanciers?: number;
  revenusDividendes?: number;
  revenusTotal?: number;
} {
  const extractNumber = (pattern: RegExp): number | undefined => {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/[\s€,]/g, "").replace(",", ".");
      const num = parseFloat(cleaned);
      return isNaN(num) ? undefined : Math.round(num);
    }
    return undefined;
  };

  // Extraire les revenus salaires
  const salaires = extractNumber(/Salaires?\s+([\d\s,]+)\s*€/i);
  
  // Total des revenus : utiliser pattern strict avec limite
  const totalPattern = /TOTAL\s+DES\s+REVENUS\s*:\s*([\d\s,]+),\d{2}\s*€/i;
  let total = extractNumber(totalPattern);
  
  // Si pas trouvé ou aberrant, utiliser salaires
  if (!total || total > 10000000) {
    total = salaires;
  }

  return {
    revenusSalaires: salaires,
    revenusFonciers: extractNumber(/Revenus?\s+fonciers?\s+([\d\s,]+)\s*€/i),
    revenusFinanciers: extractNumber(/Revenus?\s+financiers?\s+([\d\s,]+)\s*€/i),
    revenusDividendes: extractNumber(/Dividendes?\s+([\d\s,]+)\s*€/i),
    revenusTotal: total,
  };
}

/**
 * Extrait les charges
 */
function extractCharges(text: string): {
  chargesEmprunts?: number;
  chargesPensionsAlimentaires?: number;
  chargesTotal?: number;
} {
  const extractNumber = (pattern: RegExp): number | undefined => {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/[\s€]/g, "");
      const num = parseInt(cleaned, 10);
      return isNaN(num) ? undefined : num;
    }
    return undefined;
  };

  return {
    chargesEmprunts: extractNumber(/Charges?\s+d['']emprunts?\s*:\s*\*?\s*([\d\s€]+)/i),
    chargesPensionsAlimentaires: extractNumber(/Pensions?\s+alimentaires?\s*:\s*\*?\s*([\d\s€]+)/i),
    chargesTotal: extractNumber(/Charges?\s+(?:annuelles?|totales?)\s*:\s*\*?\s*([\d\s€]+)/i),
  };
}

/**
 * Extrait le patrimoine immobilier
 */
function extractPatrimoineImmobilier(text: string): {
  residencePrincipale?: { valeur?: number; pret?: number; mensualite?: number };
  residenceSecondaire?: { valeur?: number; pret?: number };
  immobilierLocatif?: { valeur?: number; pret?: number; loyersAnnuels?: number };
} {
  const extractNumber = (pattern: RegExp): number | undefined => {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/[\s€]/g, "");
      const num = parseInt(cleaned, 10);
      return isNaN(num) ? undefined : num;
    }
    return undefined;
  };

  return {
    residencePrincipale: {
      valeur: extractNumber(/R[ée]sidence\s+principale\s*:?\s*(?:valeur)?\s*\*?\s*([\d\s€]+)/i),
      pret: extractNumber(/R[ée]sidence\s+principale.*?Pr[êe]t\s*:?\s*\*?\s*([\d\s€]+)/i),
      mensualite: extractNumber(/R[ée]sidence\s+principale.*?Mensualit[ée]\s*:?\s*\*?\s*([\d\s€]+)/i),
    },
    residenceSecondaire: {
      valeur: extractNumber(/R[ée]sidence\s+secondaire\s*:?\s*(?:valeur)?\s*\*?\s*([\d\s€]+)/i),
      pret: extractNumber(/R[ée]sidence\s+secondaire.*?Pr[êe]t\s*:?\s*\*?\s*([\d\s€]+)/i),
    },
    immobilierLocatif: {
      valeur: extractNumber(/Immobilier\s+locatif\s*:?\s*(?:valeur)?\s*\*?\s*([\d\s€]+)/i),
      pret: extractNumber(/Immobilier\s+locatif.*?Pr[êe]t\s*:?\s*\*?\s*([\d\s€]+)/i),
      loyersAnnuels: extractNumber(/Loyers?\s+annuels?\s*:?\s*\*?\s*([\d\s€]+)/i),
    },
  };
}

/**
 * Extrait le patrimoine financier
 */
function extractPatrimoineFinancier(text: string): {
  liquidites?: number;
  assuranceVie?: number;
  per?: number;
  scpi?: number;
  actionsObligations?: number;
} {
  const extractNumber = (pattern: RegExp): number | undefined => {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/[\s€]/g, "");
      const num = parseInt(cleaned, 10);
      return isNaN(num) ? undefined : num;
    }
    return undefined;
  };

  return {
    liquidites: extractNumber(/Liquidit[ée]s?\s*:?\s*\*?\s*([\d\s€]+)/i),
    assuranceVie: extractNumber(/Assurance[s]?\s+vie\s*:?\s*\*?\s*([\d\s€]+)/i),
    per: extractNumber(/PER\s*:?\s*\*?\s*([\d\s€]+)/i),
    scpi: extractNumber(/SCPI\s*:?\s*\*?\s*([\d\s€]+)/i),
    actionsObligations: extractNumber(/Actions?\s+[/&]?\s*Obligations?\s*:?\s*\*?\s*([\d\s€]+)/i),
  };
}

/**
 * Extrait les objectifs patrimoniaux du RIO
 */
function extractObjectifs(text: string): string[] {
  const objectifs: string[] = [];
  
  // Patterns spécifiques pour les objectifs du RIO
  const objectifsPatterns = [
    { pattern: /Optimiser\s+la\s+rentabilit[ée]\s+de\s+(?:vos|mes)\s+placements/i, label: "Optimiser la rentabilité des placements" },
    { pattern: /Pr[ée]parer\s+(?:votre|ma)\s+retraite/i, label: "Préparer la retraite" },
    { pattern: /Prot[ée]ger\s+(?:vos|mes)\s+enfants/i, label: "Protéger les enfants" },
    { pattern: /Diversifier\s+(?:votre|mon)\s+patrimoine/i, label: "Diversifier le patrimoine" },
    { pattern: /Transmettre\s+(?:votre|mon)\s+patrimoine/i, label: "Transmettre le patrimoine" },
    { pattern: /D[ée]fiscaliser/i, label: "Défiscalisation" },
    { pattern: /Constituer\s+une\s+[ée]pargne/i, label: "Constituer une épargne" },
    { pattern: /Financer\s+un\s+projet/i, label: "Financer un projet" },
    { pattern: /Compl[ée]ter\s+(?:vos|mes)\s+revenus/i, label: "Compléter les revenus" },
    { pattern: /Se\s+constituer\s+un\s+patrimoine/i, label: "Constituer un patrimoine" },
    { pattern: /Anticiper\s+(?:votre|ma)\s+succession/i, label: "Anticiper la succession" },
    { pattern: /R[ée]duire\s+(?:vos|mes)\s+imp[ôo]ts/i, label: "Réduire les impôts" },
    { pattern: /Valoriser\s+(?:votre|mon)\s+patrimoine/i, label: "Valoriser le patrimoine" },
    { pattern: /Acqu[ée]rir\s+(?:votre|ma)\s+r[ée]sidence/i, label: "Acquérir une résidence" },
    { pattern: /Pr[ée]voir\s+(?:l'avenir|des\s+impr[ée]vus)/i, label: "Prévoir l'avenir" },
    { pattern: /Investir\s+dans\s+l'immobilier/i, label: "Investir dans l'immobilier" },
  ];

  objectifsPatterns.forEach(({ pattern, label }) => {
    if (pattern.test(text)) {
      objectifs.push(label);
    }
  });

  return objectifs;
}

/**
 * Extrait l'horizon de placement
 */
function extractHorizonPlacement(text: string): string | undefined {
  const normalizedText = text.toLowerCase();

  if (normalizedText.includes("long terme")) return "Long terme (>8 ans)";
  if (normalizedText.includes("moyen terme")) return "Moyen terme (4-8 ans)";
  if (normalizedText.includes("court terme")) return "Court terme (<4 ans)";

  return undefined;
}

/**
 * Extrait la capacité d'épargne mensuelle
 */
function extractCapaciteEpargne(text: string): number | undefined {
  const pattern = /Capacit[ée]\s+d['']?[ée]pargne\s+mensuelle\s*:?\s*\*?\s*([\d\s€]+)/i;
  const match = text.match(pattern);
  if (match) {
    const cleaned = match[1].replace(/[\s€]/g, "");
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

/**
 * Extrait les connaissances financières
 */
function extractConnaissancesFinancieres(text: string): string | undefined {
  const normalizedText = text.toLowerCase();

  if (normalizedText.includes("connaissance") && normalizedText.includes("élev")) return "Élevé";
  if (normalizedText.includes("connaissance") && normalizedText.includes("moyen")) return "Moyen";
  if (normalizedText.includes("connaissance") && normalizedText.includes("faible")) return "Faible";

  return undefined;
}

/**
 * Extrait la date du document
 */
function extractDateDocument(text: string): string | undefined {
  // Chercher "Date : XX/XX/XXXX" ou similaire en haut du document
  const patterns = [
    /Date\s*:\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

/**
 * Extrait la date d'entrée en relation
 */
function extractDateEntreeRelation(text: string): string | undefined {
  const patterns = [
    /Date\s+d['']entr[ée]e\s+en\s+relation\s*:\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /entr[ée]e\s+en\s+relation\s*:\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

/**
 * Parse un RIO avec extraction massive de données
 */
export function parseRIOAdvanced(text: string): Partial<ExtractedData> {
  return {
    // Identité
    nomNaissance: extractNomNaissance(text),
    lieuNaissance: extractLieuNaissance(text),
    nationalite: extractNationalite(text),

    // Situation familiale
    regimeMatrimonial: extractRegimeMatrimonial(text),
    nombreEnfants: extractNombreEnfants(text),
    enfants: extractEnfantsDetails(text),

    // Situation professionnelle
    statutProfessionnel: extractStatutProfessionnel(text),
    employeur: extractEmployeur(text),
    secteurActivite: extractSecteurActivite(text),

    // Revenus
    ...extractRevenus(text),

    // Charges
    ...extractCharges(text),

    // Patrimoine immobilier
    ...extractPatrimoineImmobilier(text),

    // Patrimoine financier
    ...extractPatrimoineFinancier(text),

    // Objectifs
    objectifsPrincipaux: extractObjectifs(text),
    horizonPlacement: extractHorizonPlacement(text),
    capaciteEpargneMensuelle: extractCapaciteEpargne(text),

    // Profil investisseur
    connaissancesFinancieres: extractConnaissancesFinancieres(text),

    // Document
    dateDocument: extractDateDocument(text),
    dateEntreeRelation: extractDateEntreeRelation(text),
    typeDocument: "RIO",
  };
}
