// Parser spécialisé pour extraire le patrimoine détaillé des RIO
import type { ExtractedData, BienImmobilier } from "../types";

/**
 * Liste des noms de SCPI connus pour la détection automatique
 * (même quand le mot "SCPI" n'apparaît pas dans le RIO)
 */
const KNOWN_SCPI_NAMES = [
  // SCPI Corum
  "corum origin", "corum xl", "corum eurion",
  // SCPI Primonial
  "primovie", "primopierre", "patrimmo commerce", "patrimmo croissance",
  // SCPI Sofidy
  "immorente", "efimmo", "sofidy europe invest",
  // SCPI Paref
  "novapierre", "interpierre", "atlantique pierre",
  // SCPI Perial
  "pfo2", "pf grand paris", "pf hospitalite europe",
  // SCPI Amundi
  "opcimmo", "rivoli avenir patrimoine",
  // SCPI La Française
  "epargne fonciere", "lf europimmo", "lf grand paris patrimoine",
  // SCPI Arkea
  "transitions europe", "transitions europeennes",
  // SCPI Alderan
  "activimmo",
  // SCPI Sogenial
  "comete", "coeur de regions", "coeur de ville",
  // SCPI Voisin
  "epargne pierre", "epargne pierre europe",
  // SCPI Atland
  "fonciere des praticiens",
  // SCPI AEW
  "laffitte pierre", "fructipierre", "fructiregions",
  // SCPI BNP Paribas
  "accimmo pierre",
  // SCPI Advenis
  "eurovalys",
  // SCPI Fiducial
  "fiducial gerance",
  // SCPI Iroko
  "iroko zen",
  // SCPI Remake
  "remake live",
  // SCPI Altarea
  "alta convictions", "altaconvictions",
  // Autres SCPI courantes
  "pierval sante", "kyaneos pierre", "vendome regions", "cap foncières", "cristal rente",
];

/**
 * Vérifie si un nom correspond à une SCPI connue
 */
function isKnownSCPI(nom: string): boolean {
  const nomNormalized = nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
  
  // Vérifier si le mot "SCPI" est présent
  if (/scpi/i.test(nom)) return true;
  
  // Vérifier si le nom correspond à une SCPI connue
  return KNOWN_SCPI_NAMES.some(scpiName => {
    const scpiNormalized = scpiName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
    return nomNormalized.includes(scpiNormalized) || scpiNormalized.includes(nomNormalized);
  });
}

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
  let av = extractMontant(/Assurance-vie\s*[-–—]\s*AV\s+([\d\s,]+)\s*€/i, text);
  
  // Pattern 2 : Format Stellium "Assurance - vie   -   Cristalliance Avenir   15 372 €"
  // Note: "Assurance - vie" avec espace dans le PDF extrait
  if (!av) {
    av = extractMontant(/Assurance\s*[-–—]?\s*vie\s*[-–—]\s*[^\d]+([\d\s,]+)\s*€/i, text);
  }
  
  // Pattern 3 : Si pas trouvé, chercher dans "Long terme"
  if (!av) {
    av = extractMontant(/Long\s+terme\s+([\d\s,]+)\s*€/i, text);
  }
  
  return av;
}

/**
 * Extrait le PER
 */
export function extractPER(text: string): number | undefined {
  // Pattern 1 : "PER 1 120 €"
  let per = extractMontant(/\bPER\s+([\d\s,]+)\s*€/i, text);
  
  // Pattern 2 : Format Stellium "PER   -   Pertinence Retraite   1 120 €   1 120 €"
  if (!per) {
    per = extractMontant(/\bPER\s*[-–—]\s*[^\d]+([\d\s,]+)\s*€/i, text);
  }
  
  // Pattern 3 : Section "Retraite et Salariale" avec montant
  if (!per) {
    per = extractMontant(/Retraite\s+et\s+Salariale\s+([\d\s,]+)\s*€/i, text);
  }
  
  return per;
}

/**
 * Extrait les SCPI (épargne, pas les charges/dépenses)
 */
