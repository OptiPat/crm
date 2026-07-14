// ⚠️ SOURCE DE VÉRITÉ DU SCHÉMA = migrations Rust runtime : `src-tauri/src/database/mod.rs`.
// Ce schéma Drizzle est DEV / DOC uniquement (génération SQL, inspection via `db:studio`).
// Il n'est importé par aucun code applicatif et ne doit PAS servir en production.
// Toute modification de structure se fait d'abord côté Rust, puis on synchronise ici.
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================
// FOYERS (Groupes familiaux)
// ============================================
export const foyers = sqliteTable("foyers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nom: text("nom").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// CONTACTS (Personnes physiques)
// ============================================
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  foyerId: integer("foyer_id").references(() => foyers.id, {
    onDelete: "set null",
  }),
  
  // Rôle dans le foyer
  roleFoyer: text("role_foyer", {
    enum: ["DECLARANT_1", "DECLARANT_2", "ENFANT", "AUTRE"],
  }),
  
  // Catégorie et informations de base
  categorie: text("categorie", {
    enum: [
      "CLIENT",
      "PROSPECT_CLIENT",
      "PROSPECT_FILLEUL",
      "SUSPECT_CLIENT",
      "SUSPECT_FILLEUL",
      "FILLEUL",
      "FILLEUL_DESINSCRIT",
    ],
  })
    .notNull()
    .default("SUSPECT_CLIENT"),
  
  // Parrainage (pour les filleuls)
  parrainId: integer("parrain_id").references((): any => contacts.id, {
    onDelete: "set null",
  }),
  
  civilite: text("civilite", { enum: ["M", "MME", "AUTRE"] }),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  
  // Coordonnées
  email: text("email"),
  telephone: text("telephone"),
  adresse: text("adresse"),
  codePostal: text("code_postal"),
  ville: text("ville"),
  pays: text("pays"),
  
  // Informations personnelles
  dateNaissance: integer("date_naissance", { mode: "timestamp" }),
  lieuNaissance: text("lieu_naissance"),
  profession: text("profession"),
  situationFamiliale: text("situation_familiale", {
    enum: ["CELIBATAIRE", "MARIE", "PACSE", "UNION_LIBRE", "DIVORCE", "VEUF", "AUTRE"],
  }),
  regimeMatrimonial: text("regime_matrimonial"),
  revenusAnnuels: real("revenus_annuels"),
  chargesEmprunts: real("charges_emprunts"),
  epargnePrecautionSouhaitee: real("epargne_precaution_souhaitee"),
  objectifsPatrimoniaux: text("objectifs_patrimoniaux"),

  // Fiscalité : portée par le contact (personne seule) OU synchronisée depuis le foyer.
  trancheImposition: text("tranche_imposition"),
  nombrePartsFiscales: real("nombre_parts_fiscales"),
  revenuFiscalReference: real("revenu_fiscal_reference"),
  irNetAPayer: real("ir_net_a_payer"),
  
  // Informations commerciales
  sourceLead: text("source_lead"),
  profilRisqueSri: integer("profil_risque_sri"), // 1 à 5
  
  // Suivi
  dateDernierContact: integer("date_dernier_contact", { mode: "timestamp" }),
  dateProchainSuivi: integer("date_prochain_suivi", { mode: "timestamp" }),
  statutSuivi: text("statut_suivi", {
    enum: ["ACTIF", "EN_PAUSE", "ARCHIVE"],
  })
    .default("ACTIF")
    .notNull(),

  // Funnel commercial (R1 → client)
  dateR1: integer("date_r1", { mode: "timestamp" }),
  // Funnel filleul (invitation JD / PO)
  typeInvitationFilleul: text("type_invitation_filleul"),
  dateInvitationFilleul: integer("date_invitation_filleul", { mode: "timestamp" }),
  dateInscriptionFilleul: integer("date_inscription_filleul", { mode: "timestamp" }),
  presenceInvitationFilleul: integer("presence_invitation_filleul"),
  filleulTitre: text("filleul_titre"),
  filleulQualification: text("filleul_qualification"),
  filleulVolume: real("filleul_volume"),
  filleulVolumeManager: real("filleul_volume_manager"),
  
  // Notes
  notes: text("notes"),

  familleRegroupementExclu: integer("famille_regroupement_exclu", { mode: "boolean" })
    .default(false)
    .notNull(),
  
  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  googleContactResourceName: text("google_contact_resource_name"),
  googleSyncedAt: integer("google_synced_at", { mode: "timestamp" }),
});

