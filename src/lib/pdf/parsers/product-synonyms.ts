/**
 * Fichier centralisé des synonymes de produits financiers
 * Permet un parsing intelligent des RIO avec toutes les variantes possibles
 */

// ============================================================================
// TYPES
// ============================================================================

export type ProductCategory = 
  | 'EPARGNE_COURT_TERME'
  | 'EPARGNE_LONG_TERME'
  | 'IMMOBILIER'
  | 'RETRAITE';

export type ProductType = 
  // Épargne court terme
  | 'LIVRET_A'
  | 'COMPTE_COURANT'
  | 'LDD'
  | 'LEP'
  | 'PEL'
  | 'CEL'
  | 'CSL'
  | 'LIVRET_JEUNE'
  | 'PARTS_SOCIALES'
  // Épargne long terme
  | 'ASSURANCE_VIE'
  | 'PER'
  | 'PERP'
  | 'MADELIN'
  | 'ARTICLE_83'
  | 'SCPI'
  | 'OPCI'
  | 'SCI'
  | 'PEA'
  | 'COMPTE_TITRES'
  | 'PEE'
  | 'PERCO'
  | 'CONTRAT_CAPI'
  | 'FCPI_FIP'
  // Immobilier
  | 'RESIDENCE_PRINCIPALE'
  | 'RESIDENCE_SECONDAIRE'
  | 'PINEL'
  | 'DENORMANDIE'
  | 'MALRAUX'
  | 'MONUMENTS_HISTORIQUES'
  | 'DEFICIT_FONCIER'
  | 'LMNP'
  | 'LMP'
  | 'LOCATIF_CLASSIQUE'
  | 'NUE_PROPRIETE'
  | 'USUFRUIT'
  | 'VIAGER';

// ============================================================================
// SYNONYMES PAR PRODUIT
// ============================================================================

/**
 * Dictionnaire des synonymes pour chaque type de produit
 * Tous les termes sont en minuscules pour la comparaison
 */
export const PRODUCT_SYNONYMS: Record<ProductType, string[]> = {
  // -------------------------------------------------------------------------
  // ÉPARGNE COURT TERME
  // -------------------------------------------------------------------------
  LIVRET_A: [
    'livret a', 'livret a - la', 'la', 'livret bleu', 
    'livret reglemente', 'livret réglementé',
  ],
  COMPTE_COURANT: [
    'compte courant', 'compte courant - cc', 'cc',
    'compte cheque', 'compte chèque', 'compte joint', 'compte commun',
    'compte a vue', 'compte à vue', 'dav', 'depot a vue', 'dépôt à vue',
    'compte bancaire',
  ],
  LDD: [
    'ldd', 'ldds', 'livret de developpement durable',
    'livret de développement durable', 'livret developpement durable',
    'livret développement durable et solidaire',
  ],
  LEP: [
    'lep', 'livret d\'epargne populaire', 'livret d\'épargne populaire',
    'livret epargne populaire', 'livret épargne populaire',
  ],
  PEL: [
    'pel', 'plan epargne logement', 'plan épargne logement',
    'plan d\'epargne logement', 'plan d\'épargne logement',
  ],
  CEL: [
    'cel', 'compte epargne logement', 'compte épargne logement',
    'compte d\'epargne logement', 'compte d\'épargne logement',
  ],
  CSL: [
    'csl', 'compte sur livret', 'livret bancaire', 'super livret',
  ],
  LIVRET_JEUNE: [
    'lj', 'livret jeune',
  ],
  PARTS_SOCIALES: [
    'ps', 'part sociale', 'parts sociales', 
    'parts de banque', 'societariat', 'sociétariat',
  ],

  // -------------------------------------------------------------------------
  // ÉPARGNE LONG TERME
  // -------------------------------------------------------------------------
  ASSURANCE_VIE: [
    'assurance-vie', 'assurance vie', 'av', 'a-v',
    'ass vie', 'ass-vie', 'contrat av', 'contrat vie',
    'multisupport', 'fonds euros', 'fonds euro',
    'contrat d\'assurance vie', 'contrat d\'assurance-vie',
  ],
  PER: [
    'per', 'plan epargne retraite', 'plan épargne retraite',
    'plan d\'epargne retraite', 'plan d\'épargne retraite',
    'perin', 'per individuel', 'per in',
  ],
  PERP: [
    'perp', 'plan d\'epargne retraite populaire',
    'plan d\'épargne retraite populaire',
  ],
  MADELIN: [
    'madelin', 'contrat madelin', 'retraite madelin',
  ],
  ARTICLE_83: [
    'article 83', 'art. 83', 'art 83', 'retraite art 83',
  ],
  SCPI: [
    'scpi', 'societe civile de placement immobilier',
    'société civile de placement immobilier',
    'pierre papier', 'scpi de rendement', 'scpi fiscale',
  ],
  OPCI: [
    'opci', 'organisme de placement collectif immobilier',
  ],
  SCI: [
    'sci', 'societe civile immobiliere', 'société civile immobilière',
    'parts de sci',
  ],
  PEA: [
    'pea', 'pea-pme', 'pea pme',
    'plan epargne actions', 'plan épargne actions',
    'plan epargne en actions', 'plan épargne en actions',
    'plan d\'epargne en actions', 'plan d\'épargne en actions',
  ],
  COMPTE_TITRES: [
    'ct', 'cto', 'compte titres', 'compte-titres',
    'compte titres ordinaire', 'portefeuille titres',
  ],
  PEE: [
    'pee', 'plan epargne entreprise', 'plan épargne entreprise',
    'epargne salariale', 'épargne salariale', 'actionnariat salarie',
  ],
  PERCO: [
    'perco', 'percol', 'pereco',
    'plan d\'epargne retraite collectif', 'plan d\'épargne retraite collectif',
    'per collectif',
  ],
  CONTRAT_CAPI: [
    'contrat de capi', 'contrat de capitalisation', 'capitalisation',
    'contrat capi',
  ],
  FCPI_FIP: [
    'fcpi', 'fip', 'fonds innovation', 'fcpi fip',
    'fonds commun de placement dans l\'innovation',
  ],

  // -------------------------------------------------------------------------
  // IMMOBILIER
  // -------------------------------------------------------------------------
  RESIDENCE_PRINCIPALE: [
    'residence principale', 'résidence principale',
    'rp', 'habitation principale', 'domicile',
    'immobilier de jouissance',
  ],
  RESIDENCE_SECONDAIRE: [
    'residence secondaire', 'résidence secondaire',
    'rs', 'maison secondaire',
  ],
  PINEL: [
    'pinel', 'loi pinel', 'dispositif pinel',
  ],
  DENORMANDIE: [
    'denormandie', 'loi denormandie', 'dispositif denormandie',
  ],
  MALRAUX: [
    'malraux', 'loi malraux', 'dispositif malraux',
  ],
  MONUMENTS_HISTORIQUES: [
    'mh', 'monuments historiques', 'monument historique',
  ],
  DEFICIT_FONCIER: [
    'df', 'deficit foncier', 'déficit foncier',
    'travaux deductibles', 'travaux déductibles',
  ],
  LMNP: [
    'lmnp', 'loueur meuble non professionnel',
    'loueur meublé non professionnel', 'meuble non pro',
  ],
  LMP: [
    'lmp', 'loueur meuble professionnel',
    'loueur meublé professionnel', 'meuble pro',
  ],
  LOCATIF_CLASSIQUE: [
    'classique', 'locatif', 'locatif classique',
    'immobilier locatif', 'bien locatif', 'immo locatif',
    'investissement locatif',
  ],
  NUE_PROPRIETE: [
    'nue-propriete', 'nue propriete', 'nue-propriété', 'nue propriété',
    'np', 'demembrement', 'démembrement',
  ],
  USUFRUIT: [
    'usufruit', 'us', 'usufruit temporaire', 'ust',
  ],
  VIAGER: [
    'viager', 'viager occupe', 'viager occupé', 'viager libre',
  ],
};

