// Parser générique pour extraire les données courantes
import type { ExtractedData } from "../types";

/**
 * Extrait les emails d'un texte
 */
export function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extrait les numéros de téléphone français
 */
export function extractPhones(text: string): string[] {
  // Patterns pour téléphones français
  const patterns = [
    /(?:0|\+33\s?)[1-9](?:[\s.-]?\d{2}){4}/g, // 06 12 34 56 78 ou +33 6 12 34 56 78
    /(?:0|\+33)[1-9]\d{8}/g, // 0612345678
  ];

  const phones = new Set<string>();

  patterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((phone) => {
        // Normaliser le format
        const cleaned = phone.replace(/[\s.-]/g, "");
        phones.add(cleaned);
      });
    }
  });

  return Array.from(phones);
}

/**
 * Extrait les dates au format français
 */
export function extractDates(text: string): string[] {
  const dateRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g;
  const matches = text.match(dateRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extrait les codes postaux français
 */
export function extractPostalCodes(text: string): string[] {
  const postalCodeRegex = /\b\d{5}\b/g;
  const matches = text.match(postalCodeRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extrait la civilité
 */
export function extractCivilite(text: string): string | undefined {
  // Pattern 1 : Chercher précisément après "Civilité : *"
  // Format RIO : "Civilité : *   Monsieur" ou "Civilité : *   Madame"
  const civilitePattern = /Civilit[ée]\s*:\s*\*?\s*(Monsieur|Madame|M\.|Mme|M |Mme\.)/i;
  const match = text.match(civilitePattern);
  
  if (match) {
    const civiliteText = match[1].toLowerCase();
    if (civiliteText.includes("madame") || civiliteText.includes("mme")) {
      return "MME";
    }
    if (civiliteText.includes("monsieur") || civiliteText.startsWith("m")) {
      return "M";
    }
  }
  
  // Fallback : recherche dans les premières lignes du document seulement
  const firstPart = text.substring(0, 2000).toLowerCase();
  
  // Éviter les faux positifs en cherchant le mot seul
  if (/\bmonsieur\b/.test(firstPart) && !/\bmadame\b/.test(firstPart)) {
    return "M";
  }
  if (/\bmadame\b/.test(firstPart) && !/\bmonsieur\b/.test(firstPart)) {
    return "MME";
  }

  return undefined;
}

/**
 * Extrait un nom et prénom potentiels
 */
export function extractNomPrenom(text: string): {
  nom?: string;
  prenom?: string;
} {
  // Pattern 1: "Nom / prénom : * NOM Prénom"
  const pattern1 =
    /Nom\s*\/\s*pr[ée]nom\s*:\s*\*?\s*([A-ZÀ-ÜÉÈ'][A-ZÀ-ÜÉÈ'\s-]+?)\s+([A-ZÀ-ÜÉÈ'][a-zà-üéèê'-]+?)(?:\s+Nom\s+de|$|\s+N[ée])/i;
  const match1 = text.match(pattern1);

  if (match1) {
    return {
      nom: match1[1].trim(),
      prenom: match1[2].trim(),
    };
  }

  // Pattern 2: Chercher "Nom : XXX" et "Prénom : YYY" séparément
  // Pour le nom, on s'arrête avant "Nom de naissance"
  const nomMatch = /Nom\s*:\s*\*?\s*([A-ZÀ-ÜÉÈ'][A-ZÀ-ÜÉÈ'\s-]+?)(?:\s+Nom\s+de|$|\n)/i.exec(text);
  const prenomMatch = /Pr[ée]nom\s*:\s*\*?\s*([A-ZÀ-ÜÉÈ'][a-zà-üéèê'-]+?)(?:\s|$|\n)/i.exec(text);

  return {
    nom: nomMatch ? nomMatch[1].trim() : undefined,
    prenom: prenomMatch ? prenomMatch[1].trim() : undefined,
  };
}

/**
 * Extrait la date de naissance
 */
export function extractDateNaissance(text: string): string | undefined {
  // Pattern: "Né(e) le : 19/07/1995"
  const pattern = /N[ée]\(e\)\s+le\s*:\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i;
  const match = text.match(pattern);

  if (match) {
    return match[1];
  }

  return undefined;
}

/**
 * Extrait l'adresse
 */
export function extractAdresse(text: string): {
  adresse?: string;
  codePostal?: string;
  ville?: string;
} {
  // Pattern: "Adresse : 123 rue de la Paix 75001 PARIS"
  const pattern =
    /Adresse\s*:\s*\*?\s*([^:\n]+?)\s+(\d{5})\s+([A-ZÀ-Ü][A-ZÀ-Ü\s-]+)/i;
  const match = text.match(pattern);

  if (match) {
    return {
      adresse: match[1].trim(),
      codePostal: match[2],
      ville: match[3].trim(),
    };
  }

  return {};
}

/**
 * Extrait la profession
 */
export function extractProfession(text: string): string | undefined {
  const pattern =
    /Profession\s*:\s*\*?\s*([^\n:]+?)(?:\s+Secteur|$|\n)/i;
  const match = text.match(pattern);

  if (match) {
    return match[1].trim();
  }

  return undefined;
}

/**
 * Extrait la situation familiale
 */
export function extractSituationFamiliale(text: string): string | undefined {
  const normalizedText = text.toLowerCase();

  if (normalizedText.includes("marié") || normalizedText.includes("mariée")) {
    return "MARIE";
  }
  if (normalizedText.includes("célibataire")) {
    return "CELIBATAIRE";
  }
  if (normalizedText.includes("pacsé") || normalizedText.includes("pacsée")) {
    return "PACSE";
  }
  if (normalizedText.includes("divorcé") || normalizedText.includes("divorcée")) {
    return "DIVORCE";
  }
  if (normalizedText.includes("veuf") || normalizedText.includes("veuve")) {
    return "VEUF";
  }

  return undefined;
}

/**
 * Parser générique qui extrait toutes les données possibles
 */
export function parseGeneric(text: string): ExtractedData {
  const emails = extractEmails(text);
  const phones = extractPhones(text);
  const { nom, prenom } = extractNomPrenom(text);
  const dateNaissance = extractDateNaissance(text);
  const { adresse, codePostal, ville } = extractAdresse(text);
  const profession = extractProfession(text);
  const situationFamiliale = extractSituationFamiliale(text);
  const civilite = extractCivilite(text);

  return {
    civilite,
    nom,
    prenom,
    dateNaissance,
    email: emails[0],
    telephone: phones[0],
    adresse,
    codePostal,
    ville,
    profession,
    situationFamiliale,
    raw: text,
    confidence: calculateConfidence({
      civilite,
      nom,
      prenom,
      dateNaissance,
      email: emails[0],
      telephone: phones[0],
    }),
  };
}

/**
 * Calcule un score de confiance basé sur le nombre de champs trouvés
 */
function calculateConfidence(data: Partial<ExtractedData>): number {
  const fields = [
    data.civilite,
    data.nom,
    data.prenom,
    data.dateNaissance,
    data.email,
    data.telephone,
  ];
  const foundFields = fields.filter((f) => f !== undefined).length;
  return Math.round((foundFields / fields.length) * 100);
}