export const googleContactNameProposalDismissals = sqliteTable(
  "google_contact_name_proposal_dismissals",
  {
    contactId: integer("contact_id")
      .primaryKey()
      .references(() => contacts.id, { onDelete: "cascade" }),
    dismissedAt: integer("dismissed_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
  }
);

// ============================================
// PARTENAIRES (Fournisseurs de produits)
// ============================================
export const partenaires = sqliteTable("partenaires", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nom: text("nom").notNull(),
  typeProduit: text("type_produit", {
    enum: [
      // Immobilier - détaillé
      "PINEL",
      "DENORMANDIE",
      "JEANBRUN",
      "BESSON",
      "SCELLIER",
      "ROBIEN",
      "MEHAIGNERIE",
      "PERISSOL",
      "DUFLOT",
      "BORLOO",
      "MALRAUX",
      "MONUMENT_HISTORIQUE",
      "DEFICIT_FONCIER",
      "LMNP",
      "LMP",
      "NUE_PROPRIETE",
      "RESIDENCE_PRINCIPALE",
      "LOCATIF_CLASSIQUE",
      "IMMOBILIER", // Legacy - à migrer
      // SCPI
      "SCPI",
      "SCPI_DEMEMBREMENT",
      "SCPI_FISCALE",
      // Placements
      "ASSURANCE_VIE",
      "CONTRAT_CAPITALISATION",
      "PREVOYANCE",
      "PER",
      "EPARGNE_SALARIALE",
      "FIP_FCPI",
      "FCPR",
      "G3F",
      "AUTRE",
    ],
  }),
  contactCommercial: text("contact_commercial"),
  email: text("email"),
  telephone: text("telephone"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// INVESTISSEMENTS
// ============================================
export const investissements = sqliteTable("investissements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .references(() => contacts.id, { onDelete: "cascade" }), // Plus de notNull() pour supporter les investissements de foyer
  foyerId: integer("foyer_id").references(() => foyers.id, {
    onDelete: "set null",
  }), // Pour investissements communs
  
  // Produit
  typeProduit: text("type_produit", {
    enum: [
      // Immobilier - détaillé
      "PINEL",
      "DENORMANDIE",
      "JEANBRUN",
      "BESSON",
      "SCELLIER",
      "ROBIEN",
      "MEHAIGNERIE",
      "PERISSOL",
      "DUFLOT",
      "BORLOO",
      "MALRAUX",
      "MONUMENT_HISTORIQUE",
      "DEFICIT_FONCIER",
      "LMNP",
      "LMP",
      "NUE_PROPRIETE",
      "RESIDENCE_PRINCIPALE",
      "LOCATIF_CLASSIQUE",
      "IMMOBILIER", // Legacy - à migrer
      // SCPI
      "SCPI",
      "SCPI_DEMEMBREMENT",
      "SCPI_FISCALE",
      // Placements
      "ASSURANCE_VIE",
      "CONTRAT_CAPITALISATION",
      "PREVOYANCE",
      "PER",
      "EPARGNE_SALARIALE",
      "FIP_FCPI",
      "FCPR",
      "G3F",
      "AUTRE",
    ],
  }).notNull(),
  partenaireId: integer("partenaire_id").references(() => partenaires.id, {
    onDelete: "set null",
  }),
  nomProduit: text("nom_produit").notNull(),
  /** N° contrat assureur / Stellium (import perf mensuel). */
  numeroContrat: text("numero_contrat"),

  // Montants
  montantInitial: integer("montant_initial"), // En centimes
  
  // Dates
  dateSouscription: integer("date_souscription", { mode: "timestamp" }),
  dateFinDemembrement: integer("date_fin_demembrement", { mode: "timestamp" }), // Pour SCPI démembrées
  dateFinPret: integer("date_fin_pret", { mode: "timestamp" }),
  mensualiteCredit: integer("mensualite_credit"), // En centimes
  creditCrd: integer("credit_crd"), // En centimes
  loyerMensuel: integer("loyer_mensuel"), // En centimes
  prevoyancePerso: integer("prevoyance_perso", { mode: "boolean" })
    .default(false)
    .notNull(),
  prevoyancePro: integer("prevoyance_pro", { mode: "boolean" })
    .default(false)
    .notNull(),
  /** Cotisation mensuelle prévoyance (centimes), distincte des VP AV/PER/SCPI. */
  prevoyanceVersementMensuel: integer("prevoyance_versement_mensuel"),
  
  // Versements programmés
  versementProgramme: integer("versement_programme", { mode: "boolean" })
    .default(false)
    .notNull(),
  montantVersementProgramme: integer("montant_versement_programme"), // En centimes
  frequenceVersement: text("frequence_versement", {
    enum: ["MENSUEL", "TRIMESTRIEL", "SEMESTRIEL", "ANNUEL"],
  }),
  
  // Options
  reinvestissementDividendes: integer("reinvestissement_dividendes", {
    mode: "boolean",
  })
    .default(false)
    .notNull(),
  
  // Notes
  notes: text("notes"),
  
  // Origine de l'investissement (pour distinguer mes conseils vs patrimoine existant)
  origine: text("origine", {
    enum: ["MON_CONSEIL", "EXISTANT_CLIENT"],
  }).default("MON_CONSEIL").notNull(),

  /** ACTIF = dans l'encours ; CLOTURE = sorti de l'encours, conservé en stats. */
  statut: text("statut", {
    enum: ["ACTIF", "CLOTURE"],
  }).default("ACTIF").notNull(),
  dateCloture: integer("date_cloture", { mode: "timestamp" }),
  
  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const investissementVersements = sqliteTable("investissement_versements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  investissementId: integer("investissement_id")
    .notNull()
    .references(() => investissements.id, { onDelete: "cascade" }),
  montant: integer("montant").notNull(),
  dateVersement: integer("date_versement", { mode: "timestamp" }).notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const investissementValorisations = sqliteTable("investissement_valorisations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  investissementId: integer("investissement_id")
    .notNull()
    .references(() => investissements.id, { onDelete: "cascade" }),
  /** Encours / valorisation du contrat à date (centimes). */
  montant: integer("montant").notNull(),
  dateValorisation: integer("date_valorisation", { mode: "timestamp" }).notNull(),
  notes: text("notes"),
  /** Relevé Stellium — versements nets (≠ versements bruts CRM). */
  stelliumVersementsNetsCentimes: integer("stellium_versements_nets_centimes"),
  /** Relevé Stellium — performance financière en €. */
  stelliumPerfEuroCentimes: integer("stellium_perf_euro_centimes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// DOCUMENTS
// ============================================
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .references(() => contacts.id, { onDelete: "cascade" })
    .notNull(),
  foyerId: integer("foyer_id").references(() => foyers.id, {
    onDelete: "set null",
  }),
  
  typeDocument: text("type_document", {
    enum: [
      "RIO",
      "FICHE_PROFIL_RISQUE",
      "DER",
      "RELEVE_COMPTE",
      "RIB",
      "AVIS_IMPOSITION",
      "BULLETIN_SOUSCRIPTION",
      "LETTRE_MISSION",
      "RAPPORT_ADEQUATION",
      "FICHE_CONSEIL",
      "ANNEXE_DURABILITE",
      "AUTRE",
    ],
  }).notNull(),
  
  nomFichier: text("nom_fichier").notNull(),
  cheminFichier: text("chemin_fichier").notNull(),
  dateDocument: integer("date_document", { mode: "timestamp" }),
  sensibiliteExtraFinanciere: text("sensibilite_extra_financiere"),
  experienceInvestissement: text("experience_investissement"),
  hashFichier: text("hash_fichier"), // Pour vérifier l'intégrité
  
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// INTERACTIONS (Historique des échanges)
// ============================================
export const interactions = sqliteTable("interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .references(() => contacts.id, { onDelete: "cascade" })
    .notNull(),
  
  typeInteraction: text("type_interaction", {
    enum: ["EMAIL_ENVOYE", "EMAIL_RECU", "APPEL", "RDV", "NOTE"],
  }).notNull(),
  
  sujet: text("sujet"),
  contenu: text("contenu"),
  dateInteraction: integer("date_interaction", { mode: "timestamp" }).notNull(),
  
  emailId: integer("email_id").references(() => emails.id, {
    onDelete: "set null",
  }),
  
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// EMAILS
// ============================================
export const emails = sqliteTable("emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .references(() => contacts.id, { onDelete: "cascade" })
    .notNull(),
  interactionId: integer("interaction_id"),

  sujet: text("sujet").notNull(),
  corps: text("corps").notNull(),
  de: text("de").notNull(),
  a: text("a").notNull(),
  dateEnvoi: integer("date_envoi", { mode: "timestamp" }),
  
  statut: text("statut", {
    enum: ["BROUILLON", "ENVOYE", "ERREUR"],
  })
    .default("BROUILLON")
    .notNull(),
  
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// TEMPLATES D'EMAIL
// ============================================
export const templatesEmail = sqliteTable("templates_email", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nom: text("nom").notNull(),
  sujet: text("sujet").notNull(),
  corps: text("corps").notNull(),
  
  categorie: text("categorie", {
    enum: [
      "SUIVI_ANNUEL",
      "ARBITRAGE",
      "FISCALITE",
      "BIENVENUE",
      "RELANCE",
      "AUTRE",
    ],
  }).notNull(),
  
  variables: text("variables", { mode: "json" }), // JSON array des variables disponibles
  
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// PLACEMENT OPERATIONS (Box Placement Stellium)
// ============================================
export const placementOperations = sqliteTable("placement_operations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .references(() => contacts.id, { onDelete: "cascade" })
    .notNull(),
  pipeId: integer("pipe_id"),
  pipeTimelineEntryId: integer("pipe_timeline_entry_id"),
  operationType: text("operation_type").notNull(),
  productLabel: text("product_label"),
  stelliumLabel: text("stellium_label"),
  status: text("status", {
    enum: ["PENDING", "CONFORME", "NON_CONFORME"],
  })
    .notNull()
    .default("PENDING"),
  gmailMessageId: text("gmail_message_id"),
  emailSubject: text("email_subject"),
  emailReceivedAt: integer("email_received_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ============================================
// ALERTES
// ============================================
export const alertes = sqliteTable("alertes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .references(() => contacts.id, { onDelete: "cascade" })
    .notNull(),
  
  typeAlerte: text("type_alerte", {
    enum: [
      "SUIVI_CLIENT_ANNUEL",
      "SUIVI_PROSPECT_6MOIS",
      "FIN_DEMEMBREMENT",
      "ANNIVERSAIRE",
      "WORKFLOW",
    ],
  }).notNull(),
  
  message: text("message").notNull(),
  dateAlerte: integer("date_alerte", { mode: "timestamp" }).notNull(),
  
  lue: integer("lue", { mode: "boolean" }).default(false).notNull(),
  traitee: integer("traitee", { mode: "boolean" }).default(false).notNull(),
  
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// PARAMÈTRES
// ============================================
export const parametres = sqliteTable("parametres", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cle: text("cle").notNull().unique(),
  valeur: text("valeur", { mode: "json" }).notNull(), // JSON pour stocker n'importe quelle valeur
  
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// COMPTABILITÉ (runtime : migrations Rust + settings)
// ============================================
export const comptaDepenses = sqliteTable("compta_depenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  categorie: text("categorie").notNull(),
  tiers: text("tiers").notNull(),
  ttc: real("ttc").notNull(),
  tva: real("tva").notNull(),
  ht: real("ht").notNull(),
  lienDrive: text("lien_drive"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const comptaEncaissements = sqliteTable("compta_encaissements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  client: text("client").notNull(),
  date: text("date").notNull(),
  exonere: real("exonere").notNull(),
  ht: real("ht").notNull(),
  tva: real("tva").notNull(),
  ttc: real("ttc").notNull(),
  total: real("total").notNull(),
  don: real("don").notNull(),
  isPartenaire: integer("is_partenaire", { mode: "boolean" }).notNull(),
  lienDrive: text("lien_drive"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const comptaDeplacements = sqliteTable("compta_deplacements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  destination: text("destination").notNull(),
  objet: text("objet").notNull(),
  km: real("km").notNull(),
  indemnite: real("indemnite").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Types TypeScript pour l'utilisation dans l'application
export type Foyer = typeof foyers.$inferSelect;
export type NewFoyer = typeof foyers.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

export type Partenaire = typeof partenaires.$inferSelect;
export type NewPartenaire = typeof partenaires.$inferInsert;

export type Investissement = typeof investissements.$inferSelect;
export type NewInvestissement = typeof investissements.$inferInsert;

export type InvestissementValorisation = typeof investissementValorisations.$inferSelect;
export type NewInvestissementValorisation = typeof investissementValorisations.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;

export type TemplateEmail = typeof templatesEmail.$inferSelect;
export type NewTemplateEmail = typeof templatesEmail.$inferInsert;

export type Alerte = typeof alertes.$inferSelect;
export type NewAlerte = typeof alertes.$inferInsert;

export type PlacementOperation = typeof placementOperations.$inferSelect;
export type NewPlacementOperation = typeof placementOperations.$inferInsert;

export type Parametre = typeof parametres.$inferSelect;
export type NewParametre = typeof parametres.$inferInsert;