// ============================================================================
// NOMS DE SCPI CONNUS
// ============================================================================

export const KNOWN_SCPI_NAMES = [
  // SCPI Corum
  'corum origin', 'corum xl', 'corum eurion',
  // SCPI Primonial
  'primovie', 'primopierre', 'patrimmo commerce', 'patrimmo croissance',
  // SCPI Sofidy
  'immorente', 'efimmo', 'sofidy europe invest',
  // SCPI Paref
  'novapierre', 'interpierre', 'atlantique pierre',
  // SCPI Perial
  'pfo2', 'pf grand paris', 'pf hospitalite europe',
  // SCPI Amundi
  'opcimmo', 'rivoli avenir patrimoine',
  // SCPI La Française
  'epargne fonciere', 'lf europimmo', 'lf grand paris patrimoine',
  // SCPI Arkea
  'transitions europe', 'transitions europeennes',
  // SCPI Alderan
  'activimmo',
  // SCPI Sogenial
  'comete', 'coeur de regions', 'coeur de ville',
  // SCPI Voisin
  'epargne pierre', 'epargne pierre europe',
  // SCPI Atland
  'fonciere des praticiens',
  // SCPI AEW
  'laffitte pierre', 'fructipierre', 'fructiregions',
  // SCPI BNP Paribas
  'accimmo pierre',
  // SCPI Advenis
  'eurovalys',
  // SCPI Fiducial
  'fiducial gerance',
  // SCPI Iroko
  'iroko zen',
  // SCPI Remake
  'remake live',
  // SCPI Altarea
  'alta convictions', 'altaconvictions',
  // Autres SCPI courantes
  'pierval sante', 'kyaneos pierre', 'vendome regions', 
  'cap foncieres', 'cristal rente',
];

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Normalise un texte pour la comparaison :
 * - Minuscules
 * - Suppression des accents
 * - Normalisation des espaces
 * - Normalisation des tirets/apostrophes
 */
export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[-–—'`']/g, ' ')       // Remplace tirets/apostrophes par espaces
    .replace(/\s+/g, ' ')            // Normalise les espaces multiples
    .trim();
}

