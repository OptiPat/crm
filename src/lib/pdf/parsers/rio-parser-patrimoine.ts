// Parser spécialisé pour extraire le patrimoine détaillé des RIO
import type { ExtractedData } from "../types";

/**
 * Extrait un montant en euros du texte
 * Gère les formats : "23 406 €", "23406", "23 406,00 €", "268 043,00 €"
 */
function extractMontant(pattern: RegExp, text: string): number | undefined {
  const match = text.match(pattern);
  if (match) {
    // Nettoyer : 
    // 1. Enlever les espaces et €
    let cleaned = match[1].replace(/[\s€]/g, "");
    
    // 2. Remplacer la virgule décimale par un point
    cleaned = cleaned.replace(",", ".");
    
    // 3. Parser comme float puis arrondir
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : Math.round(num);
  }
  return undefined;
}

/**
 * Extrait l'adresse complète du RIO
 */
export function extractAdresseComplete(text: string): {
  adresse?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
} {
  // Pattern pour "Adresse postale : * 39 rue de la figairasse 34070 MONTPELLIER"
  const pattern = /Adresse\s+postale\s*:\s*\*?\s*([^\n]+?)\s+(\d{5})\s+([A-ZÀ-Ü\s-]+?)(?:\s+France|\n|$)/i;
  const match = text.match(pattern);

  if (match) {
    return {
      adresse: match[1].trim(),
      codePostal: match[2],
      ville: match[3].trim(),
      pays: "France",
    };
  }

  return {};
}

/**
 * Extrait la résidence principale (valeur + prêt)
 */
export function extractResidencePrincipale(text: string): {
  valeur?: number;
  pret?: number;
  mensualite?: number;
} {
  // Pattern : capturer uniquement le PREMIER montant après "Résidence principale - RP"
  const rpValeur = extractMontant(
    /Résidence\s+principale\s*-\s*RP\s+([\d\s,]+)\s*€/i,
    text
  );

  // Pattern pour crédit : chercher après "Crédit immobilier - RP"
  // Format attendu : "Crédit immobilier - RP Mathilde D. 10 395 € 169 923 €"
  const creditPattern = /Crédit\s+immobilier\s*-\s*RP[^\n]+?([\d\s,]+)\s*€[^\n]+?([\d\s,]+)\s*€/i;
  const creditMatch = text.match(creditPattern);
  
  let rpPret: number | undefined;
  let echeanceAnnuelle: number | undefined;
  
  if (creditMatch) {
    // Le premier montant est l'échéance annuelle, le second est le CRD
    const montant1 = creditMatch[1].replace(/[\s,]/g, "").replace(",", ".");
    const montant2 = creditMatch[2].replace(/[\s,]/g, "").replace(",", ".");
    
    echeanceAnnuelle = parseInt(montant1, 10);
    rpPret = parseInt(montant2, 10);
  }

  const mensualite = echeanceAnnuelle ? Math.round(echeanceAnnuelle / 12) : undefined;

  return {
    valeur: rpValeur,
    pret: rpPret,
    mensualite,
  };
}

/**
 * Extrait les liquidités (Livrets + comptes)
 */
export function extractLiquidites(text: string): {
  livretA?: number;
  compteCourant?: number;
  ldd?: number;
  total?: number;
} {
  // Pattern : capturer uniquement le PREMIER montant
  const livretA = extractMontant(/Livret\s+A\s*-\s*LA\s+([\d\s,]+)\s*€/i, text);
  const compteCourant = extractMontant(/Compte\s+courant\s*-\s*CC\s+([\d\s,]+)\s*€/i, text);
  const ldd = extractMontant(
    /Livret\s+de\s+Développement\s+Durable[^\n]*?LDD\s+([\d\s,]+)\s*€/i,
    text
  );

  // Court terme total : capturer le PREMIER montant
  const courtTerme = extractMontant(/Court\s+terme\s+([\d\s,]+)\s*€/i, text);

  return {
    livretA,
    compteCourant,
    ldd,
    total: courtTerme,
  };
}

/**
 * Extrait l'assurance vie
 */
