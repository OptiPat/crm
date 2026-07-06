// Types pour l'extraction de données depuis les PDF

/** Propriétaire probable d'une ligne patrimoine RIO couple (colonnes investisseur 1 / 2). */
export type RioCoupleOwnerHint = "person1" | "person2" | "foyer";

/**
 * Représente un bien immobilier individuel avec ses détails
 */
export interface BienImmobilier {
  id: string; // Identifiant unique (ex: "rp-primo-mtp", "locatif-pinel-sete")
  type: "RESIDENCE_PRINCIPALE" | "RESIDENCE_SECONDAIRE" | "LOCATIF" | "SCPI" | "PINEL" | "LMNP" | "LMP" | "RP" | string;
  nom: string; // Nom du bien (ex: "Primo Mtp", "Pinel - Sète")
  /** RIO couple : colonne investisseur 1, 2 ou bien commun. */
  rioOwnerHint?: RioCoupleOwnerHint;
  valeur?: number; // Valeur du bien
  creditCRD?: number; // Capital Restant Dû
  mensualiteCredit?: number; // Mensualité du crédit
  echeanceAnnuelle?: number; // Échéance annuelle du crédit
  dateFinCredit?: string; // Date de fin du crédit
  loyersAnnuels?: number; // Loyers annuels (pour locatif)
}

export interface ContratFinancier {
  id: string;
  type: string;
  nom: string;
  montant: number;
  autoOrigine?: "MON_CONSEIL" | "EXISTANT_CLIENT";
  /** RIO couple : colonne investisseur 1, 2 ou bien commun. */
  rioOwnerHint?: RioCoupleOwnerHint;
}

export interface ExtractedText {
  text: string;
  numPages: number;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
}

export interface ExtractedData {
  // === IDENTITÉ ===
  civilite?: string;
  nom?: string;
  prenom?: string;
  nomNaissance?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  nationalite?: string;
  
  // === COORDONNÉES ===
  email?: string;
  telephone?: string;
  telephoneMobile?: string;
  telephoneFixe?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
  
  // === SITUATION FAMILIALE ===
  situationFamiliale?: string;
  regimeMatrimonial?: string;
  dateRegime?: string;
  nombreEnfants?: number;
  nombrePersonnesCharge?: number;
  enfants?: Array<{
    nom?: string;
    prenom?: string;
    dateNaissance?: string;
  }>;
  
  // === SITUATION PROFESSIONNELLE ===
  profession?: string;
  statutProfessionnel?: string; // Salarié, Indépendant, Retraité, Sans emploi
  employeur?: string;
  anciennete?: string;
  
  // === REVENUS ANNUELS ===
  revenusSalaires?: number;
  revenusFonciers?: number;
  revenusFinanciers?: number;
  revenusDividendes?: number;
  revenusAutres?: number;
  revenusTotal?: number;
  
  // === CHARGES ANNUELLES ===
  chargesEmprunts?: number;
  /** Échéances annuelles lues dans l'onglet Passifs (crédits). */
  chargesEmpruntsPassifs?: number;
  chargesPensionsAlimentaires?: number;
  chargesAutres?: number;
  chargesTotal?: number;
  
  // === PATRIMOINE IMMOBILIER ===
  residencePrincipale?: {
    valeur?: number;
    pret?: number;
    mensualite?: number;
  };
  residenceSecondaire?: {
    valeur?: number;
    pret?: number;
  };
  immobilierLocatif?: {
    valeur?: number;
    pret?: number;
    loyersAnnuels?: number;
  };
  
  // === BIENS IMMOBILIERS DÉTAILLÉS ===
  biensImmobiliers?: BienImmobilier[];

  /** Contrats financiers ligne à ligne (AV, PER, PEA, SCPI…). */
  contratsFinanciers?: ContratFinancier[];
  
  // === PATRIMOINE FINANCIER ===
  epargneTotal?: number; // Somme de toute l'épargne
  
  // --- Court terme ---
  liquidites?: number; // Total court terme
  livretA?: number;
  livretEpargne?: number;
  ldd?: number; // Livret Développement Durable et Solidaire
  lep?: number; // Livret d'Épargne Populaire
  pel?: number; // Plan Épargne Logement
  cel?: number; // Compte Épargne Logement
  csl?: number; // Compte Sur Livret
  livretJeune?: number;
  partsSociales?: number;
  compteCourant?: number;
  
