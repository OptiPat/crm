PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_alertes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`type_alerte` text NOT NULL,
	`message` text NOT NULL,
	`date_alerte` integer NOT NULL,
	`lue` integer DEFAULT false NOT NULL,
	`traitee` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_alertes`("id", "contact_id", "type_alerte", "message", "date_alerte", "lue", "traitee", "created_at") SELECT "id", "contact_id", "type_alerte", "message", "date_alerte", "lue", "traitee", "created_at" FROM `alertes`;--> statement-breakpoint
DROP TABLE `alertes`;--> statement-breakpoint
ALTER TABLE `__new_alertes` RENAME TO `alertes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_investissements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`foyer_id` integer,
	`type_produit` text NOT NULL,
	`partenaire_id` integer,
	`nom_produit` text NOT NULL,
	`montant_initial` integer,
	`date_souscription` integer,
	`date_fin_demembrement` integer,
	`versement_programme` integer DEFAULT false NOT NULL,
	`montant_versement_programme` integer,
	`frequence_versement` text,
	`reinvestissement_dividendes` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`foyer_id`) REFERENCES `foyers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`partenaire_id`) REFERENCES `partenaires`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_investissements`("id", "contact_id", "foyer_id", "type_produit", "partenaire_id", "nom_produit", "montant_initial", "date_souscription", "date_fin_demembrement", "versement_programme", "montant_versement_programme", "frequence_versement", "reinvestissement_dividendes", "notes", "created_at", "updated_at") SELECT "id", "contact_id", "foyer_id", "type_produit", "partenaire_id", "nom_produit", "montant_initial", "date_souscription", "date_fin_demembrement", "versement_programme", "montant_versement_programme", "frequence_versement", "reinvestissement_dividendes", "notes", "created_at", "updated_at" FROM `investissements`;--> statement-breakpoint
DROP TABLE `investissements`;--> statement-breakpoint
ALTER TABLE `__new_investissements` RENAME TO `investissements`;--> statement-breakpoint

-- Initialisation des partenaires par défaut
-- Assureurs
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('ASSUREUR', 'Oddo', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('ASSUREUR', 'Vie Plus', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('ASSUREUR', 'Apicil', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('ASSUREUR', 'Eres Swisslife', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('ASSUREUR', 'Eres Spirica', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('ASSUREUR', 'Eres Entreprise', unixepoch(), unixepoch());

-- Sociétés de gestion SCPI
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Advenis', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Altarea IM', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Alderan', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Voisin', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Sofidy', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Norma Capital', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Mata Capital', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Perial AM', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Arkea Reim', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'Atream', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_SCPI', 'La Française', unixepoch(), unixepoch());

-- Promoteurs
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Cogedim', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Colosseum', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Histoire & Patrimoine', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'CIR', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Caractere', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Edouard Denis', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Tagerim', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Corim', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Urbis', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Bouygues Immobilier', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Sporting Promotion', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('PROMOTEUR', 'Helenis', unixepoch(), unixepoch());

-- Sociétés de gestion FIP/FCPI/FCPR
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_FIP', 'Odyssée Venture', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_FIP', 'Elevation', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_FIP', 'NextStage', unixepoch(), unixepoch());
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('SOCIETE_GESTION_FIP', 'Eiffeil', unixepoch(), unixepoch());

-- G3F
INSERT OR IGNORE INTO partenaires (type_partenaire, raison_sociale, created_at, updated_at) VALUES ('G3F', 'Inter Invest', unixepoch(), unixepoch());