/**
 * Vérifie si un texte correspond à un type de produit
 */
export function matchesProductType(text: string, productType: ProductType): boolean {
  const normalizedText = normalizeForMatching(text);
  const synonyms = PRODUCT_SYNONYMS[productType];
  
  return synonyms.some(synonym => {
    const normalizedSynonym = normalizeForMatching(synonym);
    // Correspondance exacte ou le texte contient le synonyme
    return normalizedText === normalizedSynonym || 
           normalizedText.includes(normalizedSynonym);
  });
}

/**
 * Détecte le type de produit à partir d'un texte
 * Retourne le premier type trouvé ou null
 */
export function detectProductType(text: string): ProductType | null {
  const normalizedText = normalizeForMatching(text);
  
  for (const [productType, synonyms] of Object.entries(PRODUCT_SYNONYMS)) {
    for (const synonym of synonyms) {
      const normalizedSynonym = normalizeForMatching(synonym);
      if (normalizedText.includes(normalizedSynonym)) {
        return productType as ProductType;
      }
    }
  }
  
  return null;
}

/**
 * Détecte si un texte correspond à une SCPI connue
 */
export function isKnownSCPI(text: string): boolean {
  const normalizedText = normalizeForMatching(text);
  return KNOWN_SCPI_NAMES.some(name => 
    normalizedText.includes(normalizeForMatching(name))
  );
}

/**
 * Construit un pattern regex pour un type de produit
 * Utile pour les extractions avec capture de montants
 */
export function buildProductRegex(productType: ProductType, captureAmount = true): RegExp {
  const synonyms = PRODUCT_SYNONYMS[productType];
  
  // Échapper les caractères spéciaux regex et normaliser
  const escapedSynonyms = synonyms.map(s => 
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
     .replace(/\s+/g, '\\s+')
  );
  
  // Construire le pattern
  const synonymPattern = escapedSynonyms.join('|');
  
  if (captureAmount) {
    // Pattern avec capture du montant : "Produit ... MONTANT €"
    return new RegExp(
      `(?:${synonymPattern})(?:\\s*[-–—]\\s*[^€\\d]*)?\\s+([\\d\\s,]+)\\s*€`,
      'gi'
    );
  }
  
  return new RegExp(`(?:${synonymPattern})`, 'gi');
}

/**
 * Extrait un montant associé à un type de produit
 */
export function extractProductAmount(text: string, productType: ProductType): number | undefined {
  const regex = buildProductRegex(productType, true);
  const match = regex.exec(text);
  
  if (match && match[1]) {
    const montantStr = match[1].replace(/\s/g, '').replace(',', '.');
    const montant = parseFloat(montantStr);
    return isNaN(montant) ? undefined : montant;
  }
  
  return undefined;
}

/**
 * Détecte le type d'immobilier à partir d'un texte
 */
export function detectImmobilierType(text: string): 
  'RP' | 'RS' | 'PINEL' | 'DENORMANDIE' | 'MALRAUX' | 'MH' | 'DF' | 'LMNP' | 'LMP' | 'SCPI' | 'LOCATIF' | null {
  
  const normalizedText = normalizeForMatching(text);
  
  // Ordre de priorité pour la détection
  if (matchesProductType(text, 'RESIDENCE_PRINCIPALE')) return 'RP';
  if (matchesProductType(text, 'RESIDENCE_SECONDAIRE')) return 'RS';
  if (matchesProductType(text, 'PINEL')) return 'PINEL';
  if (matchesProductType(text, 'DENORMANDIE')) return 'DENORMANDIE';
  if (matchesProductType(text, 'MALRAUX')) return 'MALRAUX';
  if (matchesProductType(text, 'MONUMENTS_HISTORIQUES')) return 'MH';
  if (matchesProductType(text, 'DEFICIT_FONCIER')) return 'DF';
  if (matchesProductType(text, 'LMNP')) return 'LMNP';
  if (matchesProductType(text, 'LMP')) return 'LMP';
  if (matchesProductType(text, 'SCPI') || isKnownSCPI(text)) return 'SCPI';
  if (matchesProductType(text, 'LOCATIF_CLASSIQUE')) return 'LOCATIF';
  
  return null;
}

/**
 * Détecte le type d'épargne à partir d'un texte
 */
export function detectEpargneType(text: string): ProductType | null {
  const epargneTypes: ProductType[] = [
    'LIVRET_A', 'COMPTE_COURANT', 'LDD', 'LEP', 'PEL', 'CEL', 
    'CSL', 'LIVRET_JEUNE', 'PARTS_SOCIALES',
    'ASSURANCE_VIE', 'PER', 'PERP', 'MADELIN', 'ARTICLE_83',
    'PEA', 'COMPTE_TITRES', 'PEE', 'PERCO', 'CONTRAT_CAPI', 'FCPI_FIP',
  ];
  
  for (const type of epargneTypes) {
    if (matchesProductType(text, type)) {
      return type;
    }
  }
  
  return null;
}