  // --- Long terme ---
  assuranceVie?: number;
  per?: number; // Plan Épargne Retraite (nouveau)
  perp?: number; // Plan Épargne Retraite Populaire (ancien)
  madelin?: number; // Contrat Madelin (TNS)
  article83?: number; // Article 83 (retraite entreprise)
  pea?: number; // Plan Épargne en Actions
  compteTitres?: number; // Compte-titres ordinaire
  pee?: number; // Plan Épargne Entreprise
  perco?: number; // Plan Épargne Retraite Collectif
  contratCapi?: number; // Contrat de capitalisation
  fcpiFip?: number; // FCPI / FIP
  scpi?: number;
  opci?: number;
  
  // --- Autres ---
  actionsObligations?: number;
  autresPlacementFinanciers?: number;
  
  // === DETTES ===
  pretResidencePrincipale?: number;
  pretImmobilierLocatif?: number;
  pretConsommation?: number;
  autresDettes?: number;
  
  // === PATRIMOINE TOTAL ===
  patrimoineTotal?: number;
  patrimoineNet?: number;
  
  // === OBJECTIFS PATRIMONIAUX ===
  objectifsPrincipaux?: string[]; // Ex: ["Préparer retraite", "Transmission", "Défiscalisation"]
  horizonPlacement?: string; // Court terme, Moyen terme, Long terme
  capaciteEpargneMensuelle?: number;
  
  // === PROFIL INVESTISSEUR ===
  profilRisque?: number; // Profil de risque QPI 1-5
  /** Niveau QPI : Novice, Informé ou Expérimenté. */
  experienceInvestissement?: string;
  aversionRisque?: string;
  /** Résumé durabilité / ESG (section « Sensibilité extra-financière » du QPI). */
  sensibiliteExtraFinanciere?: string;
  
  // === DOCUMENT ===
  /** Date d'impression / en-tête (peut différer de la signature). */
  dateDocument?: string;
  /** Date de signature lue sur la dernière page du RIO ou QPI. */
  dateSignature?: string;
  typeDocument?: string;
  dateEntreeRelation?: string;

  /** Fiscalité RIO (section Fiscalité Stellium). */
  trancheImposition?: string;
  nombrePartsFiscales?: number;
  revenuBrutGlobal?: number;
  /** IR net à payer du foyer fiscal (somme des déclarants pour un couple). */
  irNetAPayer?: number;
  /** Épargne de précaution souhaitée (RIO, par personne). */
  epargnePrecautionSouhaitee?: number;
  
  // === COUPLE (RIO Stellium 2 investisseurs) ===
  isCouple?: boolean;

  // === CONJOINT ===
  conjoint?: {
    civilite?: string;
    nom?: string;
    prenom?: string;
    nomNaissance?: string;
    dateNaissance?: string;
    lieuNaissance?: string;
    nationalite?: string;
    profession?: string;
    employeur?: string;
    email?: string;
    telephone?: string;
    revenusTotal?: number;
    chargesTotal?: number;
    chargesEmprunts?: number;
    chargesEmpruntsPassifs?: number;
    patrimoineTotal?: number;
    epargnePrecautionSouhaitee?: number;
  };
  
  // === MÉTADONNÉES ===
  raw?: string; // Texte brut extrait
  confidence?: number; // Niveau de confiance (0-100)
}

export interface ExtractionResult {
  success: boolean;
  data?: ExtractedData;
  error?: string;
  extractedText?: ExtractedText;
}

export type DocumentType =
  | "RIO"
  | "FICHE_PROFIL_RISQUE"
  | "DER"
  | "RELEVE_COMPTE"
  | "RIB"
  | "AVIS_IMPOSITION"
  | "BULLETIN_SOUSCRIPTION"
  | "LETTRE_MISSION"
  | "RAPPORT_ADEQUATION"
  | "FICHE_CONSEIL"
  | "ANNEXE_DURABILITE"
  | "AUTRE";
