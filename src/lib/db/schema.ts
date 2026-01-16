import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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
  
  // Catégorie et informations de base
  categorie: text("categorie", {
    enum: [
      "CLIENT",
      "PROSPECT_CLIENT",
      "PROSPECT_FILLEUL",
      "SUSPECT_CLIENT",
      "SUSPECT_FILLEUL",
    ],
  })
    .notNull()
    .default("SUSPECT_CLIENT"),
  civilite: text("civilite", { enum: ["M", "MME", "AUTRE"] }),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  
  // Coordonnées
  email: text("email"),
  telephone: text("telephone"),
  adresse: text("adresse"),
  codePostal: text("code_postal"),
  ville: text("ville"),
  
  // Informations personnelles
  dateNaissance: integer("date_naissance", { mode: "timestamp" }),
  profession: text("profession"),
  situationFamiliale: text("situation_familiale", {
    enum: ["CELIBATAIRE", "MARIE", "PACSE", "DIVORCE", "VEUF", "AUTRE"],
  }),
  
  // Informations commerciales
  sourceLead: text("source_lead"),
  profilRisqueSri: integer("profil_risque_sri"), // 1 à 7
  
  // Suivi
  dateDernierContact: integer("date_dernier_contact", { mode: "timestamp" }),
  dateProchainSuivi: integer("date_prochain_suivi", { mode: "timestamp" }),
  statutSuivi: text("statut_suivi", {
    enum: ["ACTIF", "EN_PAUSE", "ARCHIVE"],
  })
    .default("ACTIF")
    .notNull(),
  
  // Notes
  notes: text("notes"),
  
  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// ============================================
// PARTENAIRES (Fournisseurs de produits)
// ============================================
export const partenaires = sqliteTable("partenaires", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nom: text("nom").notNull(),
  typeProduit: text("type_produit", {
    enum: [
      "IMMOBILIER",
      "SCPI",
      "SCPI_DEMEMBREMENT",
      "ASSURANCE_VIE",
      "FIP_FCPI",
      "FCPR",
      "PER",
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
    .references(() => contacts.id, { onDelete: "cascade" })
    .notNull(),
  foyerId: integer("foyer_id").references(() => foyers.id, {
    onDelete: "set null",
  }), // Pour investissements communs
  
  // Produit
  typeProduit: text("type_produit", {
    enum: [
      "IMMOBILIER",
      "SCPI",
      "SCPI_DEMEMBREMENT",
      "ASSURANCE_VIE",
      "FIP_FCPI",
      "FCPR",
      "PER",
      "G3F",
      "AUTRE",
    ],
  }).notNull(),
  partenaireId: integer("partenaire_id").references(() => partenaires.id, {
    onDelete: "set null",
  }),
  nomProduit: text("nom_produit").notNull(),
  
  // Montants
  montantInitial: integer("montant_initial"), // En centimes
  
  // Dates
  dateSouscription: integer("date_souscription", { mode: "timestamp" }),
  dateFinDemembrement: integer("date_fin_demembrement", { mode: "timestamp" }), // Pour SCPI démembrées
  
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
  
  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
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
  
  messageIdSmtp: text("message_id_smtp"),
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

// Types TypeScript pour l'utilisation dans l'application
export type Foyer = typeof foyers.$inferSelect;
export type NewFoyer = typeof foyers.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

export type Partenaire = typeof partenaires.$inferSelect;
export type NewPartenaire = typeof partenaires.$inferInsert;

export type Investissement = typeof investissements.$inferSelect;
export type NewInvestissement = typeof investissements.$inferInsert;

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

export type Parametre = typeof parametres.$inferSelect;
export type NewParametre = typeof parametres.$inferInsert;