export function extractSCPI(text: string): number | undefined {
  // Pattern : capturer SCPI avec montant, mais EXCLURE les lignes de charges/dépenses
  // "Autre dépense SCPI 7 919 €" ne doit PAS être capturé
  const scpiPattern = /\bSCPI\s+([\d\s,]+)\s*€/gi;
  let match;
  
  while ((match = scpiPattern.exec(text)) !== null) {
    // Vérifier le contexte (50 caractères avant)
    const contextBefore = text.substring(Math.max(0, match.index - 50), match.index).toLowerCase();
    
    // Exclure si c'est une dépense ou une charge
    if (contextBefore.includes("dépense") || 
        contextBefore.includes("depense") ||
        contextBefore.includes("charge") ||
        contextBefore.includes("crédit") ||
        contextBefore.includes("credit")) {
      continue; // Ignorer ce match
    }
    
    // C'est une vraie épargne SCPI
    const montant = match[1].replace(/[\s,]/g, "");
    return parseInt(montant, 10);
  }
  
  return undefined;
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
 * Normalise un nom pour la comparaison (enlève accents, minuscules, espaces)
 */
function normalizeNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Enlever les accents
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Formate un nom proprement (Title Case)
 * "SETE AIRBNB" -> "Sete Airbnb"
 * "sète" -> "Sète"
 */
function formatNom(nom: string): string {
  return nom
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Extrait tous les biens immobiliers du RIO avec leurs crédits et loyers associés
 */
export function extractBiensImmobiliers(text: string): BienImmobilier[] {
  const biens: BienImmobilier[] = [];
  
  // === 1. RÉSIDENCE PRINCIPALE ===
  // Format: "Résidence principale   -   Primo MTP   340 000 €   340 000 €"
  const rpPattern = /Résidence\s+principale\s*[-–—]\s*([^\d]+?)\s+([\d\s,]+)\s*€/i;
  const rpMatch = text.match(rpPattern);
  
  if (rpMatch) {
    const rpNom = formatNom(rpMatch[1].trim());
    const rpValeur = parseInt(rpMatch[2].replace(/[\s,]/g, ""), 10);
    
    const rp: BienImmobilier = {
      id: `rp-${normalizeNom(rpNom)}`,
      type: "RESIDENCE_PRINCIPALE",
      nom: rpNom,
      valeur: rpValeur,
    };
    
    // Chercher le crédit associé à la RP
    // Le nom "Primo MTP" apparaît 2 fois : dans ACTIFS et dans PASSIFS
    // On doit trouver TOUS les matchs et prendre celui qui est dans la section PASSIFS/Crédit
    
    const rpNomOriginal = rpMatch[1].trim();
    const rpNomEscaped = rpNomOriginal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Pattern avec flag 'g' pour trouver TOUS les matchs
    // Format: "Primo MTP Nicolas P. 9 454 € 169 072 € 01/11/2046"
    // On veut capturer les 2 montants COMPLETS
    const creditPatternGlobal = new RegExp(
      `${rpNomEscaped}[^€]*?(\\d[\\d\\s,.]+)\\s*€[^€]*?(\\d[\\d\\s,.]+)\\s*€(?:[^€]*(\\d{2}\\/\\d{2}\\/\\d{4}))?`,
      "gi"
    );
    
    let creditMatchAll;
    while ((creditMatchAll = creditPatternGlobal.exec(text)) !== null) {
      // Vérifier le contexte : doit être dans une section "Crédit" ou "Passif"
      const matchIndex = creditMatchAll.index;
      const contextBefore = text.substring(Math.max(0, matchIndex - 150), matchIndex).toLowerCase();
      
      // Accepter si on est dans une section crédit/passif (pas dans "Résidence principale")
      const isInCreditSection = contextBefore.includes("crédit") || 
                                 contextBefore.includes("credit") || 
                                 contextBefore.includes("passif") || 
                                 contextBefore.includes("crd") ||
                                 contextBefore.includes("échéance");
      const isInActifsSection = contextBefore.includes("résidence") || 
                                 contextBefore.includes("residence") ||
                                 contextBefore.includes("jouissance");
      
      if (isInCreditSection && !isInActifsSection) {
        const echeanceAnnuelle = parseInt(creditMatchAll[1].replace(/[\s,.]/g, ""), 10);
        const crd = parseInt(creditMatchAll[2].replace(/[\s,.]/g, ""), 10);
        const dateEcheance = creditMatchAll[3];
        
        rp.echeanceAnnuelle = echeanceAnnuelle;
        rp.creditCRD = crd;
        rp.mensualiteCredit = Math.round(echeanceAnnuelle / 12);
        rp.dateFinCredit = dateEcheance;
        break; // Trouvé, on arrête
      }
    }
    
    biens.push(rp);
  }
  
  // === 2. BIENS LOCATIFS ===
  // Format: "Classique   -   Sete AIRBNB   72 500 €   72 500 €"
  // Format: "Pinel   -   Sète   180 000 €   180 000 €"
  const locatifPatterns = [
    /(?:Classique|LMNP|LMP|Pinel|Denormandie|Malraux|Monument\s+Historique|Déficit\s+foncier)\s*[-–—]\s*([^\d]+?)\s+([\d\s,]+)\s*€/gi,
  ];
  
  for (const pattern of locatifPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Extraire le type réel du bien (Pinel, LMNP, Classique, etc.)
      const fullMatch = match[0];
      const typeRealMatch = fullMatch.match(/^(Classique|LMNP|LMP|Pinel|Denormandie|Malraux|Monument\s+Historique|Déficit\s+foncier)/i);
      const typeReel = typeRealMatch ? typeRealMatch[1].toUpperCase() : "LOCATIF";
      const typeBien = formatNom(typeRealMatch ? typeRealMatch[1] : "Locatif");
      const nomBien = formatNom(match[1].trim());
      const valeur = parseInt(match[2].replace(/[\s,]/g, ""), 10);
      
      // ⚠️ Détecter si c'est une SCPI (par mot-clé ou par nom connu)
      const isSCPI = isKnownSCPI(nomBien);
      
      // Déterminer le type final
      let typeFinal: string;
      if (isSCPI) {
        typeFinal = "SCPI";
      } else if (typeReel === "PINEL") {
        typeFinal = "PINEL";
      } else if (typeReel === "LMNP") {
        typeFinal = "LMNP";
      } else if (typeReel === "LMP") {
        typeFinal = "LMP";
      } else {
        typeFinal = "LOCATIF";
      }
      
      // Éviter les doublons
      const id = isSCPI 
        ? `scpi-${normalizeNom(nomBien)}` 
        : `locatif-${normalizeNom(typeBien)}-${normalizeNom(nomBien)}`;
      if (biens.some(b => b.id === id)) continue;
      
      const bien: BienImmobilier = {
        id,
        type: typeFinal,
        nom: isSCPI ? `SCPI - ${nomBien}` : `${typeBien} - ${nomBien}`,
        valeur,
      };
      
      // Chercher le crédit associé (sauf crédit SCPI générique, traité après)
      // Format RIO: "Crédit immobilier - Pinel sète Nicolas P. 8 306 € 143 128 € 01/12/2046"
      const nomNormalized = normalizeNom(nomBien);
      const creditPattern2 = new RegExp(
        `Crédit\\s+immobilier\\s*[-–—]\\s*([^€]+?)\\s+(\\d[\\d\\s,]*)\\s*€\\s+(\\d[\\d\\s,]*)\\s*€(?:\\s+(\\d{2}\\/\\d{2}\\/\\d{4}))?`,
        "gi"
      );
      
      let creditMatch;
      while ((creditMatch = creditPattern2.exec(text)) !== null) {
        const creditNomFull = creditMatch[1].trim();
        const creditNomNormalized = normalizeNom(creditNomFull);
        
        // IGNORER le crédit SCPI générique ici (sera traité après avec matching par valeur)
        if (/^scpi\s/i.test(creditNomFull)) {
          continue;
        }
        
        // Matcher si le nom du bien est inclus dans le nom du crédit
        // ou si le type + nom partiel correspond (ex: "Pinel sète" pour "Sète")
        const typeNomNormalized = normalizeNom(`${typeBien} ${nomBien}`);
        
        if (creditNomNormalized.includes(nomNormalized) || 
            nomNormalized.includes(creditNomNormalized.substring(0, Math.min(nomNormalized.length, 6))) ||
            creditNomNormalized.includes(typeNomNormalized.substring(0, 10))) {
          const echeanceAnnuelle = parseInt(creditMatch[2].replace(/[\s,]/g, ""), 10);
          const crd = parseInt(creditMatch[3].replace(/[\s,]/g, ""), 10);
          const dateEcheance = creditMatch[4];
          
          bien.echeanceAnnuelle = echeanceAnnuelle;
          bien.creditCRD = crd;
          bien.mensualiteCredit = Math.round(echeanceAnnuelle / 12);
          bien.dateFinCredit = dateEcheance;
          break;
        }
      }
      
      // Chercher les loyers associés
      // Pattern 1: "Revenus fonciers - Sete AIRBNB  10 500 €"
      // Pattern 2: "Revenus fonciers  Sète  6 180 €"  
      // Pattern 3: Section avec nom du bien et montant
      const nomBienOriginal = match[1].trim(); // Nom non formaté pour matching plus précis
      const loyerPatterns = [
        // Pattern avec le nom original (non formaté)
        new RegExp(
          `Revenus?\\s+fonciers?\\s*[-–—]?\\s*${nomBienOriginal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d[\\d\\s,]*)\\s*€`,
          "i"
        ),
        // Pattern avec le nom formaté
        new RegExp(
          `Revenus?\\s+fonciers?\\s*[-–—]?\\s*${nomBien.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d[\\d\\s,]*)\\s*€`,
          "i"
        ),
        // Pattern avec les 4 premières lettres normalisées
        new RegExp(
          `Revenus?\\s+fonciers?[^\\n]*${normalizeNom(nomBien).substring(0, 4)}[^\\n]*(\\d[\\d\\s,]*)\\s*€`,
          "i"
        ),
      ];
      
      for (const loyerPattern of loyerPatterns) {
        const loyerMatch = text.match(loyerPattern);
        if (loyerMatch) {
          bien.loyersAnnuels = parseInt(loyerMatch[1].replace(/[\s,]/g, ""), 10);
          break;
        }
      }
      
      biens.push(bien);
    }
  }
  
  // === POST-TRAITEMENT : Crédit SCPI générique ===
  // Chercher le crédit "SCPI" générique et l'assigner à la SCPI avec la valeur la plus proche du CRD
  const scpiBiens = biens.filter(b => b.type === "SCPI" && !b.creditCRD);
  
  if (scpiBiens.length > 0) {
    // Chercher le crédit SCPI générique
    const creditSCPIPattern = /Crédit\s+immobilier\s*[-–—]\s*SCPI\s+[^€]*?(\d[\d\s,]*)\s*€\s+(\d[\d\s,]*)\s*€(?:\s+(\d{2}\/\d{2}\/\d{4}))?/gi;
    const creditMatch = creditSCPIPattern.exec(text);
    
    if (creditMatch) {
      const echeanceAnnuelle = parseInt(creditMatch[1].replace(/[\s,]/g, ""), 10);
      const crd = parseInt(creditMatch[2].replace(/[\s,]/g, ""), 10);
      const dateEcheance = creditMatch[3];
      
      // Trouver la SCPI avec la valeur la plus proche du CRD
      let bestMatch: BienImmobilier | null = null;
      let smallestDiff = Infinity;
      
      for (const scpi of scpiBiens) {
        const diff = Math.abs(scpi.valeur - crd);
        if (diff < smallestDiff) {
          smallestDiff = diff;
          bestMatch = scpi;
        }
      }
      
      // Assigner le crédit si on a trouvé une SCPI proche (différence < 20% de la valeur)
      if (bestMatch && smallestDiff < bestMatch.valeur * 0.2) {
        bestMatch.echeanceAnnuelle = echeanceAnnuelle;
        bestMatch.creditCRD = crd;
        bestMatch.mensualiteCredit = Math.round(echeanceAnnuelle / 12);
        bestMatch.dateFinCredit = dateEcheance;
      }
    }
  }
  
  return biens;
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
  
  // Nouvelle extraction : liste des biens immobiliers
  const biensImmobiliers = extractBiensImmobiliers(text);

  // Calculer la somme totale de l'épargne
  const epargneTotal = 
    (liquidites.total || 0) + 
    (assuranceVie || 0) + 
    (per || 0) + 
    (scpi || 0);

  return {
    // Adresse
    ...adresse,

    // Profession
    profession,

    // Patrimoine immobilier (ancienne structure pour compatibilité)
    residencePrincipale: {
      valeur: rp.valeur,
      pret: rp.pret,
      mensualite: rp.mensualite,
    },
    
    // Nouvelle structure : liste des biens
    biensImmobiliers,

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
