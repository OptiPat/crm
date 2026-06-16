/**
 * Associe crédits / loyers (section Passifs) aux biens immo lus par le parser Stellium.
 * Heuristiques conservées depuis l'ancien extracteur patrimoine — voir immo-credits.ts.
 */
import type { BienImmobilier } from "../types";

const KNOWN_SCPI_NAMES = [
  "corum origin", "corum xl", "corum eurion",
  "primovie", "primopierre", "patrimmo commerce", "patrimmo croissance",
  "immorente", "efimmo", "sofidy europe invest",
  "novapierre", "interpierre", "atlantique pierre",
  "pfo2", "pf grand paris", "pf hospitalite europe",
  "opcimmo", "rivoli avenir patrimoine",
  "epargne fonciere", "lf europimmo", "lf grand paris patrimoine",
  "transitions europe", "transitions europeennes",
  "activimmo",
  "comete", "coeur de regions", "coeur de ville",
  "epargne pierre", "epargne pierre europe",
  "fonciere des praticiens",
  "laffitte pierre", "fructipierre", "fructiregions",
  "accimmo pierre",
  "eurovalys",
  "fiducial gerance",
  "iroko zen",
  "remake live",
  "alta convictions", "altaconvictions",
  "pierval sante", "kyaneos pierre", "vendome regions",
  "cap foncieres", "cristal rente",
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
  text = text.replace(/\t+/g, "  ");
  const biens: BienImmobilier[] = [];
  
  // === 1. RÉSIDENCE PRINCIPALE ===
  // Format: "Résidence principale   -   Primo MTP   340 000 €   340 000 €"
  // Format alternatif: "Résidence principale - Appartement Sète T3 125 000 € 125 000 €"
  // Le pattern doit gérer les espaces multiples (PDF.js extrait souvent avec beaucoup d'espaces)
  const rpPatterns = [
    // Pattern 1: avec tiret et nom du bien contenant uniquement des lettres/espaces
    // Ex: "Résidence principale   -   Appartement Sète T3   125 000 €"
    /Résidence\s+principale\s*[-–—]\s*([A-Za-zÀ-ÿ\s\-']+?)\s{2,}(\d[\d\s,]*)\s*€/i,
    // Pattern 2: avec tiret, nom capturé plus largement
    /Résidence\s+principale\s*[-–—]\s*(.+?)\s{2,}(\d[\d\s,]*)\s*€/i,
    // Pattern 3: sans tiret (juste des espaces multiples entre les éléments)
    /Résidence\s+principale\s{3,}([A-Za-zÀ-ÿ\s\-']+?)\s{2,}(\d[\d\s,]*)\s*€/i,
    // Pattern 4: avec "RP" comme nom (sans nom de bien)
    /Résidence\s+principale\s*[-–—]?\s*RP\s+(\d[\d\s,]*)\s*€/i,
  ];
  
  let rpMatch: RegExpMatchArray | null = null;
  let patternIndex = 0;
  for (let i = 0; i < rpPatterns.length; i++) {
    rpMatch = text.match(rpPatterns[i]);
    if (rpMatch) {
      patternIndex = i;
      break;
    }
  }
  
  if (rpMatch) {
    // Pattern 4 (index 3) "RP" n'a qu'un groupe de capture (montant), les autres ont 2 (nom, montant)
    let rpNom: string;
    let rpValeur: number;
    
    if (patternIndex === 3) {
      // Pattern "RP" - un seul groupe (montant)
      rpNom = "RP";
      rpValeur = parseInt(rpMatch[1].replace(/[\s,]/g, ""), 10);
    } else {
      // Patterns 0, 1, 2 - deux groupes (nom, montant)
      rpNom = formatNom(rpMatch[1].trim());
      rpValeur = parseInt(rpMatch[2].replace(/[\s,]/g, ""), 10);
    }
    
    const rp: BienImmobilier = {
      id: `rp-${normalizeNom(rpNom)}`,
      type: "RESIDENCE_PRINCIPALE",
      nom: rpNom,
      valeur: rpValeur,
    };
    
    // Chercher le crédit associé à la RP
    // Le nom "Primo MTP" apparaît 2 fois : dans ACTIFS et dans PASSIFS
    // On doit trouver TOUS les matchs et prendre celui qui est dans la section PASSIFS/Crédit
    
    const rpNomOriginal = rpNom;
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
  // Supporte: Classique, LMNP, LMP, Pinel, Denormandie, Malraux, Monument Historique, Déficit Foncier, etc.
  const locatifPatterns = [
    /(?:Classique|LMNP|LMP|Pinel|Denormandie|Malraux|MH|Monument\s+Historique|DF|D[ée]ficit\s+[Ff]oncier|Locatif)\s*[-–—]\s*([^\d]+?)\s+([\d\s,]+)\s*€/gi,
  ];
  
  for (const pattern of locatifPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Extraire le type réel du bien (Pinel, LMNP, Classique, etc.)
      const fullMatch = match[0];
      const typeRealMatch = fullMatch.match(/^(Classique|LMNP|LMP|Pinel|Denormandie|Malraux|MH|Monument\s+Historique|DF|D[ée]ficit\s+[Ff]oncier|Locatif)/i);
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
      } else if (typeReel === "DENORMANDIE") {
        typeFinal = "DENORMANDIE";
      } else if (typeReel === "MALRAUX") {
        typeFinal = "MALRAUX";
      } else if (typeReel.includes("MONUMENT") || typeReel === "MH") {
        typeFinal = "MH";
      } else if (typeReel.includes("DEFICIT") || typeReel.includes("DÉFICIT") || typeReel === "DF") {
        typeFinal = "DF";
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
      // Le matching doit être intelligent car les noms peuvent différer entre ACTIFS et PASSIFS
      // Note: PDF.js peut insérer des espaces ("Cré dit" au lieu de "Crédit")
      const nomNormalized = normalizeNom(nomBien);
      const typeNormalized = normalizeNom(typeBien); // "pinel", "lmnp", "classique", etc.
      const creditPattern2 = new RegExp(
        `Cr[ée]\\s*dit\\s+immobilier\\s*[-–—]\\s*([^€]+?)\\s{2,}(\\d[\\d\\s,]*)\\s*€\\s+(\\d[\\d\\s,]*)\\s*€(?:\\s+(\\d{2}\\/\\d{2}\\/\\d{4}))?`,
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
        
        // === MATCHING INTELLIGENT ===
        let isMatch = false;
        
        // 1. Match exact ou partiel sur le nom du bien
        if (creditNomNormalized.includes(nomNormalized) || 
            nomNormalized.includes(creditNomNormalized)) {
          isMatch = true;
        }
        
        // 2. Match sur le type de bien (Pinel, LMNP, LMP, etc.)
        // Ex: ACTIFS = "Pinel - Cap Azur Sete", PASSIFS = "Crédit immobilier - Pinel"
        if (!isMatch && typeNormalized !== "classique" && typeNormalized !== "locatif") {
          // Si le type n'est pas générique, chercher le type dans le nom du crédit
          if (creditNomNormalized.includes(typeNormalized) || 
              typeNormalized.includes(creditNomNormalized)) {
            isMatch = true;
          }
        }
        
        // 3. Match sur les 4+ premières lettres du nom (pour les variations)
        // Ex: "Sète" vs "sete", "Cap Azur" vs "CapAzur"
        if (!isMatch && nomNormalized.length >= 4) {
          const shortNom = nomNormalized.substring(0, Math.min(nomNormalized.length, 6));
          const shortCredit = creditNomNormalized.substring(0, Math.min(creditNomNormalized.length, 6));
          if (creditNomNormalized.includes(shortNom) || nomNormalized.includes(shortCredit)) {
            isMatch = true;
          }
        }
        
        // 4. Match sur des mots individuels significatifs (au moins 4 caractères)
        if (!isMatch) {
          const nomWords = nomBien.split(/[\s\-]+/).filter(w => w.length >= 4).map(w => normalizeNom(w));
          for (const word of nomWords) {
            if (creditNomNormalized.includes(word)) {
              isMatch = true;
              break;
            }
          }
        }
        
        if (isMatch) {
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
      const nomBienOriginal = match[1].trim();
      // Pattern 1: "Revenus fonciers - Sete AIRBNB  10 500 €"
      // Pattern 2: "Revenu foncier ou BIC - Sete AIRBNB 10 500 €"
      const loyerPatterns = [
        new RegExp(
          `Revenus?\\s+fonciers?(?:\\s+ou\\s+BIC)?\\s*[-–—]?\\s*${nomBienOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d[\\d\\s,]*)\\s*€`,
          "i"
        ),
        new RegExp(
          `Revenus?\\s+fonciers?(?:\\s+ou\\s+BIC)?\\s*[-–—]?\\s*${nomBien.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d[\\d\\s,]*)\\s*€`,
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
        if (scpi.valeur === undefined) continue;
        const diff = Math.abs(scpi.valeur - crd);
        if (diff < smallestDiff) {
          smallestDiff = diff;
          bestMatch = scpi;
        }
      }
      
      // Assigner le crédit si on a trouvé une SCPI proche (différence < 20% de la valeur)
      if (bestMatch && bestMatch.valeur && smallestDiff < bestMatch.valeur * 0.2) {
        bestMatch.echeanceAnnuelle = echeanceAnnuelle;
        bestMatch.creditCRD = crd;
        bestMatch.mensualiteCredit = Math.round(echeanceAnnuelle / 12);
        bestMatch.dateFinCredit = dateEcheance;
      }
    }
  }
  
  // === POST-TRAITEMENT : Crédits orphelins (matching intelligent) ===
  // Pour les biens sans crédit, essayer d'associer des crédits non encore matchés
  
  // 1. Collecter TOUS les crédits immobiliers du document
  interface CreditInfo {
    nom: string;
    echeanceAnnuelle: number;
    crd: number;
    dateEcheance?: string;
    matched: boolean;
  }
  const allCredits: CreditInfo[] = [];
  
  // Pattern amélioré pour gérer les espaces multiples ET les espaces insérés dans les mots
  // Format: "Crédit immobilier   -   Crédit   Helena V.   6 878 €   86 100 €   01/04/2044"
  // Note: PDF.js peut insérer des espaces dans les mots ("Cré dit" au lieu de "Crédit")
  const allCreditsPattern = /Cr[ée]\s*dit\s+immobilier\s*[-–—]\s*(.+?)\s{2,}(\d[\d\s,]*)\s*€\s+(\d[\d\s,]*)\s*€(?:\s+(\d{2}\/\d{2}\/\d{4}))?/gi;
  let creditMatch;
  while ((creditMatch = allCreditsPattern.exec(text)) !== null) {
    const nomCredit = creditMatch[1].trim();
    // Ignorer les lignes de total ("Crédit immobilier 25 680 € 410 225 €")
    if (nomCredit.length < 2 || /^\d/.test(nomCredit)) continue;
    
    allCredits.push({
      nom: nomCredit,
      echeanceAnnuelle: parseInt(creditMatch[2].replace(/[\s,]/g, ""), 10),
      crd: parseInt(creditMatch[3].replace(/[\s,]/g, ""), 10),
      dateEcheance: creditMatch[4],
      matched: false,
    });
  }
  
  // 2. Marquer les crédits déjà associés
  for (const bien of biens) {
    if (bien.creditCRD) {
      // Trouver le crédit correspondant et le marquer
      for (const credit of allCredits) {
        if (!credit.matched && credit.crd === bien.creditCRD) {
          credit.matched = true;
          break;
        }
      }
    }
  }
  
  // 3. Pour les biens sans crédit, essayer d'associer des crédits orphelins
  const biensWithoutCredit = biens.filter(b => !b.creditCRD && b.valeur);
  const orphanCredits = allCredits.filter(c => !c.matched);
  
  if (biensWithoutCredit.length > 0 && orphanCredits.length > 0) {
    for (const bien of biensWithoutCredit) {
      if (!bien.valeur) continue;
      
      let bestCredit: CreditInfo | null = null;
      let bestScore = 0;
      
      for (const credit of orphanCredits) {
        if (credit.matched) continue;
        
        let score = 0;
        const creditNomNormalized = normalizeNom(credit.nom);
        const bienNomNormalized = normalizeNom(bien.nom);
        
        // Stratégie 1: Match par type (RP, Pinel, etc.)
        if (bien.type === "RP" && (creditNomNormalized.includes("rp") || 
            creditNomNormalized.includes("residence") || 
            creditNomNormalized.includes("principale") ||
            /^credit\s*1$/i.test(credit.nom) ||  // "Credit 1" souvent = RP
            /^pret\s*1$/i.test(credit.nom))) {
          score += 50;
        }
        
        if (bien.type === "PINEL" && creditNomNormalized.includes("pinel")) {
          score += 50;
        }
        
        if (bien.type === "DENORMANDIE" && creditNomNormalized.includes("denormandie")) {
          score += 50;
        }
        
        if (bien.type === "MALRAUX" && creditNomNormalized.includes("malraux")) {
          score += 50;
        }
        
        if (bien.type === "MH" && (creditNomNormalized.includes("monument") || creditNomNormalized.includes("mh"))) {
          score += 50;
        }
        
        if (bien.type === "DF" && (creditNomNormalized.includes("deficit") || creditNomNormalized.includes("df"))) {
          score += 50;
        }
        
        if (bien.type === "LMNP" && creditNomNormalized.includes("lmnp")) {
          score += 50;
        }
        
        if (bien.type === "LMP" && creditNomNormalized.includes("lmp")) {
          score += 50;
        }
        
        // Stratégie 2: Match par proximité de montant (CRD vs valeur du bien)
        // Un CRD est généralement entre 30% et 95% de la valeur du bien
        const ratio = credit.crd / bien.valeur;
        if (ratio > 0.2 && ratio < 1.0) {
          // Plus le ratio est proche de 0.5-0.7, plus c'est plausible
          const optimalRatio = 0.6;
          const ratioDiff = Math.abs(ratio - optimalRatio);
          score += Math.max(0, 30 - ratioDiff * 50);
        }
        
        // Stratégie 3: Si un seul bien de ce type sans crédit et un seul crédit orphelin
        if (biensWithoutCredit.filter(b => b.type === bien.type).length === 1 &&
            orphanCredits.filter(c => !c.matched).length === 1) {
          score += 20;
        }
        
        // Stratégie 3b: Si UN SEUL bien immobilier total sans crédit et UN SEUL crédit orphelin
        // Dans ce cas, c'est quasi certain que le crédit correspond au bien
        if (biensWithoutCredit.length === 1 && orphanCredits.filter(c => !c.matched).length === 1) {
          score += 40; // Score élevé car très probable
        }
        
        // Stratégie 3c: Le crédit contient juste "Crédit" ou le nom d'une personne (très générique)
        // Si c'est une RP et le seul bien de type RP, on augmente le score
        if (bien.type === "RP" || bien.type === "RESIDENCE_PRINCIPALE") {
          const isGenericCreditName = /^cr[ée]dit$/i.test(creditNomNormalized) || 
                                       creditNomNormalized.length <= 15;
          if (isGenericCreditName && biensWithoutCredit.filter(b => 
              b.type === "RP" || b.type === "RESIDENCE_PRINCIPALE").length === 1) {
            score += 30;
          }
        }
        
        // Stratégie 4: Match partiel sur le nom
        if (bienNomNormalized.length >= 3 && 
            (creditNomNormalized.includes(bienNomNormalized.substring(0, 3)) ||
             bienNomNormalized.includes(creditNomNormalized.substring(0, 3)))) {
          score += 15;
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestCredit = credit;
        }
      }
      
      // Associer si le score est suffisant (au moins 40 points)
      if (bestCredit && bestScore >= 40) {
        bien.echeanceAnnuelle = bestCredit.echeanceAnnuelle;
        bien.creditCRD = bestCredit.crd;
        bien.mensualiteCredit = Math.round(bestCredit.echeanceAnnuelle / 12);
        bien.dateFinCredit = bestCredit.dateEcheance;
        bestCredit.matched = true;
      }
    }
  }
  
  return biens;
}