export function extractAssuranceVie(text: string): number | undefined {
  // Pattern 1 : "Assurance-vie - AV 30 237 €"
  let av = extractMontant(/Assurance-vie\s*-\s*AV\s+([\d\s,]+)\s*€/i, text);
  
  // Pattern 2 : Si pas trouvé, chercher dans "Long terme"
  if (!av) {
    av = extractMontant(/Long\s+terme\s+([\d\s,]+)\s*€/i, text);
  }
  
  return av;
}

/**
 * Extrait le PER
 */
export function extractPER(text: string): number | undefined {
  // Pattern : capturer uniquement le PREMIER montant après "PER"
  return extractMontant(/\bPER\s+([\d\s,]+)\s*€/i, text);
}

/**
 * Extrait les SCPI
 */
export function extractSCPI(text: string): number | undefined {
  // Pattern : capturer uniquement le PREMIER montant
  return extractMontant(/\bSCPI\s+([\d\s,]+)\s*€/i, text);
}

/**
 * Extrait le patrimoine total
 */
export function extractPatrimoineTotal(text: string): {
  patrimoineTotal?: number;
  patrimoineNet?: number;
} {
  const actifsBruts = extractMontant(
    /TOTAL\s+DES\s+ACTIFS\s+BRUTS\s*:\s*([\d\s€,]+)/i,
    text
  );
  const passifs = extractMontant(/TOTAL\s+DES\s+PASSIFS\s*:\s*([\d\s€,]+)/i, text);

  const patrimoineNet =
    actifsBruts && passifs ? actifsBruts - passifs : undefined;

  return {
    patrimoineTotal: actifsBruts,
    patrimoineNet,
  };
}

/**
 * Extrait les charges totales
 */
export function extractChargesTotal(text: string): number | undefined {
  return extractMontant(/TOTAL\s+DES\s+CHARGES\s*:\s*([\d\s€,]+)/i, text);
}

/**
 * Extrait la profession exacte
 */
export function extractProfessionExacte(text: string): string | undefined {
  const pattern = /Profession\s*:\s*\*?\s*([^\n]+?)(?:\s+Nom\s+de\s+la\s+société|$|\n)/i;
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Extrait la date de mariage
 */
export function extractDateMariage(text: string): string | undefined {
  const pattern = /Date\s+de\s+mariage\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i;
  const match = text.match(pattern);
  return match ? match[1] : undefined;
}

/**
 * Parse tout le patrimoine du RIO
 */
export function parsePatrimoineRIO(text: string): Partial<ExtractedData> {
  const adresse = extractAdresseComplete(text);
  const rp = extractResidencePrincipale(text);
  const liquidites = extractLiquidites(text);
  const assuranceVie = extractAssuranceVie(text);
  const per = extractPER(text);
  const scpi = extractSCPI(text);
  const { patrimoineTotal, patrimoineNet } = extractPatrimoineTotal(text);
  const chargesTotal = extractChargesTotal(text);
  const profession = extractProfessionExacte(text);
  const dateRegime = extractDateMariage(text);

  // Calculer la somme totale de l'épargne
  const epargneTotal = 
    (liquidites.total || 0) + 
    (assuranceVie || 0) + 
    (per || 0) + 
    (scpi || 0);

  // Debug
  console.log("📊 Patrimoine extrait:", {
    liquiditesTotal: liquidites.total,
    livretA: liquidites.livretA,
    compteCourant: liquidites.compteCourant,
    ldd: liquidites.ldd,
    assuranceVie,
    per,
    epargneTotal,
  });

  return {
    // Adresse
    ...adresse,

    // Profession
    profession,

    // Patrimoine immobilier
    residencePrincipale: {
      valeur: rp.valeur,
      pret: rp.pret,
      mensualite: rp.mensualite,
    },

    // Patrimoine financier - Total épargne + détails
    epargneTotal,
    liquidites: liquidites.total,
    livretA: liquidites.livretA,
    compteCourant: liquidites.compteCourant,
    ldd: liquidites.ldd,
    assuranceVie,
    per,
    scpi,

    // Totaux
    patrimoineTotal,
    patrimoineNet,

    // Charges
    chargesTotal,

    // Date de mariage
    dateRegime,
  };
}
